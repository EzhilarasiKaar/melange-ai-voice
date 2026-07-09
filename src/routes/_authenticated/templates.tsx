import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  listTemplates,
  createTemplate,
  deleteTemplate,
} from "@/lib/interview-editor.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { Card } from "@/components/ui/card";
import { Plus, Trash2, ArrowUpRight } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/templates")({
  component: TemplatesPage,
});

function TemplatesPage() {
  const listFn = useServerFn(listTemplates);
  const createFn = useServerFn(createTemplate);
  const deleteFn = useServerFn(deleteTemplate);
  const qc = useQueryClient();
  const { data } = useSuspenseQuery({
    queryKey: ["templates"],
    queryFn: () => listFn(),
  });

  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [duration, setDuration] = useState(300);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    try {
      await createFn({ data: { name, description, max_duration_seconds: duration } });
      toast.success("Template created");
      setOpen(false);
      setName("");
      setDescription("");
      qc.invalidateQueries({ queryKey: ["templates"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this template? All questions will be removed.")) return;
    try {
      await deleteFn({ data: { id } });
      qc.invalidateQueries({ queryKey: ["templates"] });
      toast.success("Template deleted");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    }
  }

  return (
    <div className="mx-auto max-w-6xl px-8 py-10">
      <div className="flex items-end justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Library</p>
          <h1 className="mt-1 font-display text-4xl">Interview templates</h1>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="rounded-full">
              <Plus className="mr-1 size-4" />
              New template
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create a new template</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleCreate} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="tname">Template name</Label>
                <Input
                  id="tname"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Women in Leadership"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="tdesc">Description</Label>
                <Textarea
                  id="tdesc"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Short editorial context"
                  rows={3}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="tdur">Max recording duration (seconds per answer)</Label>
                <Input
                  id="tdur"
                  type="number"
                  min={30}
                  max={1800}
                  value={duration}
                  onChange={(e) => setDuration(Number(e.target.value))}
                />
              </div>
              <DialogFooter>
                <Button type="submit" className="rounded-full">Create template</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="mt-8 grid gap-4 md:grid-cols-2">
        {data.length === 0 && (
          <Card className="col-span-full border-dashed p-12 text-center shadow-none">
            <p className="font-medium">No templates yet</p>
            <p className="mt-2 text-sm text-muted-foreground">
              Create your first template to organise the interview questions.
            </p>
          </Card>
        )}
        {data.map((t) => {
          const qCount =
            (t.template_questions as unknown as { count: number }[] | null)?.[0]?.count ?? 0;
          return (
            <Card key={t.id} className="group border-border/70 p-6 shadow-none">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="truncate text-lg font-semibold">{t.name}</h3>
                  <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                    {t.description || "No description"}
                  </p>
                </div>
                <button
                  onClick={() => handleDelete(t.id)}
                  className="rounded-md p-1.5 text-muted-foreground opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
              <div className="mt-6 flex items-center justify-between border-t border-border pt-4 text-xs text-muted-foreground">
                <span>{qCount} question{qCount === 1 ? "" : "s"}</span>
                <Link
                  to="/templates/$id"
                  params={{ id: t.id }}
                  className="inline-flex items-center gap-1 text-primary hover:underline"
                >
                  Edit <ArrowUpRight className="size-3" />
                </Link>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
