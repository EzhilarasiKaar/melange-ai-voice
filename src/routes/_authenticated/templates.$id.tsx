import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  getTemplate,
  saveQuestions,
  updateTemplate,
} from "@/lib/interview-editor.functions";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { ArrowLeft, GripVertical, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/templates/$id")({
  component: TemplateEditor,
});

type QuestionDraft = {
  id?: string;
  position: number;
  prompt: string;
  follow_up_prompt: string | null;
  follow_up_keywords: string[];
};

function TemplateEditor() {
  const { id } = Route.useParams();
  const getFn = useServerFn(getTemplate);
  const saveFn = useServerFn(saveQuestions);
  const updateFn = useServerFn(updateTemplate);
  const qc = useQueryClient();
  const { data } = useSuspenseQuery({
    queryKey: ["template", id],
    queryFn: () => getFn({ data: { id } }),
  });

  const [name, setName] = useState(data.template.name);
  const [description, setDescription] = useState(data.template.description ?? "");
  const [duration, setDuration] = useState(data.template.max_duration_seconds);
  const [allowRetries, setAllowRetries] = useState(data.template.allow_retries);
  const [allowPause, setAllowPause] = useState(data.template.allow_pause);
  const [questions, setQuestions] = useState<QuestionDraft[]>([]);

  useEffect(() => {
    setQuestions(
      data.questions.map((q) => ({
        id: q.id,
        position: q.position,
        prompt: q.prompt,
        follow_up_prompt: q.follow_up_prompt,
        follow_up_keywords: q.follow_up_keywords ?? [],
      })),
    );
  }, [data.questions]);

  function addQuestion() {
    setQuestions((qs) => [
      ...qs,
      { position: qs.length, prompt: "", follow_up_prompt: "", follow_up_keywords: [] },
    ]);
  }
  function removeQuestion(idx: number) {
    setQuestions((qs) => qs.filter((_, i) => i !== idx).map((q, i) => ({ ...q, position: i })));
  }
  function updateQ(idx: number, patch: Partial<QuestionDraft>) {
    setQuestions((qs) => qs.map((q, i) => (i === idx ? { ...q, ...patch } : q)));
  }

  async function saveAll() {
    try {
      await updateFn({
        data: {
          id,
          name,
          description: description || null,
          max_duration_seconds: duration,
          allow_retries: allowRetries,
          allow_pause: allowPause,
        },
      });
      await saveFn({
        data: {
          template_id: id,
          questions: questions
            .filter((q) => q.prompt.trim().length > 0)
            .map((q, i) => ({
              id: q.id,
              position: i,
              prompt: q.prompt.trim(),
              follow_up_prompt: q.follow_up_prompt?.trim() || null,
              follow_up_keywords: q.follow_up_keywords.filter(Boolean),
            })),
        },
      });
      toast.success("Template saved");
      qc.invalidateQueries({ queryKey: ["template", id] });
      qc.invalidateQueries({ queryKey: ["templates"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    }
  }

  return (
    <div className="mx-auto max-w-4xl px-8 py-10">
      <Link
        to="/templates"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> Back to templates
      </Link>

      <div className="mt-6 space-y-6">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Template</p>
          <h1 className="mt-1 font-display text-4xl">{data.template.name}</h1>
        </div>

        <Card className="border-border/70 p-6 shadow-none">
          <div className="grid gap-5 md:grid-cols-2">
            <div className="space-y-2 md:col-span-2">
              <Label>Name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label>Description</Label>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
              />
            </div>
            <div className="space-y-2">
              <Label>Max seconds per answer</Label>
              <Input
                type="number"
                min={30}
                max={1800}
                value={duration}
                onChange={(e) => setDuration(Number(e.target.value))}
              />
            </div>
            <div className="flex items-center justify-between rounded-lg border border-border p-3">
              <div>
                <p className="text-sm font-medium">Allow retries</p>
                <p className="text-xs text-muted-foreground">Leaders can re-record answers.</p>
              </div>
              <Switch checked={allowRetries} onCheckedChange={setAllowRetries} />
            </div>
            <div className="flex items-center justify-between rounded-lg border border-border p-3 md:col-span-2">
              <div>
                <p className="text-sm font-medium">Allow pause</p>
                <p className="text-xs text-muted-foreground">Pause recording mid-answer.</p>
              </div>
              <Switch checked={allowPause} onCheckedChange={setAllowPause} />
            </div>
          </div>
        </Card>

        <div>
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Questions</h2>
            <Button variant="outline" size="sm" onClick={addQuestion} className="rounded-full">
              <Plus className="mr-1 size-3.5" /> Add question
            </Button>
          </div>

          <div className="mt-4 space-y-3">
            {questions.length === 0 && (
              <Card className="border-dashed p-8 text-center text-sm text-muted-foreground shadow-none">
                No questions yet. Add your first one.
              </Card>
            )}
            {questions.map((q, i) => (
              <Card key={i} className="border-border/70 p-5 shadow-none">
                <div className="flex gap-3">
                  <div className="mt-2 flex flex-col items-center text-muted-foreground">
                    <GripVertical className="size-4" />
                    <span className="mt-2 text-xs font-medium">{i + 1}</span>
                  </div>
                  <div className="flex-1 space-y-3">
                    <Textarea
                      value={q.prompt}
                      onChange={(e) => updateQ(i, { prompt: e.target.value })}
                      placeholder="What excites you most about the AI era?"
                      rows={2}
                      className="text-base"
                    />
                    <details className="rounded-md bg-surface-muted p-3 text-sm">
                      <summary className="cursor-pointer text-xs font-medium text-muted-foreground">
                        Conditional follow-up (optional)
                      </summary>
                      <div className="mt-3 space-y-2">
                        <Label className="text-xs">Follow-up prompt</Label>
                        <Textarea
                          value={q.follow_up_prompt ?? ""}
                          onChange={(e) => updateQ(i, { follow_up_prompt: e.target.value })}
                          placeholder="Could you share a real experience that shaped this perspective?"
                          rows={2}
                        />
                        <Label className="text-xs">Trigger keywords (comma-separated)</Label>
                        <Input
                          value={q.follow_up_keywords.join(", ")}
                          onChange={(e) =>
                            updateQ(i, {
                              follow_up_keywords: e.target.value
                                .split(",")
                                .map((s) => s.trim())
                                .filter(Boolean),
                            })
                          }
                          placeholder="innovation, future, transformation"
                        />
                        <p className="text-xs text-muted-foreground">
                          If the answer transcript contains any keyword, the follow-up is asked.
                          Leave keywords empty to always ask.
                        </p>
                      </div>
                    </details>
                  </div>
                  <button
                    onClick={() => removeQuestion(i)}
                    className="self-start rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>
              </Card>
            ))}
          </div>
        </div>

        <div className="sticky bottom-4 flex justify-end">
          <Button onClick={saveAll} size="lg" className="rounded-full shadow-lg">
            Save template
          </Button>
        </div>
      </div>
    </div>
  );
}
