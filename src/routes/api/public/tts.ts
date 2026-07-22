import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/tts")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const { text } = (await request.json()) as { text?: string };
          if (!text || typeof text !== "string") {
            return new Response("Missing text", { status: 400 });
          }
          const key = process.env.LOVABLE_API_KEY;
          if (!key) return new Response("TTS not configured", { status: 500 });

          const res = await fetch("https://ai.gateway.lovable.dev/v1/audio/speech", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${key}`,
            },
            body: JSON.stringify({
              model: "openai/gpt-4o-mini-tts",
              input: text,
              voice: "shimmer",
              response_format: "mp3",
              speed: 0.92,
              instructions:
                "Speak as a warm, calm, poised female interviewer. Slow, unhurried, natural pacing with gentle intonation. Sound human and thoughtful, as if speaking to a senior executive in a quiet studio. Do not sound robotic.",
            }),
          });

          if (!res.ok) {
            const body = await res.text().catch(() => "");
            console.error("TTS failed", res.status, body);
            return new Response(body || "TTS failed", { status: res.status });
          }

          return new Response(res.body, {
            headers: {
              "Content-Type": "audio/mpeg",
              "Cache-Control": "no-store",
            },
          });
        } catch (err) {
          console.error(err);
          return new Response("TTS error", { status: 500 });
        }
      },
    },
  },
});
