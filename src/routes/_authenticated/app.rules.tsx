import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { listSafetyRulesFn } from "@/lib/cases.functions";

export const Route = createFileRoute("/_authenticated/app/rules")({
  component: RulesPage,
});

function RulesPage() {
  const fn = useServerFn(listSafetyRulesFn);
  const { data } = useQuery({ queryKey: ["rules"], queryFn: () => fn({ data: undefined as never }) });
  return (
    <div className="px-8 py-10 max-w-4xl mx-auto">
      <h1 className="text-2xl font-display font-medium">Safety rules</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Read-only view of the deterministic guardrails that fire during a review.
      </p>
      <div className="mt-6 space-y-3">
        {(data ?? []).map((r) => (
          <div key={r.rule_id} className="pp-glass p-5">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-lg">{r.name}</h3>
              <span className="pp-chip text-[11px]">{r.severity}</span>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">{r.description}</p>
            <p className="mt-3 text-sm">{r.pharmacist_message}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {(r.trigger_drug_classes ?? []).map((c) => (
                <span key={c} className="pp-chip text-[11px]">cls: {c}</span>
              ))}
              {(r.trigger_patient_factors ?? []).map((c) => (
                <span key={c} className="pp-chip text-[11px] bg-accent/10 border-accent/20">factor: {c}</span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
