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
  Sparkles,
  Video,
  Mic,
  Camera,
  CheckCircle2,
  Square,
  RotateCcw,
  ArrowRight,
} from "lucide-react";
import { toast } from "sonner";

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
  const [phase, setPhase] = useState<"speaking" | "recording" | "processing" | "review">("speaking");
  const [elapsed, setElapsed] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [lastTranscript, setLastTranscript] = useState<string | null>(null);

  const cleanupMedia = useCallback(() => {
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

  // Auto-stop at max duration
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

  function speak(text: string): Promise<void> {
    return new Promise((resolve) => {
      if (typeof window === "undefined" || !("speechSynthesis" in window)) {
        resolve();
        return;
      }
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.rate = 0.98;
      u.pitch = 1;
      u.onend = () => resolve();
      u.onerror = () => resolve();
      window.speechSynthesis.speak(u);
      // Fallback: resolve after estimated max duration to avoid hangs
      setTimeout(() => resolve(), Math.min(20000, 3000 + text.length * 60));
    });
  }

  async function beginRecording() {
    if (!streamRef.current) return;
    chunksRef.current = [];
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
      const type = rec.mimeType || "video/webm";
      const blob = new Blob(chunksRef.current, { type });
      chunksRef.current = [];
      setPhase("processing");
      await uploadBlob(blob);
    };
    // Flush chunks every second so data survives even if the final chunk is delayed
    rec.start(1000);
    setElapsed(0);
    setPhase("recording");
  }

  function stopRecording() {
    const rec = recorderRef.current;
    if (!rec || rec.state === "inactive") return;
    rec.stop();
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


  async function uploadBlob(blob: Blob) {
    setUploading(true);
    try {
      const q = queue[currentIdx];
      const form = new FormData();
      form.append("token", token);
      form.append("question_id", q.id);
      form.append("position", String(q.position));
      form.append("is_follow_up", q.isFollowUp ? "true" : "false");
      const ext = (blob.type || "video/webm").includes("mp4") ? "mp4" : "webm";
      form.append("file", blob, `answer-${q.position}.${ext}`);
      const res = await fetch("/api/public/upload-recording", { method: "POST", body: form });
      if (!res.ok) {
        const t = await res.text().catch(() => "");
        throw new Error(t || "Upload failed");
      }
      const json = (await res.json()) as { ok: true; recording: { transcript: string | null } };
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
                onClick={() => setStep({ name: "interview" })}
                size="lg"
                className="rounded-full"
              >
                I&apos;m ready — begin <ArrowRight className="ml-2 size-4" />
              </Button>
            )}
          </div>
        </div>
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
              <div className="grid size-11 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground">
                <Sparkles className="size-5" />
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Melange AI
                </p>
                <h2 className="mt-2 font-display text-3xl leading-tight md:text-4xl">
                  {q.prompt}
                </h2>
              </div>
            </div>

            <div className="mt-10 flex items-center gap-4">
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
        <div className="mx-auto flex max-w-6xl items-center gap-2.5 px-6 py-5">
          <div className="grid size-8 place-items-center rounded-lg bg-primary text-primary-foreground">
            <Sparkles className="size-4" />
          </div>
          <div className="leading-tight">
            <p className="text-sm font-semibold tracking-tight">Melange</p>
            <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
              AI Interviewer
            </p>
          </div>
        </div>
      </header>
      {children}
    </div>
  );
}
