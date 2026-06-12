import { createFileRoute, Link } from "@tanstack/react-router";
import { ShieldCheck, ListChecks, FileSearch } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "PharmaPrompt OS — Pharmacy Recommendation Engine" },
      {
        name: "description",
        content:
          "Australian community-pharmacy decision support. Deterministic, source-aware recommendations that keep the pharmacist in control.",
      },
      { property: "og:title", content: "PharmaPrompt OS" },
      {
        property: "og:description",
        content: "Decision support for community pharmacists. Calm, conservative, auditable.",
      },
    ],
  }),
  component: Landing,
});

function Landing() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="px-8 py-5 flex items-center justify-between max-w-6xl mx-auto">
        <div className="flex items-center gap-2">
          <div className="h-7 w-7 rounded-md bg-foreground flex items-center justify-center">
            <span className="text-background font-display text-sm">P</span>
          </div>
          <span className="font-display text-sm">PharmaPrompt OS</span>
        </div>
        <Link
          to="/auth"
          className="text-sm rounded-lg bg-foreground text-background px-4 py-2 hover:bg-foreground/90"
        >
          Sign in
        </Link>
      </header>

      <section className="max-w-4xl mx-auto px-8 pt-20 pb-24">
        <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">Pharmacy Recommendation Engine</p>
        <h1 className="mt-4 text-5xl md:text-6xl font-display font-medium leading-[1.05] tracking-tight">
          Decision support that respects the pharmacist.
        </h1>
        <p className="mt-6 text-lg text-muted-foreground max-w-2xl">
          PharmaPrompt OS reads a patient's medication list, history and presentation, and surfaces the
          guardrails and counselling prompts that matter — deterministically, with sources, without the
          chatbot theatre.
        </p>
        <div className="mt-8 flex gap-3">
          <Link
            to="/auth"
            className="inline-flex items-center rounded-lg bg-foreground text-background px-5 py-3 text-sm font-medium hover:bg-foreground/90"
          >
            Sign in to start a review
          </Link>
        </div>

        <div className="mt-24 grid md:grid-cols-3 gap-4">
          <Pillar
            icon={ShieldCheck}
            title="Safety-first"
            body="Bleeding risk, mineral timing, renal cautions, pregnancy and breastfeeding suppression — fire before any product is suggested."
          />
          <Pillar
            icon={ListChecks}
            title="Deterministic"
            body="A curated ruleset and Australian medication dictionary. Same input, same output. Auditable. No hallucinations."
          />
          <Pillar
            icon={FileSearch}
            title="Transparent"
            body="Every card shows why it fired, what was matched, and the source. Pharmacist confirms before anything reaches the patient."
          />
        </div>
      </section>

      <footer className="border-t border-hairline px-8 py-5">
        <p className="max-w-4xl mx-auto text-[11px] text-muted-foreground">
          PharmaPrompt OS supports — it does not replace — pharmacist clinical judgement. Account access is
          provisioned per pharmacy.
        </p>
      </footer>
    </div>
  );
}

function Pillar({ icon: Icon, title, body }: { icon: typeof ShieldCheck; title: string; body: string }) {
  return (
    <div className="pp-glass p-5">
      <Icon className="h-5 w-5 text-accent" />
      <h3 className="mt-3 font-display text-lg">{title}</h3>
      <p className="mt-1.5 text-sm text-muted-foreground leading-relaxed">{body}</p>
    </div>
  );
}
