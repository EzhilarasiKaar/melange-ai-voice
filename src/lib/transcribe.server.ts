// Server-only transcription helper.
//
// Transcribes the small audio-only copy of a recording (roughly 1 MB per
// minute) instead of the video, so the serverless memory budget is never
// close to being exhausted.

const MAX_AUDIO_BYTES = 24 * 1024 * 1024; // Gateway body cap is 25MB
const TRANSCRIPTION_MODEL = "openai/gpt-4o-transcribe";
const TRANSCRIPTION_ENDPOINT = "https://ai.gateway.lovable.dev/v1/audio/transcriptions";

export type TranscriptSegment = { start: number; end: number; text: string };

export type TranscribeResult = {
  status: "done" | "failed" | "skipped";
  transcript: string | null;
  segments: TranscriptSegment[] | null;
  error?: string;
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function retryDelayMs(response: Response, attempt: number) {
  const retryAfter = response.headers.get("Retry-After");
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds) && seconds > 0) return seconds * 1000;
  }
  return Math.min(8000, 1000 * 2 ** attempt) + Math.floor(Math.random() * 250);
}

function extractErrorMessage(status: number, body: string) {
  if (!body.trim()) return `Transcription failed with status ${status}`;
  try {
    const parsed = JSON.parse(body) as { message?: string; error?: { message?: string } | string };
    if (typeof parsed.message === "string") return parsed.message;
    if (typeof parsed.error === "string") return parsed.error;
    if (typeof parsed.error?.message === "string") return parsed.error.message;
  } catch {
    // Fall through to plain text.
  }
  return body.slice(0, 500);
}

async function readStreamingTranscript(response: Response) {
  if (!response.body) return "";

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let transcript = "";
  let doneText = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const events = buffer.split("\n\n");
    buffer = events.pop() ?? "";
    for (const event of events) {
      for (const line of event.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) continue;
        const payload = trimmed.slice(5).trim();
        if (!payload || payload === "[DONE]") continue;
        try {
          const parsed = JSON.parse(payload) as {
            type?: string;
            delta?: string;
            text?: string;
          };
          if (parsed.type === "transcript.text.delta" && parsed.delta) {
            transcript += parsed.delta;
          }
          if (parsed.type === "transcript.text.done" && parsed.text) {
            doneText = parsed.text;
          }
        } catch {
          // Ignore malformed SSE data lines; the final empty transcript guard
          // below will surface a clear failure if no usable text arrives.
        }
      }
    }
  }

  return (doneText || transcript).trim();
}

async function requestTranscription(form: FormData): Promise<Response> {
  const key = process.env["LOVABLE_API_KEY"];
  if (!key) throw new Error("LOVABLE_API_KEY missing");

  let lastResponse: Response | null = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    const response = await fetch(TRANSCRIPTION_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
      },
      body: form,
    });
    if (response.ok) return response;

    lastResponse = response;
    if (response.status !== 429 && response.status < 500) return response;
    if (attempt < 2) await sleep(retryDelayMs(response, attempt));
  }

  return lastResponse ?? new Response("Transcription request failed", { status: 500 });
}

export function estimateTranscriptSegments(text: string, durationSeconds: number | null | undefined) {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const parts = trimmed.match(/[^.!?]+[.!?]+|\S[^.!?]*$/g)?.map((part) => part.trim()).filter(Boolean) ?? [trimmed];
  const duration = Math.max(1, Number(durationSeconds ?? 0) || parts.length * 4);
  const totalChars = Math.max(1, parts.reduce((sum, part) => sum + part.length, 0));
  let cursor = 0;

  return parts.map((part, index) => {
    const share = index === parts.length - 1 ? duration - cursor : Math.max(1, (part.length / totalChars) * duration);
    const start = cursor;
    const end = index === parts.length - 1 ? duration : Math.min(duration, cursor + share);
    cursor = end;
    return { start, end: Math.max(start + 0.5, end), text: part };
  });
}

export async function transcribeAudioPath(audioPath: string): Promise<TranscribeResult> {
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
  form.append("model", TRANSCRIPTION_MODEL);
  form.append("stream", "true");

  let res: Response;
  try {
    res = await requestTranscription(form);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Transcription request failed";
    return { status: "failed", transcript: null, segments: null, error: message };
  }

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    const message = extractErrorMessage(res.status, body);
    console.error("transcription failed", res.status, message);
    return { status: "failed", transcript: null, segments: null, error: message };
  }

  const text = await readStreamingTranscript(res);

  if (!text) {
    return { status: "failed", transcript: null, segments: null, error: "empty transcript" };
  }

  return {
    status: "done",
    transcript: text,
    segments: null,
  };
}

export async function transcribeRecordingRow(recordingId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: rec, error } = await supabaseAdmin
    .from("interview_recordings")
    .select("id, audio_path, duration_seconds")
    .eq("id", recordingId)
    .single();
  if (error || !rec) throw new Error(error?.message ?? "recording not found");
  if (!rec.audio_path) {
    return { status: "failed" as const, transcript: null, error: "no audio stored for this recording" };
  }

  const result = await transcribeAudioPath(rec.audio_path);
  const segments = result.transcript
    ? estimateTranscriptSegments(result.transcript, rec.duration_seconds)
    : null;
  await supabaseAdmin
    .from("interview_recordings")
    .update({
      transcript: result.transcript,
      transcript_segments: result.segments ?? segments,
      transcript_status: result.status === "done" ? "done" : "failed",
    })
    .eq("id", recordingId);

  return { status: result.status, transcript: result.transcript, error: result.error };
}
