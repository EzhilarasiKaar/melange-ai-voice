import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  getInvitationByToken,
  acceptConsent,
  finalizeInterview,
} from "@/lib/interview-public.functions";
import { useEffect, useRef, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Card } from "@/components/ui/card";
import {
  Video,
  Mic,
  Camera,
  CheckCircle2,
  Square,
  RotateCcw,
  ArrowRight,
  Volume2,
} from "lucide-react";
import { toast } from "sonner";
import kaartechLogo from "@/assets/kaartech-logo.png.asset.json";

export const Route = createFileRoute("/interview/$token")({
  ssr: false,
  component: InterviewPage,
});

type Question = {
  id: string;
  position: number;
  prompt: string;
  follow_up_prompt: string | null;
  follow_up_keywords: string[];
};

type Step =
  | { name: "welcome" }
  | { name: "permissions" }
  | { name: "preview" }
  | { name: "interview" }
  | { name: "submitting" }
  | { name: "done" };


function InterviewPage() {
  const { token } = Route.useParams();
  const getFn = useServerFn(getInvitationByToken);
  const consentFn = useServerFn(acceptConsent);
  const finalizeFn = useServerFn(finalizeInterview);

  const { data } = useSuspenseQuery({
    queryKey: ["invitation", token],
    queryFn: () => getFn({ data: { token } }),
  });

  if ("notFound" in data) return <StateScreen title="Invitation not found" body="This link is invalid or has been removed." />;
  if ("cancelled" in data) return <StateScreen title="Invitation cancelled" body="Please contact the Melange editorial team." />;
  if ("expired" in data) return <StateScreen title="Invitation expired" body="This interview link has expired." />;
  if ("completed" in data) return <StateScreen title="Interview already submitted" body="Thank you — your interview has been received." variant="success" />;

  return (
    <Interview
      token={token}
      invitation={data.invitation}
      questions={data.questions as Question[]}
      onConsent={() => consentFn({ data: { token } })}
      onFinalize={() => finalizeFn({ data: { token } })}
    />
  );
}

function StateScreen({
  title,
  body,
  variant = "default",
}: {
  title: string;
  body: string;
  variant?: "default" | "success";
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-6">
      <div className="max-w-md text-center">
        {variant === "success" && (
          <CheckCircle2 className="mx-auto mb-4 size-12 text-primary" />
        )}
        <h1 className="font-display text-3xl">{title}</h1>
        <p className="mt-3 text-muted-foreground">{body}</p>
      </div>
    </div>
  );
}

