import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { listCasesFn } from "@/lib/cases.functions";

export const Route = createFileRoute("/_authenticated/app/cases")({
  component: CasesPage,
});

function CasesPage() {
  const fn = useServerFn(listCasesFn);
  const { data } = useQuery({ queryKey: ["cases"], queryFn: () => fn({ data: undefined as never }) });
  return (
    <div className="px-8 py-10 max-w-4xl mx-auto">
      <h1 className="text-2xl font-display font-medium">Past reviews</h1>
      <div className="mt-5 pp-flat divide-y divide-hairline">
        {(data ?? []).map((c) => (
          <Link
            key={c.case_id}
            to="/app/case/$caseId"
            params={{ caseId: c.case_id }}
            className="block px-4 py-3 hover:bg-secondary/40"
          >
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">
                {c.case_label || `${c.sex ?? "Patient"} · ${c.age ?? "?"}y`}
              </p>
              <span className="text-xs text-muted-foreground">
                {new Date(c.created_at).toLocaleString("en-AU")}
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5 truncate">{c.symptoms || "—"}</p>
          </Link>
        ))}
        {data && data.length === 0 && (
          <p className="px-4 py-6 text-sm text-muted-foreground">No reviews yet.</p>
        )}
      </div>
    </div>
  );
}
