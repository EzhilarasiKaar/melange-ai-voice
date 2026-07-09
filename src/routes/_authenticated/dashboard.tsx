import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getOverviewStats, listInvitations } from "@/lib/interview-editor.functions";
import { Card } from "@/components/ui/card";
import { Link } from "@tanstack/react-router";
import { ArrowUpRight, Clock, CheckCircle2, Users, Percent } from "lucide-react";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: Dashboard,
});

function formatDuration(sec: number) {
  if (!sec) return "—";
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}m ${s}s`;
}

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

function Dashboard() {
  const statsFn = useServerFn(getOverviewStats);
  const listFn = useServerFn(listInvitations);
  const qc = useQueryClient();
  const stats = useSuspenseQuery({
    queryKey: ["overview-stats"],
    queryFn: () => statsFn(),
  });
  const invitations = useSuspenseQuery({
    queryKey: ["invitations"],
    queryFn: () => listFn(),
  });

  const cards = [
    { label: "Total invitations", value: stats.data.total, icon: Users },
    { label: "Completed", value: stats.data.completed, icon: CheckCircle2 },
    { label: "Avg. duration", value: formatDuration(stats.data.avgDuration), icon: Clock },
    { label: "Completion rate", value: `${stats.data.completionRate}%`, icon: Percent },
  ];

  const recent = invitations.data.slice(0, 8);

  return (
    <div className="mx-auto max-w-6xl px-8 py-10">
      <div className="flex items-end justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Overview</p>
          <h1 className="mt-1 font-display text-4xl">Editorial dashboard</h1>
        </div>
        <button
          onClick={() => {
            qc.invalidateQueries();
          }}
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          Refresh
        </button>
      </div>

      <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((c) => (
          <Card key={c.label} className="border-border/70 p-6 shadow-none">
            <div className="flex items-center justify-between">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">{c.label}</p>
              <c.icon className="size-4 text-muted-foreground" />
            </div>
            <p className="mt-4 font-display text-4xl">{c.value}</p>
          </Card>
        ))}
      </div>

      <div className="mt-12">
        <div className="flex items-end justify-between">
          <h2 className="text-lg font-semibold">Recent invitations</h2>
          <Link to="/invitations" className="text-sm text-primary hover:underline">
            View all →
          </Link>
        </div>

        <Card className="mt-4 overflow-hidden border-border/70 shadow-none">
          {recent.length === 0 ? (
            <div className="p-12 text-center text-sm text-muted-foreground">
              No invitations yet.{" "}
              <Link to="/invitations" className="text-primary hover:underline">
                Send your first one.
              </Link>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="border-b border-border bg-surface-muted text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-6 py-3 text-left font-medium">Leader</th>
                  <th className="px-6 py-3 text-left font-medium">Template</th>
                  <th className="px-6 py-3 text-left font-medium">Status</th>
                  <th className="px-6 py-3 text-left font-medium">Sent</th>
                  <th className="px-6 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {recent.map((inv) => (
                  <tr key={inv.id} className="transition-colors hover:bg-surface-muted/60">
                    <td className="px-6 py-4">
                      <p className="font-medium">{inv.leader_name}</p>
                      <p className="text-xs text-muted-foreground">{inv.designation}</p>
                    </td>
                    <td className="px-6 py-4 text-muted-foreground">
                      {(inv.interview_templates as unknown as { name: string } | null)?.name ?? "—"}
                    </td>
                    <td className="px-6 py-4">{statusBadge(inv.status)}</td>
                    <td className="px-6 py-4 text-muted-foreground">
                      {new Date(inv.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4 text-right">
                      {inv.status === "completed" ? (
                        <Link
                          to="/interviews/$id"
                          params={{ id: inv.id }}
                          className="inline-flex items-center gap-1 text-primary hover:underline"
                        >
                          Open <ArrowUpRight className="size-3" />
                        </Link>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </div>
    </div>
  );
}
