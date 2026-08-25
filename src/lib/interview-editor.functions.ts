import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { generateInterviewToken } from "./interview-tokens";

// ---------- Templates ----------

export const listTemplates = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("interview_templates")
      .select("*, template_questions(count)")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data;
  });

export const getTemplate = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { data: template, error } = await context.supabase
      .from("interview_templates")
      .select("*")
      .eq("id", data.id)
      .single();
    if (error) throw new Error(error.message);
    const { data: questions, error: qErr } = await context.supabase
      .from("template_questions")
      .select("*")
      .eq("template_id", data.id)
      .order("position");
    if (qErr) throw new Error(qErr.message);
    return { template, questions };
  });

export const createTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        name: z.string().min(1).max(120),
        description: z.string().max(500).optional(),
        max_duration_seconds: z.number().int().min(30).max(1800).default(300),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    const { data: row, error } = await context.supabase
      .from("interview_templates")
      .insert({
        created_by: context.userId,
        name: data.name,
        description: data.description ?? null,
        max_duration_seconds: data.max_duration_seconds,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const updateTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        name: z.string().min(1).max(120),
        description: z.string().max(500).nullable().optional(),
        max_duration_seconds: z.number().int().min(30).max(1800),
        allow_retries: z.boolean(),
        allow_pause: z.boolean(),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    const { id, ...update } = data;
    const { error } = await context.supabase
      .from("interview_templates")
      .update(update)
      .eq("id", id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase
      .from("interview_templates")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const saveQuestions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        template_id: z.string().uuid(),
        questions: z.array(
          z.object({
            id: z.string().uuid().optional(),
            position: z.number().int().min(0),
            prompt: z.string().min(1).max(500),
            follow_up_prompt: z.string().max(500).nullable().optional(),
            follow_up_keywords: z.array(z.string().max(60)).max(20).default([]),
          }),
        ),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    // Replace all questions for the template atomically-ish
    const { error: delErr } = await context.supabase
      .from("template_questions")
      .delete()
      .eq("template_id", data.template_id);
    if (delErr) throw new Error(delErr.message);

    if (data.questions.length === 0) return { ok: true };

    const rows = data.questions.map((q) => ({
      template_id: data.template_id,
      position: q.position,
      prompt: q.prompt,
      follow_up_prompt: q.follow_up_prompt ?? null,
      follow_up_keywords: q.follow_up_keywords ?? [],
    }));
    const { error } = await context.supabase.from("template_questions").insert(rows);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------- Invitations ----------

export const listInvitations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("invitations")
      .select("*, interview_templates(name)")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data;
  });

export const createInvitation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        template_id: z.string().uuid(),
        leader_name: z.string().min(1).max(120),
        designation: z.string().max(120).optional(),
        department: z.string().max(120).optional(),
        email: z.string().email().max(255),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    const token = generateInterviewToken();
    const expires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    const { data: row, error } = await context.supabase
      .from("invitations")
      .insert({
        created_by: context.userId,
        template_id: data.template_id,
        token,
        leader_name: data.leader_name,
        designation: data.designation ?? null,
        department: data.department ?? null,
        email: data.email,
        expires_at: expires,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const cancelInvitation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase
      .from("invitations")
      .update({ status: "cancelled" })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------- Interview viewer ----------

export const getInterview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { data: invitation, error } = await context.supabase
      .from("invitations")
      .select("*, interview_templates(name, description)")
      .eq("id", data.id)
      .single();
    if (error) throw new Error(error.message);

    const { data: recordings } = await context.supabase
      .from("interview_recordings")
      .select("*, template_questions(prompt, follow_up_prompt)")
      .eq("invitation_id", data.id)
      .order("position");

    const { data: summary } = await context.supabase
      .from("interview_summaries")
      .select("*")
      .eq("invitation_id", data.id)
      .maybeSingle();

    return { invitation, recordings: recordings ?? [], summary };
  });

export const getRecordingUrl = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ path: z.string().min(1) }).parse(d))
  .handler(async ({ context, data }) => {
    const { data: signed, error } = await context.supabase.storage
      .from("interview-recordings")
      .createSignedUrl(data.path, 60 * 60);
    if (error) throw new Error(error.message);
    return { url: signed.signedUrl };
  });

export const retranscribeRecording = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    // Confirm the caller can see this recording under RLS before using admin.
    const { data: rec, error } = await context.supabase
      .from("interview_recordings")
      .select("id")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!rec) throw new Error("Recording not found");

    const { transcribeRecordingRow } = await import("./transcribe.server");
    return transcribeRecordingRow(data.id);
  });

// For interviews recorded before audio-only capture existed: the editor's
// browser extracts the audio track from the stored video and uploads it here,
// then transcription runs from that small WAV file.
export const createAudioUploadUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { data: rec, error } = await context.supabase
      .from("interview_recordings")
      .select("id, invitation_id")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!rec) throw new Error("Recording not found");

    const path = `${rec.invitation_id}/${rec.id}-extracted-${Date.now()}.wav`;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: signed, error: sErr } = await supabaseAdmin.storage
      .from("interview-recordings")
      .createSignedUploadUrl(path);
    if (sErr || !signed) throw new Error(sErr?.message ?? "Could not prepare upload");
    return { path: signed.path, token: signed.token };
  });

export const attachAudioAndTranscribe = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ id: z.string().uuid(), audio_path: z.string().min(1) }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const { data: rec, error } = await context.supabase
      .from("interview_recordings")
      .select("id, invitation_id")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!rec) throw new Error("Recording not found");
    if (!data.audio_path.startsWith(`${rec.invitation_id}/`)) {
      throw new Error("Invalid audio path");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error: uErr } = await supabaseAdmin
      .from("interview_recordings")
      .update({ audio_path: data.audio_path, transcript_status: "pending" })
      .eq("id", data.id);
    if (uErr) throw new Error(uErr.message);

    const { transcribeRecordingRow } = await import("./transcribe.server");
    return transcribeRecordingRow(data.id);
  });



// ---------- Overview stats ----------

export const getOverviewStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: invitations } = await context.supabase
      .from("invitations")
      .select("id, status, started_at, completed_at");
    const list = invitations ?? [];
    const total = list.length;
    const completed = list.filter((i) => i.status === "completed").length;
    const inProgress = list.filter((i) => i.status === "in_progress").length;
    const pending = list.filter((i) => i.status === "pending").length;
    const durations = list
      .filter((i) => i.started_at && i.completed_at)
      .map(
        (i) =>
          (new Date(i.completed_at!).getTime() - new Date(i.started_at!).getTime()) /
          1000,
      );
    const avgDuration =
      durations.length > 0
        ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
        : 0;
    return {
      total,
      completed,
      inProgress,
      pending,
      avgDuration,
      completionRate: total > 0 ? Math.round((completed / total) * 100) : 0,
    };
  });
