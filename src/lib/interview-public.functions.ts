import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

async function getAdmin() {
  const mod = await import("@/integrations/supabase/client.server");
  return mod.supabaseAdmin;
}

export const getInvitationByToken = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => z.object({ token: z.string().min(8).max(64) }).parse(d))
  .handler(async ({ data }) => {
    const admin = await getAdmin();
    const { data: invitation, error } = await admin
      .from("invitations")
      .select("*, interview_templates(name, description, max_duration_seconds, allow_retries, allow_pause)")
      .eq("token", data.token)
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!invitation) return { notFound: true as const };

    if (invitation.status === "completed") {
      return { completed: true as const, invitation };
    }
    if (invitation.status === "cancelled") {
      return { cancelled: true as const };
    }
    if (invitation.expires_at && new Date(invitation.expires_at) < new Date()) {
      return { expired: true as const };
    }

    const { data: questions } = await admin
      .from("template_questions")
      .select("*")
      .eq("template_id", invitation.template_id)
      .order("position");

    return { invitation, questions: questions ?? [] };
  });

export const acceptConsent = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ token: z.string().min(8).max(64) }).parse(d))
  .handler(async ({ data }) => {
    const admin = await getAdmin();
    const { error } = await admin
      .from("invitations")
      .update({
        consent_given: true,
        status: "in_progress",
        started_at: new Date().toISOString(),
      })
      .eq("token", data.token)
      .in("status", ["pending", "in_progress"]);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const finalizeInterview = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ token: z.string().min(8).max(64) }).parse(d))
  .handler(async ({ data }) => {
    const admin = await getAdmin();

    const { data: invitation, error: invErr } = await admin
      .from("invitations")
      .select("*")
      .eq("token", data.token)
      .single();
    if (invErr) throw new Error(invErr.message);

    const { data: recordings } = await admin
      .from("interview_recordings")
      .select("position, transcript, is_follow_up, template_questions(prompt)")
      .eq("invitation_id", invitation.id)
      .order("position");

    const transcript = (recordings ?? [])
      .map((r) => {
        const q = (r.template_questions as unknown as { prompt: string } | null)?.prompt ?? "";
        return `Q${r.position + 1}${r.is_follow_up ? " (follow-up)" : ""}: ${q}\nA: ${r.transcript ?? "(no transcript)"}\n`;
      })
      .join("\n");

    // Generate summary via Lovable AI
    const key = process.env.LOVABLE_API_KEY;
    if (key) {
      try {
        const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Lovable-API-Key": key,
          },
          body: JSON.stringify({
            model: "google/gemini-2.5-flash",
            messages: [
              {
                role: "system",
                content:
                  "You are the editor-in-chief of Melange, a premium corporate leadership magazine. Read the interview transcript and produce editorial materials. Return ONLY valid minified JSON matching this schema, with no prose or markdown: {\"executive_summary\":string,\"key_themes\":string[],\"memorable_quotes\":string[],\"key_insights\":string[],\"pull_quotes\":string[],\"suggested_headline\":string,\"article_title\":string,\"profile_paragraph\":string}. Keep quotes verbatim from the transcript. 3-6 items per array.",
              },
              {
                role: "user",
                content: `Leader: ${invitation.leader_name}${invitation.designation ? `, ${invitation.designation}` : ""}${invitation.department ? ` (${invitation.department})` : ""}\n\nTranscript:\n${transcript}`,
              },
            ],
            response_format: { type: "json_object" },
          }),
        });

        if (res.ok) {
          const json = await res.json();
          const content = json.choices?.[0]?.message?.content ?? "{}";
          let parsed: Record<string, unknown> = {};
          try {
            parsed = JSON.parse(content);
          } catch {
            parsed = {};
          }
          await admin.from("interview_summaries").upsert(
            {
              invitation_id: invitation.id,
              executive_summary: (parsed.executive_summary as string) ?? null,
              key_themes: (parsed.key_themes as string[]) ?? [],
              memorable_quotes: (parsed.memorable_quotes as string[]) ?? [],
              key_insights: (parsed.key_insights as string[]) ?? [],
              pull_quotes: (parsed.pull_quotes as string[]) ?? [],
              suggested_headline: (parsed.suggested_headline as string) ?? null,
              article_title: (parsed.article_title as string) ?? null,
              profile_paragraph: (parsed.profile_paragraph as string) ?? null,
              full_transcript: transcript,
            },
            { onConflict: "invitation_id" },
          );
        } else {
          console.error("Summary AI call failed:", res.status, await res.text());
          await admin
            .from("interview_summaries")
            .upsert({ invitation_id: invitation.id, full_transcript: transcript }, { onConflict: "invitation_id" });
        }
      } catch (err) {
        console.error("Summary generation failed", err);
        await admin
          .from("interview_summaries")
          .upsert({ invitation_id: invitation.id, full_transcript: transcript }, { onConflict: "invitation_id" });
      }
    }

    await admin
      .from("invitations")
      .update({
        status: "completed",
        completed_at: new Date().toISOString(),
      })
      .eq("id", invitation.id);

    return { ok: true };
  });