function Interview({
  token,
  invitation,
  questions,
  onConsent,
  onFinalize,
}: {
  token: string;
  invitation: {
    leader_name: string;
    interview_templates: {
      name: string;
      description: string | null;
      max_duration_seconds: number;
      allow_retries: boolean;
      allow_pause: boolean;
    } | null;
  };
  questions: Question[];
  onConsent: () => Promise<unknown>;
  onFinalize: () => Promise<unknown>;
}) {
  const template = invitation.interview_templates!;
  const maxDuration = template?.max_duration_seconds ?? 300;

  const [step, setStep] = useState<Step>({ name: "welcome" });
  const [consent, setConsent] = useState(false);

  // Ordered list of questions to ask (with follow-ups inserted)
  const [queue, setQueue] = useState<Array<Question & { isFollowUp?: boolean }>>(questions);
  const [currentIdx, setCurrentIdx] = useState(0);

  // Media
  const streamRef = useRef<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [permissionsReady, setPermissionsReady] = useState(false);

  // Recording state per question
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const recordingStartedAtRef = useRef<number>(0);
  const stopTimerRef = useRef<number | null>(null);
  const isStoppingRef = useRef(false);
  const [phase, setPhase] = useState<"speaking" | "recording" | "processing" | "review">("speaking");
  const [elapsed, setElapsed] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [lastTranscript, setLastTranscript] = useState<string | null>(null);

  const cleanupMedia = useCallback(() => {
    if (stopTimerRef.current !== null) {
      window.clearTimeout(stopTimerRef.current);
      stopTimerRef.current = null;
    }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  useEffect(() => cleanupMedia, [cleanupMedia]);

  // Elapsed timer
  useEffect(() => {
    if (phase !== "recording") return;
    const t = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(t);
  }, [phase]);

  // Safety auto-stop at max duration. The exact timeout is also scheduled
  // when recording starts so the captured video is always stopped and saved.
  useEffect(() => {
    if (phase === "recording" && elapsed >= maxDuration) {
      stopRecording();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [elapsed, phase, maxDuration]);

  async function requestPermissions() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 1280, height: 720 },
        audio: true,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play().catch(() => {});
      }
      setPermissionsReady(true);
    } catch (err) {
      toast.error("Camera and microphone are required to continue.");
      console.error(err);
    }
  }

  async function handleStart() {
    if (!consent) {
      toast.error("Please give recording consent to continue.");
      return;
    }
    await onConsent().catch(() => {});
    setStep({ name: "permissions" });
  }

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioUrlRef = useRef<string | null>(null);

  async function fetchTtsBlob(text: string): Promise<string | null> {
    try {
      const res = await fetch("/api/public/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      if (!res.ok) throw new Error(await res.text().catch(() => "TTS failed"));
      const blob = await res.blob();
      return URL.createObjectURL(blob);
    } catch (err) {
      console.error("TTS failed", err);
      return null;
    }
  }

  function playAudio(url: string): Promise<void> {
    return new Promise((resolve) => {
      if (!audioRef.current) {
        audioRef.current = new Audio();
      }
      const a = audioRef.current;
      a.src = url;
      a.onended = () => resolve();
      a.onerror = () => resolve();
      a.play().catch(() => resolve());
    });
  }

  async function speak(text: string): Promise<void> {
    // Stop any playing audio
    if (audioRef.current) {
      audioRef.current.pause();
    }
    if (audioUrlRef.current) {
      URL.revokeObjectURL(audioUrlRef.current);
      audioUrlRef.current = null;
    }
    const url = await fetchTtsBlob(text);
    if (!url) {
      // Fallback to browser speech synthesis
      return new Promise((resolve) => {
        if (typeof window === "undefined" || !("speechSynthesis" in window)) {
          resolve();
          return;
        }
        window.speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance(text);
        u.rate = 0.92;
        u.onend = () => resolve();
        u.onerror = () => resolve();
        window.speechSynthesis.speak(u);
      });
    }
    audioUrlRef.current = url;
    await playAudio(url);
  }

  async function replayQuestion() {
    const q = queue[currentIdx];
    if (!q) return;
    if (audioUrlRef.current) {
      await playAudio(audioUrlRef.current);
      return;
    }
    const url = await fetchTtsBlob(q.prompt);
    if (url) {
      audioUrlRef.current = url;
      await playAudio(url);
    }
  }

  // Audio-only companion recording (small — used for transcription)
  const audioRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<BlobPart[]>([]);
  const audioBlobPromiseRef = useRef<Promise<Blob | null> | null>(null);

  function beginAudioRecording() {
    audioChunksRef.current = [];
    audioRecorderRef.current = null;
    audioBlobPromiseRef.current = null;
    const tracks = streamRef.current?.getAudioTracks() ?? [];
    if (tracks.length === 0) return;
    try {
      const audioStream = new MediaStream(tracks);
      let mime = "audio/webm;codecs=opus";
      if (!MediaRecorder.isTypeSupported(mime)) mime = "audio/webm";
      if (!MediaRecorder.isTypeSupported(mime)) mime = "";
      const arec = mime
        ? new MediaRecorder(audioStream, { mimeType: mime, audioBitsPerSecond: 64000 })
        : new MediaRecorder(audioStream);
      audioRecorderRef.current = arec;
      audioBlobPromiseRef.current = new Promise<Blob | null>((resolve) => {
        arec.ondataavailable = (e) => {
          if (e.data && e.data.size > 0) audioChunksRef.current.push(e.data);
        };
        arec.onstop = () => {
          const blob = new Blob(audioChunksRef.current, {
            type: arec.mimeType || "audio/webm",
          });
          audioChunksRef.current = [];
          resolve(blob.size > 0 ? blob : null);
        };
        arec.onerror = () => resolve(null);
      });
      arec.start(1000);
    } catch (err) {
      console.error("audio recorder failed", err);
      audioRecorderRef.current = null;
      audioBlobPromiseRef.current = null;
    }
  }

  async function collectAudioBlob(): Promise<Blob | null> {
    const arec = audioRecorderRef.current;
    if (!arec || !audioBlobPromiseRef.current) return null;
    try {
      if (arec.state === "recording") arec.requestData();
    } catch {
      // ignore
    }
    if (arec.state !== "inactive") arec.stop();
    const timeout = new Promise<null>((r) => window.setTimeout(() => r(null), 8000));
    return Promise.race([audioBlobPromiseRef.current, timeout]);
  }

  async function beginRecording() {
    if (!streamRef.current) return;
    chunksRef.current = [];
    isStoppingRef.current = false;
    recordingStartedAtRef.current = Date.now();
    if (stopTimerRef.current !== null) {
      window.clearTimeout(stopTimerRef.current);
      stopTimerRef.current = null;
    }
    let mimeType = "video/webm;codecs=vp9,opus";
    if (!MediaRecorder.isTypeSupported(mimeType)) mimeType = "video/webm";
    if (!MediaRecorder.isTypeSupported(mimeType)) mimeType = "";
    const rec = mimeType
      ? new MediaRecorder(streamRef.current, { mimeType })
      : new MediaRecorder(streamRef.current);
    recorderRef.current = rec;
    rec.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
    };
    rec.onstop = async () => {
      if (stopTimerRef.current !== null) {
        window.clearTimeout(stopTimerRef.current);
        stopTimerRef.current = null;
      }
      const type = rec.mimeType || "video/webm";
      const blob = new Blob(chunksRef.current, { type });
      const durationSeconds = Math.max(
        1,
        Math.round((Date.now() - recordingStartedAtRef.current) / 1000),
      );
      chunksRef.current = [];
      setPhase("processing");
      const audioBlob = await collectAudioBlob();
      await uploadBlob(blob, durationSeconds, audioBlob);
    };
    // Flush chunks every second so data survives even if the final chunk is delayed
    rec.start(1000);
    beginAudioRecording();
    setElapsed(0);
    setPhase("recording");
    stopTimerRef.current = window.setTimeout(() => {
      stopRecording();
    }, Math.max(1, maxDuration) * 1000);
  }


  function stopRecording() {
    const rec = recorderRef.current;
    if (!rec || rec.state === "inactive") return;
    if (isStoppingRef.current) return;
    isStoppingRef.current = true;
    try {
      if (rec.state === "recording") rec.requestData();
    } catch {
      // Some browsers can throw if requestData races with stop; stop still
      // emits the final dataavailable event.
    }
    window.setTimeout(() => {
      if (rec.state !== "inactive") rec.stop();
    }, 100);
  }

  async function askCurrent() {
    const q = queue[currentIdx];
    if (!q) return;
    setPhase("speaking");
    setLastTranscript(null);
    await speak(q.prompt);
    await beginRecording();
  }

  // When entering interview step or moving to a new question, ask it.
  useEffect(() => {
    if (step.name !== "interview") return;
    // Re-attach live stream to the new video element in this view
    if (videoRef.current && streamRef.current && videoRef.current.srcObject !== streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
      videoRef.current.play().catch(() => {});
    }
    if (queue.length === 0) return;
    askCurrent();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step.name, currentIdx]);


  async function uploadBlob(blob: Blob, durationSeconds: number, audioBlob?: Blob | null) {
    setUploading(true);
    try {
      const q = queue[currentIdx];
      const mime = blob.type || "video/webm";
      if (!q) throw new Error("Missing question for recording");
      if (blob.size <= 0) throw new Error("No video data was captured");

      const { supabase } = await import("@/integrations/supabase/client");

      async function getUploadTarget(kind: "video" | "audio", mimeType: string) {
        const res = await fetch("/api/public/upload-recording", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "get_upload_url",
            token,
            kind,
            position: q!.position,
            is_follow_up: q!.isFollowUp,
            mime_type: mimeType,
          }),
        });
        if (!res.ok) throw new Error((await res.text().catch(() => "")) || "Upload URL failed");
        return (await res.json()) as { path: string; token: string };
      }

      // 1) Get a signed upload URL so we bypass the serverless request-body
      //    limits that a 4–5 minute video easily exceeds.
      const urlJson = await getUploadTarget("video", mime);

      // 2) Upload the video straight to Storage from the browser.
      const { error: upErr } = await supabase.storage
        .from("interview-recordings")
        .uploadToSignedUrl(urlJson.path, urlJson.token, blob, {
          contentType: mime,
          upsert: false,
        });
      if (upErr) throw new Error(upErr.message);

      // 2b) Upload the small audio-only copy used for transcription.
      let audioPath: string | null = null;
      if (audioBlob && audioBlob.size > 0) {
        try {
          const audioMime = audioBlob.type || "audio/webm";
          const audioTarget = await getUploadTarget("audio", audioMime);
          const { error: aErr } = await supabase.storage
            .from("interview-recordings")
            .uploadToSignedUrl(audioTarget.path, audioTarget.token, audioBlob, {
              contentType: audioMime,
              upsert: false,
            });
          if (aErr) throw new Error(aErr.message);
          audioPath = audioTarget.path;
        } catch (err) {
          console.error("audio upload failed", err);
        }
      }

      // 3) Finalize — inserts the DB row and transcribes from the audio copy.
      const finRes = await fetch("/api/public/upload-recording", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "finalize",
          token,
          question_id: q.id,
          position: q.position,
          is_follow_up: q.isFollowUp,
          storage_path: urlJson.path,
          audio_path: audioPath,
          mime_type: mime,
          size: blob.size,
          duration_seconds: durationSeconds,
        }),
      });
      if (!finRes.ok) throw new Error((await finRes.text().catch(() => "")) || "Upload failed");
      const json = (await finRes.json()) as { ok: true; recording: { transcript: string | null } };

      const transcript = json.recording?.transcript ?? null;
      setLastTranscript(transcript);

      // Determine follow-up (only for the primary question, not for follow-ups themselves)
      if (!q.isFollowUp && q.follow_up_prompt) {
        const shouldAsk =
          q.follow_up_keywords.length === 0 ||
          (transcript
            ? q.follow_up_keywords.some((kw) =>
                transcript.toLowerCase().includes(kw.toLowerCase()),
              )
            : false);
        if (shouldAsk) {
          setQueue((qq) => {
            const next = [...qq];
            next.splice(currentIdx + 1, 0, {
              ...q,
              prompt: q.follow_up_prompt!,
              isFollowUp: true,
              follow_up_prompt: null,
              follow_up_keywords: [],
            });
            return next;
          });
        }
      }
      setPhase("review");
    } catch (err) {
      console.error(err);
      toast.error("Failed to save recording. You can retry.");
      setPhase("review");
    } finally {
      setUploading(false);
    }
  }

  function nextQuestion() {
    if (currentIdx + 1 >= queue.length) {
      // Finalize
      setStep({ name: "submitting" });
      onFinalize()
        .then(() => {
          cleanupMedia();
          setStep({ name: "done" });
        })
        .catch(() => setStep({ name: "done" }));
      return;
    }
    setCurrentIdx((i) => i + 1);
  }

  async function retry() {
    if (phase === "recording") stopRecording();
    // Just re-ask
    askCurrent();
  }

  // ---------- Rendering ----------

  if (step.name === "welcome") {
    return (
      <PublicShell>
        <div className="mx-auto max-w-2xl px-6 py-16">
          <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
            {template.name}
          </p>
          <h1 className="mt-3 font-display text-5xl md:text-6xl">
            Welcome, {invitation.leader_name.split(" ")[0]}.
          </h1>
          <p className="mt-6 text-lg text-muted-foreground">
            This is your Melange interview. It takes about 15 minutes. Melange AI will read
            each question aloud, and your video and audio response will be recorded — one
            segment per question.
          </p>
          <ul className="mt-8 space-y-3 text-sm text-muted-foreground">
            {[
              "Please ensure you are in a quiet, well-lit environment.",
              "Your responses will be recorded and transcribed automatically.",
              "You'll have a chance to retry an answer before continuing.",
            ].map((l) => (
              <li key={l} className="flex gap-3">
                <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary" />
                {l}
              </li>
            ))}
          </ul>

          <label className="mt-10 flex cursor-pointer items-start gap-3 rounded-xl border border-border bg-surface p-4">
            <Checkbox
              checked={consent}
              onCheckedChange={(v) => setConsent(Boolean(v))}
              className="mt-0.5"
            />
            <span className="text-sm">
              I consent to my video and audio being recorded and transcribed for use by the
              Melange editorial team at KaarTech.
            </span>
          </label>

          <Button onClick={handleStart} size="lg" className="mt-8 rounded-full">
            Start interview <ArrowRight className="ml-2 size-4" />
          </Button>
        </div>
      </PublicShell>
    );
  }

  if (step.name === "permissions") {
    return (
      <PublicShell>
        <div className="mx-auto max-w-2xl px-6 py-16">
          <h1 className="font-display text-4xl">Camera &amp; microphone check</h1>
          <p className="mt-3 text-muted-foreground">
            We need access to your camera and microphone for the interview.
          </p>

          <div className="mt-8 overflow-hidden rounded-2xl border border-border bg-black">
            {permissionsReady ? (
              <video ref={videoRef} muted playsInline className="aspect-video w-full" />
            ) : (
              <div className="grid aspect-video place-items-center text-muted-foreground">
                <div className="text-center">
                  <Camera className="mx-auto size-8" />
                  <p className="mt-3 text-sm">Preview will appear here</p>
                </div>
              </div>
            )}
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            <div className="flex items-center gap-3 rounded-lg border border-border p-3 text-sm">
              <Video className={permissionsReady ? "size-4 text-primary" : "size-4 text-muted-foreground"} />
              Camera {permissionsReady ? "ready" : "pending"}
            </div>
            <div className="flex items-center gap-3 rounded-lg border border-border p-3 text-sm">
              <Mic className={permissionsReady ? "size-4 text-primary" : "size-4 text-muted-foreground"} />
              Microphone {permissionsReady ? "ready" : "pending"}
            </div>
          </div>

          <div className="mt-8 flex gap-3">
            {!permissionsReady ? (
              <Button onClick={requestPermissions} size="lg" className="rounded-full">
                Allow camera &amp; microphone
              </Button>
            ) : (
              <Button
                onClick={() => setStep({ name: "preview" })}
                size="lg"
                className="rounded-full"
              >
                Continue to preview <ArrowRight className="ml-2 size-4" />
              </Button>

            )}
          </div>
        </div>
      </PublicShell>
    );
  }

  if (step.name === "preview") {
    return (
      <PublicShell>
        <PreviewStep
          stream={streamRef.current}
          onBack={() => setStep({ name: "permissions" })}
          onContinue={() => setStep({ name: "interview" })}
        />
      </PublicShell>
    );
  }

  if (step.name === "submitting") {

    return (
      <PublicShell>
        <div className="flex min-h-[70vh] items-center justify-center">
          <div className="text-center">
            <div className="mx-auto size-10 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            <p className="mt-6 font-display text-2xl">Submitting your interview…</p>
            <p className="mt-2 text-sm text-muted-foreground">
              Generating transcript and editorial summary.
            </p>
          </div>
        </div>
      </PublicShell>
    );
  }

  if (step.name === "done") {
    return (
      <PublicShell>
        <div className="flex min-h-[70vh] items-center justify-center px-6">
          <div className="max-w-md text-center">
            <CheckCircle2 className="mx-auto size-14 text-primary" />
            <h1 className="mt-6 font-display text-4xl">Thank you.</h1>
            <p className="mt-3 text-muted-foreground">
              Your interview has been submitted successfully. The Melange editorial team
              will be in touch.
            </p>
            <Button
              className="mt-8 rounded-full"
              variant="outline"
              onClick={() => window.close()}
            >
              Finish
            </Button>
          </div>
        </div>
      </PublicShell>
    );
  }

  // Interview
  const q = queue[currentIdx];
  if (!q) {
    return (
      <StateScreen
        title="No questions yet"
        body="This interview template has no questions. Please contact the Melange editorial team."
      />
    );
  }
  const mm = Math.floor(elapsed / 60).toString().padStart(2, "0");
  const ss = (elapsed % 60).toString().padStart(2, "0");

  return (
    <PublicShell>
      <div className="mx-auto max-w-5xl px-6 py-10">
        <div className="mb-8 flex items-center justify-between text-xs uppercase tracking-[0.18em] text-muted-foreground">
          <span>
            Question {currentIdx + 1} of {queue.length}
            {q.isFollowUp && " · follow-up"}
          </span>
          <span>{template.name}</span>
        </div>

        <div className="grid gap-8 lg:grid-cols-[1fr,360px]">
          <div>
            <div className="flex items-start gap-4">
              <div className="grid size-12 shrink-0 place-items-center rounded-xl border border-border bg-white p-1.5">
                <img src={kaartechLogo.url} alt="KaarTech" className="h-full w-full object-contain" />
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Melange AI Interviewer
                </p>
                <h2 className="mt-2 font-display text-3xl leading-tight md:text-4xl">
                  {q.prompt}
                </h2>
              </div>
            </div>

            <div className="mt-10 flex flex-wrap items-center gap-4">
              {phase === "speaking" && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <span className="inline-flex size-2 animate-record rounded-full bg-primary" />
                  Reading question…
                </div>
              )}
              {phase === "recording" && (
                <>
                  <div className="flex items-center gap-2 text-sm">
                    <span className="inline-flex size-2.5 animate-record rounded-full bg-recording" />
                    <span className="font-medium">Recording</span>
                    <span className="text-muted-foreground">
                      {mm}:{ss} / {Math.floor(maxDuration / 60)}:{(maxDuration % 60).toString().padStart(2, "0")}
                    </span>
                  </div>
                  <Button
                    variant="outline"
                    onClick={replayQuestion}
                    className="rounded-full"
                  >
                    <Volume2 className="mr-2 size-4" /> Play question again
                  </Button>
                  <Button onClick={stopRecording} className="ml-auto rounded-full" size="lg">
                    <Square className="mr-2 size-4" /> Stop &amp; save
                  </Button>
                </>
              )}
              {phase === "processing" && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <div className="size-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                  {uploading ? "Uploading and transcribing…" : "Processing…"}
                </div>
              )}
              {phase === "review" && (
                <div className="flex flex-wrap items-center gap-3">
                  <Button variant="outline" onClick={retry} className="rounded-full">
                    <RotateCcw className="mr-2 size-4" /> Retry answer
                  </Button>
                  <Button onClick={nextQuestion} size="lg" className="rounded-full">
                    {currentIdx + 1 >= queue.length ? "Submit interview" : "Next question"}
                    <ArrowRight className="ml-2 size-4" />
                  </Button>
                </div>
              )}
            </div>

            {phase === "review" && lastTranscript && (
              <Card className="mt-6 border-border/70 bg-surface-muted p-4 shadow-none">
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Your answer (transcript)
                </p>
                <p className="mt-2 text-sm leading-relaxed">{lastTranscript}</p>
              </Card>
            )}
          </div>

          <div className="overflow-hidden rounded-2xl border border-border bg-black">
            <video ref={videoRef} muted playsInline className="aspect-video w-full object-cover" />
          </div>
        </div>
      </div>
    </PublicShell>
  );
}

function PublicShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border/60">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-6 py-4">
          <img src={kaartechLogo.url} alt="KaarTech" className="h-9 w-auto" />
          <div className="ml-2 hidden border-l border-border pl-3 leading-tight sm:block">
            <p className="text-sm font-semibold tracking-tight">Melange</p>
            <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
              AI Leadership Interviewer
            </p>
          </div>
        </div>
      </header>
      {children}
    </div>
  );
}

function PreviewStep({
  stream,
  onBack,
  onContinue,
}: {
  stream: MediaStream | null;
  onBack: () => void;
  onContinue: () => void;
}) {
  const videoEl = useRef<HTMLVideoElement | null>(null);
  const [level, setLevel] = useState(0);
  const [testing, setTesting] = useState(false);
  const [testBlobUrl, setTestBlobUrl] = useState<string | null>(null);
  const testRecRef = useRef<MediaRecorder | null>(null);
  const testChunksRef = useRef<BlobPart[]>([]);

  useEffect(() => {
    if (videoEl.current && stream) {
      videoEl.current.srcObject = stream;
      videoEl.current.play().catch(() => {});
    }
  }, [stream]);

  // Mic level meter
  useEffect(() => {
    if (!stream) return;
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    const ctx = new AudioCtx();
    const src = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    src.connect(analyser);
    const data = new Uint8Array(analyser.frequencyBinCount);
    let raf = 0;
    const tick = () => {
      analyser.getByteTimeDomainData(data);
      let sum = 0;
      for (let i = 0; i < data.length; i++) {
        const v = (data[i] - 128) / 128;
        sum += v * v;
      }
      const rms = Math.sqrt(sum / data.length);
      setLevel(Math.min(1, rms * 3));
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => {
      cancelAnimationFrame(raf);
      src.disconnect();
      ctx.close().catch(() => {});
    };
  }, [stream]);

  function startTestRecording() {
    if (!stream) return;
    if (testBlobUrl) {
      URL.revokeObjectURL(testBlobUrl);
      setTestBlobUrl(null);
    }
    testChunksRef.current = [];
    let mimeType = "video/webm;codecs=vp9,opus";
    if (!MediaRecorder.isTypeSupported(mimeType)) mimeType = "video/webm";
    if (!MediaRecorder.isTypeSupported(mimeType)) mimeType = "";
    const rec = mimeType
      ? new MediaRecorder(stream, { mimeType })
      : new MediaRecorder(stream);
    testRecRef.current = rec;
    rec.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) testChunksRef.current.push(e.data);
    };
    rec.onstop = () => {
      const blob = new Blob(testChunksRef.current, {
        type: rec.mimeType || "video/webm",
      });
      testChunksRef.current = [];
      setTestBlobUrl(URL.createObjectURL(blob));
      setTesting(false);
    };
    rec.start(500);
    setTesting(true);
    setTimeout(() => {
      if (testRecRef.current && testRecRef.current.state !== "inactive") {
        testRecRef.current.stop();
      }
    }, 5000);
  }

  function stopTestRecording() {
    const rec = testRecRef.current;
    if (rec && rec.state !== "inactive") rec.stop();
  }

  useEffect(() => {
    return () => {
      if (testBlobUrl) URL.revokeObjectURL(testBlobUrl);
    };
  }, [testBlobUrl]);

  return (
    <div className="mx-auto max-w-3xl px-6 py-16">
      <h1 className="font-display text-4xl">Preview your setup</h1>
      <p className="mt-3 text-muted-foreground">
        Check that you look and sound the way you want before we begin. Record a short
        test clip and play it back — nothing here is saved.
      </p>

      <div className="mt-8 overflow-hidden rounded-2xl border border-border bg-black">
        <video ref={videoEl} muted playsInline className="aspect-video w-full" />
      </div>

      <div className="mt-6">
        <div className="mb-2 flex items-center justify-between text-xs uppercase tracking-wider text-muted-foreground">
          <span className="flex items-center gap-2">
            <Mic className="size-3.5" /> Microphone level
          </span>
          <span>{testing ? "Recording test…" : "Speak to test"}</span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-surface-muted">
          <div
            className="h-full rounded-full bg-primary transition-[width] duration-75"
            style={{ width: `${Math.round(level * 100)}%` }}
          />
        </div>
      </div>

      <div className="mt-8 grid gap-6 md:grid-cols-2">
        <div className="rounded-xl border border-border p-4">
          <p className="text-sm font-medium">Record a 5-second test</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Optional. Confirms your camera and mic are capturing correctly.
          </p>
          <div className="mt-3 flex gap-2">
            {!testing ? (
              <Button
                variant="outline"
                onClick={startTestRecording}
                className="rounded-full"
                size="sm"
              >
                <Video className="mr-2 size-4" />
                {testBlobUrl ? "Record again" : "Start test"}
              </Button>
            ) : (
              <Button
                variant="outline"
                onClick={stopTestRecording}
                className="rounded-full"
                size="sm"
              >
                <Square className="mr-2 size-4" /> Stop
              </Button>
            )}
          </div>
        </div>
        <div className="rounded-xl border border-border p-4">
          <p className="text-sm font-medium">Playback</p>
          {testBlobUrl ? (
            <video
              src={testBlobUrl}
              controls
              playsInline
              className="mt-3 aspect-video w-full rounded-lg bg-black"
            />
          ) : (
            <p className="mt-3 text-xs text-muted-foreground">
              Your test clip will appear here.
            </p>
          )}
        </div>
      </div>

      <div className="mt-10 flex flex-wrap gap-3">
        <Button variant="outline" onClick={onBack} className="rounded-full">
          Back
        </Button>
        <Button onClick={onContinue} size="lg" className="rounded-full">
          I&apos;m ready — begin interview <ArrowRight className="ml-2 size-4" />
        </Button>
      </div>
    </div>
  );
}

