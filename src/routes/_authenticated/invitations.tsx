import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  listInvitations,
  listTemplates,
  createInvitation,
  cancelInvitation,
} from "@/lib/interview-editor.functions";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { Card } from "@/components/ui/card";
import { Copy, Plus, XCircle, ArrowUpRight, Search } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/invitations")({
  component: InvitationsPage,
});

function statusBadge(status: string) {
  const styles: Record<string, string> = {
    completed: "bg-emerald-50 text-emerald-700 border-emerald-200",
    in_progress: "bg-blue-50 text-blue-700 border-blue-200",
    pending: "bg-amber-50 text-amber-700 border-amber-200",
    cancelled: "bg-neutral-100 text-neutral-600 border-neutral-200",
    expired: "bg-neutral-100 text-neutral-500 border-neutral-200",
  };
  return (
    <span
      className={
        "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium " +
        (styles[status] ?? "bg-neutral-100 text-neutral-700 border-neutral-200")
      }
    >
      {status.replace("_", " ")}
    </span>
  );
}

function InvitationsPage() {
  const listFn = useServerFn(listInvitations);
  const templatesFn = useServerFn(listTemplates);
  const createFn = useServerFn(createInvitation);
  const cancelFn = useServerFn(cancelInvitation);
  const qc = useQueryClient();

  const invs = useSuspenseQuery({ queryKey: ["invitations"], queryFn: () => listFn() });
  const templates = useSuspenseQuery({
    queryKey: ["templates"],
    queryFn: () => templatesFn(),
  });

  const [open, setOpen] = useState(false);
  const [templateId, setTemplateId] = useState<string>("");
  const [leaderName, setLeaderName] = useState("");
  const [designation, setDesignation] = useState("");
  const [department, setDepartment] = useState("");
  const [email, setEmail] = useState("");
  const [filter, setFilter] = useState<string>("all");
  const [search, setSearch] = useState("");

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!templateId) {
      toast.error("Select a template");
      return;
    }
    try {
      const inv = await createFn({
        data: {
          template_id: templateId,
          leader_name: leaderName,
          designation,
          department,
          email,
        },
      });
      toast.success("Invitation created");
      setOpen(false);
      setLeaderName("");
      setDesignation("");
      setDepartment("");
      setEmail("");
      qc.invalidateQueries({ queryKey: ["invitations"] });
      const link = `${window.location.origin}/interview/${inv.token}`;
      await navigator.clipboard.writeText(link).catch(() => {});
      toast.info("Interview link copied to clipboard");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    }
  }

  async function copyLink(token: string) {
    const link = `${window.location.origin}/interview/${token}`;
    await navigator.clipboard.writeText(link);
    toast.success("Link copied");
  }

  async function handleCancel(id: string) {
    if (!confirm("Cancel this invitation?")) return;
    try {
      await cancelFn({ data: { id } });
      qc.invalidateQueries({ queryKey: ["invitations"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    }
  }

  const filtered = invs.data
    .filter((i) => (filter === "all" ? true : i.status === filter))
    .filter((i) => {
      if (!search) return true;
      const q = search.toLowerCase();
      return (
        i.leader_name.toLowerCase().includes(q) ||
        i.email.toLowerCase().includes(q) ||
        (i.designation ?? "").toLowerCase().includes(q) ||
        (i.department ?? "").toLowerCase().includes(q)
      );
    });

  return (
    <div className="mx-auto max-w-6xl px-8 py-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
            Invitations
          </p>
          <h1 className="mt-1 font-display text-4xl">Leaders &amp; interview links</h1>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="rounded-full">
              <Plus className="mr-1 size-4" /> New invitation
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Invite a leader</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleCreate} className="space-y-4">
              <div className="space-y-2">
                <Label>Template</Label>
                <Select value={templateId} onValueChange={setTemplateId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose interview template" />
                  </SelectTrigger>
                  <SelectContent>
                    {templates.data.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Leader name</Label>
                  <Input value={leaderName} onChange={(e) => setLeaderName(e.target.value)} required />
                </div>
                <div className="space-y-2">
                  <Label>Email</Label>
                  <Input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label>Designation</Label>
                  <Input value={designation} onChange={(e) => setDesignation(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Department</Label>
                  <Input value={department} onChange={(e) => setDepartment(e.target.value)} />
                </div>
              </div>
              <DialogFooter>
                <Button type="submit" className="rounded-full">
                  Create invitation
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="mt-8 flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[240px]">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Search by name, email, department…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={filter} onValueChange={setFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="in_progress">In progress</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card className="mt-6 overflow-hidden border-border/70 shadow-none">
        {filtered.length === 0 ? (
          <div className="p-12 text-center text-sm text-muted-foreground">
            No invitations match your filter.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-surface-muted text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-6 py-3 text-left font-medium">Leader</th>
                <th className="px-6 py-3 text-left font-medium">Template</th>
                <th className="px-6 py-3 text-left font-medium">Status</th>
                <th className="px-6 py-3 text-left font-medium">Created</th>
                <th className="px-6 py-3 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((inv) => (
                <tr key={inv.id} className="transition-colors hover:bg-surface-muted/60">
                  <td className="px-6 py-4">
                    <p className="font-medium">{inv.leader_name}</p>
                    <p className="text-xs text-muted-foreground">
                      {[inv.designation, inv.department].filter(Boolean).join(" · ") || inv.email}
                    </p>
                  </td>
                  <td className="px-6 py-4 text-muted-foreground">
                    {(inv.interview_templates as unknown as { name: string } | null)?.name ?? "—"}
                  </td>
                  <td className="px-6 py-4">{statusBadge(inv.status)}</td>
                  <td className="px-6 py-4 text-muted-foreground">
                    {new Date(inv.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => copyLink(inv.token)}
                        title="Copy interview link"
                        className="rounded-md p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
                      >
                        <Copy className="size-4" />
                      </button>
                      {inv.status === "completed" && (
                        <Link
                          to="/interviews/$id"
                          params={{ id: inv.id }}
                          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-primary hover:bg-brand-soft"
                        >
                          Open <ArrowUpRight className="size-3" />
                        </Link>
                      )}
                      {inv.status !== "completed" && inv.status !== "cancelled" && (
                        <button
                          onClick={() => handleCancel(inv.id)}
                          title="Cancel"
                          className="rounded-md p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                        >
                          <XCircle className="size-4" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
