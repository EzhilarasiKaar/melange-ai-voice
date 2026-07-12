import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getInterview, getRecordingUrl } from "@/lib/interview-editor.functions";
import { Card } from "@/components/ui/card";
import { ArrowLeft, Play, Quote, Download } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/interviews/$id")({
  component: InterviewViewer,
});

function InterviewViewer() {
  const { id } = Route.useParams();
  const getFn = useServerFn(getInterview);
  const urlFn = useServerFn(getRecordingUrl);
  const { data } = useSuspenseQuery({
    queryKey: ["interview", id],
    queryFn: () => getFn({ data: { id } }),
  });

  const [activeUrl, setActiveUrl] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);

  async function play(path: string, recId: string) {
    setActiveId(recId);
    setActiveUrl(null);
    const { url } = await urlFn({ data: { path } });
    setActiveUrl(url);
  }

  async function downloadFile(url: string, filename: string) {
    try {
      const res = await fetch(url);
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objectUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    } catch (err) {
      console.error(err);
      toast.error("Download failed");
    }
  }

  async function downloadVideo(path: string, position: number, isFollowUp: boolean) {
    const { url } = await urlFn({ data: { path } });
    const ext = path.split(".").pop() || "webm";
    const name = `${inv.leader_name.replace(/\s+/g, "_")}-q${position + 1}${isFollowUp ? "-followup" : ""}.${ext}`;
    await downloadFile(url, name);
  }

  function downloadTranscript() {
    const lines: string[] = [];
    lines.push(`Interview transcript — ${inv.leader_name}`);
    if (inv.designation || inv.department) {
      lines.push([inv.designation, inv.department].filter(Boolean).join(" · "));
    }
    lines.push("");
    if (summary?.executive_summary) {
      lines.push("Executive summary:");
      lines.push(summary.executive_summary);
      lines.push("");
    }
    data.recordings.forEach((r) => {
      const q = (r.template_questions as unknown as { prompt: string } | null)?.prompt ?? "";
      lines.push(`Q${r.position + 1}${r.is_follow_up ? " (follow-up)" : ""}: ${q}`);
      lines.push(`A: ${r.transcript ?? "(no transcript)"}`);
      lines.push("");
    });
    const blob = new Blob([lines.join("\n")], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${inv.leader_name.replace(/\s+/g, "_")}-transcript.txt`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }


  const inv = data.invitation;
  const summary = data.summary;

  return (
    <div className="mx-auto max-w-6xl px-8 py-10">
      <Link
        to="/invitations"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> Back to invitations
      </Link>

      <div className="mt-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
            {(inv.interview_templates as unknown as { name: string } | null)?.name ?? "Interview"}
          </p>
          <h1 className="mt-1 font-display text-5xl">{inv.leader_name}</h1>
          <p className="mt-2 text-muted-foreground">
            {[inv.designation, inv.department].filter(Boolean).join(" · ")}
          </p>
        </div>
      </div>

      {summary?.suggested_headline && (
        <Card className="mt-8 border-primary/20 bg-brand-soft/40 p-8 shadow-none">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
            Suggested headline
          </p>
          <p className="mt-3 font-display text-3xl leading-tight">
            {summary.suggested_headline}
          </p>
          {summary.article_title && (
            <p className="mt-2 text-sm italic text-muted-foreground">
              Article title: {summary.article_title}
            </p>
          )}
        </Card>
      )}

      <div className="mt-10 grid gap-8 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          <h2 className="text-lg font-semibold">Recordings</h2>
          {activeUrl && (
            <video
              key={activeUrl}
              src={activeUrl}
              controls
              autoPlay
              className="w-full rounded-2xl bg-black"
            />
          )}
          <div className="space-y-3">
            {data.recordings.map((r) => {
              const q = (r.template_questions as unknown as { prompt: string } | null)?.prompt;
              return (
                <Card key={r.id} className="border-border/70 p-5 shadow-none">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                        Question {r.position + 1}
                        {r.is_follow_up && " · follow-up"}
                      </p>
                      <p className="mt-1 font-medium">{q}</p>
                      {r.transcript && (
                        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                          {r.transcript}
                        </p>
                      )}
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => play(r.storage_path, r.id)}
                      className="rounded-full"
                    >
                      <Play className="mr-1 size-3.5" />
                      {activeId === r.id ? "Loading…" : "Play"}
                    </Button>
                  </div>
                </Card>
              );
            })}
            {data.recordings.length === 0 && (
              <Card className="border-dashed p-8 text-center text-sm text-muted-foreground shadow-none">
                No recordings yet.
              </Card>
            )}
          </div>
        </div>

        <div className="space-y-6">
          {summary?.executive_summary && (
            <Card className="border-border/70 p-6 shadow-none">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Executive summary
              </h3>
              <p className="mt-3 text-sm leading-relaxed">{summary.executive_summary}</p>
            </Card>
          )}
          {summary?.key_themes && summary.key_themes.length > 0 && (
            <Card className="border-border/70 p-6 shadow-none">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Key themes
              </h3>
              <ul className="mt-3 flex flex-wrap gap-2">
                {summary.key_themes.map((t, i) => (
                  <li
                    key={i}
                    className="rounded-full border border-border bg-surface-muted px-3 py-1 text-xs"
                  >
                    {t}
                  </li>
                ))}
              </ul>
            </Card>
          )}
          {summary?.pull_quotes && summary.pull_quotes.length > 0 && (
            <Card className="border-border/70 p-6 shadow-none">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Pull quotes
              </h3>
              <div className="mt-4 space-y-4">
                {summary.pull_quotes.map((q, i) => (
                  <blockquote
                    key={i}
                    className="border-l-2 border-primary pl-4 font-display text-lg italic"
                  >
                    <Quote className="mb-1 inline size-3 text-primary" /> {q}
                  </blockquote>
                ))}
              </div>
            </Card>
          )}
          {summary?.key_insights && summary.key_insights.length > 0 && (
            <Card className="border-border/70 p-6 shadow-none">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Key insights
              </h3>
              <ul className="mt-3 space-y-2 text-sm">
                {summary.key_insights.map((k, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="text-primary">·</span>
                    <span>{k}</span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
          {summary?.profile_paragraph && (
            <Card className="border-border/70 p-6 shadow-none">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                One-paragraph profile
              </h3>
              <p className="mt-3 text-sm leading-relaxed italic">{summary.profile_paragraph}</p>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
