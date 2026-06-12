import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { listCasesFn } from "@/lib/cases.functions";
import { FilePlus2, ListChecks, ShieldCheck } from "lucide-react";

export const Route = createFileRoute("/_authenticated/app/")({
  component: HomePage,
});

function HomePage() {
  const fetchCases = useServerFn(listCasesFn);
  const { data: cases } = useQuery({
    queryKey: ["cases", "recent"],
    queryFn: () => fetchCases(),
  });

  return (
    <div className="px-8 py-10 max-w-5xl mx-auto">
      <div className="flex items-end justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Counter view</p>
          <h1 className="mt-1 text-3xl font-display font-medium">Good day.</h1>
          <p className="mt-2 text-muted-foreground">
            Start a new review or pick up where you left off. Recommendations are deterministic and source-aware.
          </p>
        </div>
        <Link
          to="/app/review"
          className="inline-flex items-center gap-2 rounded-lg bg-foreground text-background px-4 py-2.5 text-sm font-medium hover:bg-foreground/90"
        >
          <FilePlus2 className="h-4 w-4" />
          New review
        </Link>
      </div>

      <div className="mt-10 grid grid-cols-1 md:grid-cols-3 gap-4">
        <Link to="/app/review" className="pp-glass p-5 hover:shadow-lg transition-shadow">
          <FilePlus2 className="h-5 w-5 text-accent" />
          <h3 className="mt-3 font-display text-lg">Start a review</h3>
          <p className="mt-1 text-sm text-muted-foreground">3 steps. Patient → confirm meds → results.</p>
        </Link>
        <Link to="/app/cases" className="pp-glass p-5 hover:shadow-lg transition-shadow">
          <ListChecks className="h-5 w-5 text-accent" />
          <h3 className="mt-3 font-display text-lg">Past reviews</h3>
          <p className="mt-1 text-sm text-muted-foreground">{cases?.length ?? 0} on record.</p>
        </Link>
        <Link to="/app/rules" className="pp-glass p-5 hover:shadow-lg transition-shadow">
          <ShieldCheck className="h-5 w-5 text-accent" />
          <h3 className="mt-3 font-display text-lg">Safety rules</h3>
          <p className="mt-1 text-sm text-muted-foreground">Inspect the guardrails behind every result.</p>
        </Link>
      </div>

      <section className="mt-12">
        <h2 className="text-sm uppercase tracking-[0.16em] text-muted-foreground">Recent</h2>
        <div className="mt-3 pp-flat divide-y divide-hairline">
          {(cases ?? []).slice(0, 8).map((c) => (
            <Link
              key={c.case_id}
              to="/app/case/$caseId"
              params={{ caseId: c.case_id }}
              className="flex items-center justify-between px-4 py-3 hover:bg-secondary/40"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">
                  {c.case_label || `${c.sex ?? "Patient"} · ${c.age ?? "?"}y`}
                </p>
                <p className="text-xs text-muted-foreground truncate">{c.symptoms || "—"}</p>
              </div>
              <span className="text-xs text-muted-foreground">
                {new Date(c.created_at).toLocaleDateString("en-AU")}
              </span>
            </Link>
          ))}
          {cases && cases.length === 0 && (
            <p className="px-4 py-6 text-sm text-muted-foreground">
              No reviews yet. Start with the sample patient: 68F on metformin, aspirin, coversyl plus, cramps.
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
