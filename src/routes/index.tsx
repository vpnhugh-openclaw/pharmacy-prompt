import { createFileRoute, Link } from "@tanstack/react-router";
import { motion, type Variants } from "framer-motion";
import { ShieldCheck, ListChecks, FileSearch, ArrowRight, Sparkles } from "lucide-react";

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
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "PharmaPrompt OS" },
      {
        name: "twitter:description",
        content: "Decision support for community pharmacists. Calm, conservative, auditable.",
      },
    ],
  }),
  component: Landing,
});

const fadeUp: Variants = {
  hidden: { opacity: 0, y: 24 },
  show: (i: number = 0) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.7, ease: [0.16, 1, 0.3, 1] as const, delay: i * 0.08 },
  }),
};

function Landing() {
  return (
    <div className="min-h-screen bg-background text-foreground overflow-hidden">
      {/* Ambient gradient */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[680px] -z-0">
        <div className="absolute -top-40 left-1/2 -translate-x-1/2 h-[640px] w-[1100px] rounded-full opacity-[0.18] blur-3xl"
          style={{ background: "radial-gradient(closest-side, hsl(var(--accent)/0.7), transparent 70%)" }} />
        <div className="absolute inset-0 opacity-[0.04]"
          style={{ backgroundImage: "linear-gradient(hsl(var(--foreground)) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--foreground)) 1px, transparent 1px)", backgroundSize: "56px 56px" }} />
      </div>

      <header className="relative z-10 px-8 py-5 flex items-center justify-between max-w-6xl mx-auto">
        <div className="flex items-center gap-2">
          <div className="h-7 w-7 rounded-md bg-foreground flex items-center justify-center">
            <span className="text-background font-display text-sm">P</span>
          </div>
          <span className="font-display text-sm">PharmaPrompt OS</span>
        </div>
        <Link
          to="/auth"
          className="text-sm rounded-lg bg-foreground text-background px-4 py-2 hover:bg-foreground/90 transition-colors"
        >
          Sign in
        </Link>
      </header>

      <section className="relative z-10 max-w-4xl mx-auto px-8 pt-20 pb-24">
        <motion.div
          initial="hidden"
          animate="show"
          variants={fadeUp}
          custom={0}
          className="inline-flex items-center gap-2 pp-chip text-[11px]"
        >
          <Sparkles className="h-3 w-3 text-accent" />
          Built for Australian community pharmacy
        </motion.div>

        <motion.h1
          initial="hidden"
          animate="show"
          variants={fadeUp}
          custom={1}
          className="mt-5 text-5xl md:text-7xl font-display font-medium leading-[1.02] tracking-tight"
        >
          Decision support that
          <span className="block italic text-muted-foreground">respects the pharmacist.</span>
        </motion.h1>

        <motion.p
          initial="hidden"
          animate="show"
          variants={fadeUp}
          custom={2}
          className="mt-7 text-lg text-muted-foreground max-w-2xl leading-relaxed"
        >
          PharmaPrompt OS reads a patient's medication list, history and presentation, and surfaces the
          guardrails and counselling prompts that matter — deterministically, with sources, without the
          chatbot theatre.
        </motion.p>

        <motion.div
          initial="hidden"
          animate="show"
          variants={fadeUp}
          custom={3}
          className="mt-9 flex flex-wrap gap-3"
        >
          <Link
            to="/auth"
            className="group inline-flex items-center gap-2 rounded-lg bg-foreground text-background px-5 py-3 text-sm font-medium hover:bg-foreground/90 transition-colors"
          >
            Sign in to start a review
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </Link>
          <a
            href="#how"
            className="inline-flex items-center rounded-lg border border-hairline px-5 py-3 text-sm font-medium hover:bg-muted/40 transition-colors"
          >
            How it works
          </a>
        </motion.div>

        <div id="how" className="mt-28 grid md:grid-cols-3 gap-4">
          {[
            { icon: ShieldCheck, title: "Safety-first", body: "Bleeding risk, mineral timing, renal cautions, pregnancy and breastfeeding suppression — fire before any product is suggested." },
            { icon: ListChecks, title: "Deterministic", body: "A curated ruleset and Australian medication dictionary. Same input, same output. Auditable. No hallucinations." },
            { icon: FileSearch, title: "Transparent", body: "Every card shows why it fired, what was matched, and the source. Pharmacist confirms before anything reaches the patient." },
          ].map((p, i) => (
            <motion.div
              key={p.title}
              initial="hidden"
              whileInView="show"
              viewport={{ once: true, margin: "-60px" }}
              variants={fadeUp}
              custom={i}
              className="pp-glass p-5"
            >
              <p.icon className="h-5 w-5 text-accent" />
              <h3 className="mt-3 font-display text-lg">{p.title}</h3>
              <p className="mt-1.5 text-sm text-muted-foreground leading-relaxed">{p.body}</p>
            </motion.div>
          ))}
        </div>
      </section>

      <footer className="relative z-10 border-t border-hairline px-8 py-5">
        <p className="max-w-4xl mx-auto text-[11px] text-muted-foreground">
          PharmaPrompt OS supports — it does not replace — pharmacist clinical judgement. Account access is
          provisioned per pharmacy.
        </p>
      </footer>
    </div>
  );
}
