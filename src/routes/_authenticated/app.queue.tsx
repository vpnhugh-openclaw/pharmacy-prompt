import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { listQueueFn } from "@/lib/feedback.functions";
import { Inbox, Flag, ShieldAlert, ClipboardCheck } from "lucide-react";

export const Route = createFileRoute("/_authenticated/app/queue")({
  component: QueuePage,
  errorComponent: ({ error }) => <div className="p-8 text-sm text-destructive">{error.message}</div>,
  notFoundComponent: () => <div className="p-8">Not found</div>,
});

function QueuePage() {
  const fetchQueue = useServerFn(listQueueFn);
  const { data, isLoading, error } = useQuery({
    queryKey: ["queue"],
    queryFn: () => fetchQueue(),
  });

  return (
    <div className="mx-auto max-w-5xl p-6 md:p-10 space-y-6">
      <header>
        <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Queue</p>
        <h1 className="font-display text-3xl mt-1">Needs pharmacist review</h1>
        <p className="text-sm text-muted-foreground mt-2 max-w-prose">
          Cases with recommendations that triggered a safety caution or require direct pharmacist verification. Items
          disappear from the queue once you accept or decline them on the case page.
        </p>
      </header>

      {isLoading && <div className="text-sm text-muted-foreground">Loading…</div>}
      {error && <div className="text-sm text-signal">{error instanceof Error ? error.message : "Error"}</div>}

      {data && data.groups.length === 0 && (
        <div className="pp-glass p-10 text-center">
          <Inbox className="h-8 w-8 mx-auto text-muted-foreground" />
          <div className="font-display text-lg mt-3">Queue is clear</div>
          <div className="text-sm text-muted-foreground mt-1">
            No outstanding safety cautions or review-required items right now.
          </div>
        </div>
      )}

      <div className="space-y-4">
        {data?.groups.map((g) => {
          const c = g.patientCase as {
            case_id: string;
            case_label: string | null;
            age: number | null;
            sex: string | null;
            symptoms: string | null;
            created_at: string;
          };
          const items = g.items as Array<{
            recommendation_id: string;
            title: string;
            recommendation_type: string;
            confidence: string;
            latest_status: string | null;
          }>;
          return (
            <Link
              key={c.case_id}
              to="/app/case/$caseId"
              params={{ caseId: c.case_id }}
              className="block pp-glass p-5 hover:bg-secondary/40 transition"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="font-display text-lg">
                    {c.case_label || `Patient · ${c.sex ?? "—"} · ${c.age ?? "?"}y`}
                  </h2>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {new Date(c.created_at).toLocaleString()} · {c.symptoms || "—"}
                  </p>
                </div>
                <span className="pp-chip text-[11px]">{items.length} flagged</span>
              </div>
              <ul className="mt-3 space-y-1.5">
                {items.map((i) => {
                  const Icon =
                    i.recommendation_type === "safety_caution"
                      ? ShieldAlert
                      : i.latest_status === "escalated"
                      ? Flag
                      : ClipboardCheck;
                  const tone =
                    i.recommendation_type === "safety_caution"
                      ? "text-signal"
                      : i.latest_status === "escalated"
                      ? "text-signal"
                      : "text-amber-600";
                  return (
                    <li key={i.recommendation_id} className="flex items-start gap-2 text-sm">
                      <Icon className={`h-4 w-4 mt-0.5 ${tone}`} />
                      <span className="flex-1">{i.title}</span>
                      {i.latest_status && (
                        <span className="pp-chip text-[10px] capitalize">{i.latest_status}</span>
                      )}
                    </li>
                  );
                })}
              </ul>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
