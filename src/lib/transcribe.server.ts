// Server-only transcription helper.
//
// Transcribes the small audio-only copy of a recording (roughly 1 MB per
// minute) instead of the video, so the serverless memory budget is never
// close to being exhausted.

const MAX_AUDIO_BYTES = 24 * 1024 * 1024; // whisper API hard limit is 25MB

export type TranscriptSegment = { start: number; end: number; text: string };

export type TranscribeResult = {
  status: "done" | "failed" | "skipped";
  transcript: string | null;
  segments: TranscriptSegment[] | null;
  error?: string;
};

export async function transcribeAudioPath(audioPath: string): Promise<TranscribeResult> {
  const key = process.env["LOVABLE_API_KEY"];
  if (!key) {
    return { status: "failed", transcript: null, segments: null, error: "LOVABLE_API_KEY missing" };
  }

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: file, error } = await supabaseAdmin.storage
    .from("interview-recordings")
    .download(audioPath);
  if (error || !file) {
    return {
      status: "failed",
      transcript: null,
      segments: null,
      error: error?.message ?? "audio download failed",
    };
  }
  if (file.size <= 0) {
    return { status: "failed", transcript: null, segments: null, error: "empty audio file" };
  }
  if (file.size > MAX_AUDIO_BYTES) {
    return { status: "skipped", transcript: null, segments: null, error: "audio too large" };
  }

  const ext = audioPath.split(".").pop() || "webm";
  const form = new FormData();
  form.append("file", file, `audio.${ext}`);
  form.append("model", "whisper-1");
  form.append("response_format", "verbose_json");

  const res = await fetch("https://ai.gateway.lovable.dev/v1/audio/transcriptions", {
    method: "POST",
    headers: {
      "Lovable-API-Key": key,
      Authorization: `Bearer ${key}`,
    },
    body: form,
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    console.error("transcription failed", res.status, body.slice(0, 500));
    return { status: "failed", transcript: null, segments: null, error: `${res.status}` };
  }

  const json = (await res.json().catch(() => null)) as
    | {
        text?: string;
        segments?: Array<{ start?: number; end?: number; text?: string }>;
      }
    | null;

  const text = json?.text?.trim() ?? "";
  const segments: TranscriptSegment[] = (json?.segments ?? [])
    .map((s) => ({
      start: Number(s.start ?? 0),
      end: Number(s.end ?? 0),
      text: (s.text ?? "").trim(),
    }))
    .filter((s) => s.text.length > 0);

  if (!text) {
    return { status: "failed", transcript: null, segments: null, error: "empty transcript" };
  }

  return {
    status: "done",
    transcript: text,
    segments: segments.length > 0 ? segments : null,
  };
}

export async function transcribeRecordingRow(recordingId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: rec, error } = await supabaseAdmin
    .from("interview_recordings")
    .select("id, audio_path")
    .eq("id", recordingId)
    .single();
  if (error || !rec) throw new Error(error?.message ?? "recording not found");
  if (!rec.audio_path) {
    return { status: "failed" as const, transcript: null, error: "no audio stored for this recording" };
  }

  const result = await transcribeAudioPath(rec.audio_path);
  await supabaseAdmin
    .from("interview_recordings")
    .update({
      transcript: result.transcript,
      transcript_segments: result.segments,
      transcript_status: result.status === "done" ? "done" : "failed",
    })
    .eq("id", recordingId);

  return { status: result.status, transcript: result.transcript, error: result.error };
}
