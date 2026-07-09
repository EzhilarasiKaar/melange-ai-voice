import { createFileRoute } from "@tanstack/react-router";

// POST multipart/form-data with:
//   token, question_id, position, is_follow_up, file
export const Route = createFileRoute("/api/public/upload-recording")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const form = await request.formData();
          const token = String(form.get("token") ?? "");
          const questionId = String(form.get("question_id") ?? "");
          const position = Number(form.get("position") ?? "0");
          const isFollowUp = form.get("is_follow_up") === "true";
          const file = form.get("file");

          if (!token || !questionId || !(file instanceof File)) {
            return new Response(JSON.stringify({ error: "invalid_request" }), {
              status: 400,
              headers: { "content-type": "application/json" },
            });
          }
          if (file.size > 100 * 1024 * 1024) {
            return new Response(JSON.stringify({ error: "file_too_large" }), {
              status: 413,
              headers: { "content-type": "application/json" },
            });
          }

          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

          const { data: invitation, error: invErr } = await supabaseAdmin
            .from("invitations")
            .select("id, status, expires_at")
            .eq("token", token)
            .maybeSingle();
          if (invErr || !invitation) {
            return new Response(JSON.stringify({ error: "invalid_token" }), {
              status: 404,
              headers: { "content-type": "application/json" },
            });
          }
          if (invitation.status === "completed" || invitation.status === "cancelled") {
            return new Response(JSON.stringify({ error: "invalid_state" }), {
              status: 400,
              headers: { "content-type": "application/json" },
            });
          }

          const mime = file.type || "video/webm";
          const ext = mime.includes("mp4") ? "mp4" : "webm";
          const storagePath = `${invitation.id}/${position}${isFollowUp ? "-followup" : ""}-${Date.now()}.${ext}`;
          const buffer = new Uint8Array(await file.arrayBuffer());

          const { error: upErr } = await supabaseAdmin.storage
            .from("interview-recordings")
            .upload(storagePath, buffer, { contentType: mime, upsert: false });
          if (upErr) {
            console.error("Upload error", upErr);
            return new Response(JSON.stringify({ error: upErr.message }), {
              status: 500,
              headers: { "content-type": "application/json" },
            });
          }

          // Transcribe via Lovable AI (best-effort — never block the upload)
          let transcript: string | null = null;
          const key = process.env.LOVABLE_API_KEY;
          if (key) {
            try {
              const audioForm = new FormData();
              audioForm.append("model", "openai/gpt-4o-mini-transcribe");
              const fname = `recording.${ext}`;
              audioForm.append("file", new Blob([buffer as BlobPart], { type: mime }), fname);

              const tRes = await fetch(
                "https://ai.gateway.lovable.dev/v1/audio/transcriptions",
                {
                  method: "POST",
                  headers: { Authorization: `Bearer ${key}` },
                  body: audioForm,
                },
              );
              if (tRes.ok) {
                const tJson = (await tRes.json()) as { text?: string };
                transcript = tJson.text ?? null;
              } else {
                console.error("Transcription failed", tRes.status, await tRes.text().catch(() => ""));
              }
            } catch (err) {
              console.error("Transcription error", err);
            }
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
          if (recErr) {
            return new Response(JSON.stringify({ error: recErr.message }), {
              status: 500,
              headers: { "content-type": "application/json" },
            });
          }

          return Response.json({
            ok: true,
            recording: { id: rec.id, transcript: rec.transcript },
          });
        } catch (err) {
          console.error("upload-recording exception", err);
          return new Response(JSON.stringify({ error: "server_error" }), {
            status: 500,
            headers: { "content-type": "application/json" },
          });
        }
      },
    },
  },
});
