import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Video, FileText, Wand2 } from "lucide-react";
import kaartechLogo from "@/assets/kaartech-logo.png.asset.json";

export const Route = createFileRoute("/")({
  component: Landing,
});

function Landing() {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border/60">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <img src={kaartechLogo.url} alt="KaarTech" className="h-10 w-auto" />
            <div className="ml-1 border-l border-border pl-3 leading-tight">
              <p className="text-sm font-semibold tracking-tight">Melange</p>
              <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                AI Leadership Interviewer
              </p>
            </div>
          </div>
          <Link
            to="/auth"
            className="rounded-full border border-input bg-background px-4 py-2 text-sm font-medium transition-colors hover:bg-accent"
          >
            Editor sign in
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6">
        <section className="pt-24 pb-20">
          <div className="max-w-3xl">
            <span className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1 text-xs font-medium text-muted-foreground">
              <span className="size-1.5 rounded-full bg-primary" />
              For KaarTech's C-Suite storytelling — the Melange editorial team
            </span>
            <h1 className="mt-6 font-display text-6xl leading-[1.02] text-foreground md:text-7xl">
              AI is reshaping leadership.
              <br />
              <span className="text-primary">Capture how, in their words.</span>
            </h1>
            <p className="mt-6 max-w-2xl text-lg text-muted-foreground">
              Invite KaarTech leaders to a 15-minute AI-guided video interview about the
              changes AI is driving inside their teams. We record every response, transcribe
              it verbatim, and deliver polished editorial materials — summaries, themes,
              pull quotes, and headline suggestions — ready for the next Melange issue.
            </p>
            <div className="mt-10 flex flex-wrap gap-3">
              <Link
                to="/auth"
                className="inline-flex items-center gap-2 rounded-full bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground transition-all hover:opacity-90"
              >
                Open the editorial dashboard <ArrowRight className="size-4" />
              </Link>
              <a
                href="#how-it-works"
                className="inline-flex items-center gap-2 rounded-full border border-input bg-background px-6 py-3 text-sm font-medium transition-colors hover:bg-accent"
              >
                How it works
              </a>
            </div>
          </div>
        </section>

        <section id="how-it-works" className="grid gap-6 pb-24 md:grid-cols-3">
          {[
            {
              icon: Wand2,
              title: "Compose the interview",
              body: "Curate templates by theme — Women in Leadership, AI Transformation, Innovation Stories. Add conditional follow-ups.",
            },
            {
              icon: Video,
              title: "Leader records async",
              body: "Melange AI reads each question aloud, waits, and captures a separate video segment per answer.",
            },
            {
              icon: FileText,
              title: "You get the story",
              body: "Timestamped transcript, editor's summary, pull quotes, and a suggested headline — ready for the next issue.",
            },
          ].map((f) => (
            <div
              key={f.title}
              className="rounded-2xl border border-border bg-surface p-8 transition-shadow hover:shadow-sm"
            >
              <div className="grid size-10 place-items-center rounded-xl bg-brand-soft text-primary">
                <f.icon className="size-5" />
              </div>
              <h3 className="mt-6 text-lg font-semibold">{f.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{f.body}</p>
            </div>
          ))}
        </section>
      </main>

      <footer className="border-t border-border/60 py-8">
        <div className="mx-auto max-w-6xl px-6 text-xs text-muted-foreground">
          Melange © {new Date().getFullYear()} · KaarTech internal editorial platform
        </div>
      </footer>
    </div>
  );
}
