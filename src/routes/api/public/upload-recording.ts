import { createFileRoute } from "@tanstack/react-router";

// JSON-based flow to bypass Cloudflare Worker request-body / memory limits.
//
// action="get_upload_url": returns { path, token } for supabase-js
//   uploadToSignedUrl() — the browser PUTs the video directly to Storage.
// action="finalize": records the interview_recordings row and, when the
//   video is small enough, transcribes it via the Lovable AI gateway.
export const Route = createFileRoute("/api/public/upload-recording")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
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
            const mime = String(body.mime_type ?? "video/webm");
            const ext = mime.includes("mp4") ? "mp4" : "webm";
            const path = `${invitation.id}/${position}${isFollowUp ? "-followup" : ""}-${Date.now()}.${ext}`;

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
            const mime = String(body.mime_type ?? "video/webm");
            const size = Number(body.size ?? 0);
            if (!questionId || !storagePath) return json({ error: "invalid_request" }, 400);

            // Best-effort transcription — skip when the file is large enough
            // that downloading + forwarding to the gateway would blow the
            // Worker's memory/CPU budget and cause a 502.
            let transcript: string | null = null;
            const MAX_TRANSCRIBE_BYTES = 20 * 1024 * 1024; // 20 MB
            const key = process.env.LOVABLE_API_KEY;
            if (key && size > 0 && size <= MAX_TRANSCRIBE_BYTES) {
              try {
                const { data: fileData, error: dlErr } = await supabaseAdmin.storage
                  .from("interview-recordings")
                  .download(storagePath);
                if (!dlErr && fileData) {
                  const buffer = new Uint8Array(await fileData.arrayBuffer());
                  const ext = mime.includes("mp4") ? "mp4" : "webm";
                  const audioForm = new FormData();
                  audioForm.append("model", "openai/gpt-4o-mini-transcribe");
                  audioForm.append(
                    "file",
                    new Blob([buffer as BlobPart], { type: mime }),
                    `recording.${ext}`,
                  );
                  const tRes = await fetch(
                    "https://ai.gateway.lovable.dev/v1/audio/transcriptions",
                    { method: "POST", headers: { Authorization: `Bearer ${key}` }, body: audioForm },
                  );
                  if (tRes.ok) {
                    const tJson = (await tRes.json()) as { text?: string };
                    transcript = tJson.text ?? null;
                  } else {
                    console.error("Transcription failed", tRes.status);
                  }
                }
              } catch (err) {
                console.error("Transcription error", err);
              }
            } else if (size > MAX_TRANSCRIBE_BYTES) {
              console.warn(`Skipping transcription: file too large (${size} bytes)`);
            }

            const { data: rec, error: recErr } = await supabaseAdmin
              .from("interview_recordings")
              .insert({
                invitation_id: invitation.id,
                question_id: questionId,
                position,
                storage_path: storagePath,
                mime_type: mime,
                is_follow_up: isFollowUp,
                transcript,
              })
              .select()
              .single();
            if (recErr) return json({ error: recErr.message }, 500);

            return json({ ok: true, recording: { id: rec.id, transcript: rec.transcript } });
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
