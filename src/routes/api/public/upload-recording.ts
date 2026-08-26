import { createFileRoute } from "@tanstack/react-router";

// JSON-based flow to bypass Cloudflare Worker request-body / memory limits.
//
// action="get_upload_url": returns { path, token } for supabase-js
//   uploadToSignedUrl() — the browser PUTs the video directly to Storage.
// action="finalize": records the interview_recordings row only. Do not
// download/process the uploaded video here — large recordings can exceed
// serverless memory limits and must remain a direct browser-to-storage upload.
export const Route = createFileRoute("/api/public/upload-recording")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const contentType = request.headers.get("content-type") ?? "";
          const contentLength = Number(request.headers.get("content-length") ?? 0);
          if (!contentType.toLowerCase().includes("application/json")) {
            return json(
              {
                error: "direct_upload_required",
                message: "Recordings must be uploaded directly to storage before finalize is called.",
              },
              413,
            );
          }
          if (contentLength > 1024 * 1024) {
            return json({ error: "request_too_large" }, 413);
          }

          const body = (await request.json().catch(() => null)) as
            | { action?: string; [k: string]: unknown }
            | null;
          if (!body || typeof body.action !== "string") {
            return json({ error: "invalid_request" }, 400);
          }

          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

          const token = String(body.token ?? "");
          if (!token) return json({ error: "invalid_token" }, 400);

          const { data: invitation, error: invErr } = await supabaseAdmin
            .from("invitations")
            .select("id, status")
            .eq("token", token)
            .maybeSingle();
          if (invErr || !invitation) return json({ error: "invalid_token" }, 404);
          if (invitation.status === "completed" || invitation.status === "cancelled") {
            return json({ error: "invalid_state" }, 400);
          }

          if (body.action === "get_upload_url") {
            const position = Number(body.position ?? 0);
            const isFollowUp = body.is_follow_up === true;
            const kind = body.kind === "audio" ? "audio" : "video";
            const mime = String(body.mime_type ?? (kind === "audio" ? "audio/webm" : "video/webm"));
            const ext = kind === "audio" ? (mime.includes("mp4") ? "m4a" : "webm") : mime.includes("mp4") ? "mp4" : "webm";
            const path = `${invitation.id}/${position}${isFollowUp ? "-followup" : ""}-${Date.now()}${kind === "audio" ? "-audio" : ""}.${ext}`;

            const { data, error } = await supabaseAdmin.storage
              .from("interview-recordings")
              .createSignedUploadUrl(path);
            if (error || !data) return json({ error: error?.message ?? "upload_url_failed" }, 500);
            return json({ ok: true, path: data.path, token: data.token });
          }

          if (body.action === "finalize") {
            const questionId = String(body.question_id ?? "");
            const position = Number(body.position ?? 0);
            const isFollowUp = body.is_follow_up === true;
            const storagePath = String(body.storage_path ?? "");
            const audioPath = body.audio_path ? String(body.audio_path) : null;
            const mime = String(body.mime_type ?? "video/webm");
            const durationSeconds = Math.max(1, Math.round(Number(body.duration_seconds ?? 1)));
            if (!questionId || !storagePath) return json({ error: "invalid_request" }, 400);

            const { data: rec, error: recErr } = await supabaseAdmin
              .from("interview_recordings")
              .insert({
                invitation_id: invitation.id,
                question_id: questionId,
                position,
                storage_path: storagePath,
                audio_path: audioPath,
                mime_type: mime,
                is_follow_up: isFollowUp,
                duration_seconds: durationSeconds,
                transcript: null,
                transcript_status: audioPath ? "pending" : "failed",
              })
              .select()
              .single();
            if (recErr) return json({ error: recErr.message }, 500);

            // Transcribe from the small audio-only copy. This never touches the
            // video file, so serverless memory stays well within limits.
            let transcript: string | null = null;
            let transcriptStatus = audioPath ? "pending" : "failed";
            if (audioPath) {
              try {
                const { estimateTranscriptSegments, transcribeAudioPath } = await import("@/lib/transcribe.server");
                const result = await transcribeAudioPath(audioPath);
                transcript = result.transcript;
                transcriptStatus = result.status === "done" ? "done" : "failed";
                const segments = result.transcript
                  ? estimateTranscriptSegments(result.transcript, durationSeconds)
                  : null;
                await supabaseAdmin
                  .from("interview_recordings")
                  .update({
                    transcript: result.transcript,
                    transcript_segments: result.segments ?? segments,
                    transcript_status: transcriptStatus,
                  })
                  .eq("id", rec.id);
              } catch (err) {
                console.error("transcription error", err);
                transcriptStatus = "failed";
                await supabaseAdmin
                  .from("interview_recordings")
                  .update({ transcript_status: "failed" })
                  .eq("id", rec.id);
              }
            }

            return json({
              ok: true,
              recording: { id: rec.id, transcript, transcript_status: transcriptStatus },
            });
          }


          return json({ error: "unknown_action" }, 400);
        } catch (err) {
          console.error("upload-recording exception", err);
          return json({ error: "server_error" }, 500);
        }
      },
    },
  },
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}
