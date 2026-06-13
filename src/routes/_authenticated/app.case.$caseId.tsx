import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { getCaseFn } from "@/lib/cases.functions";
import {
  exportCaseFn,
  getCaseFeedbackFn,
  submitFeedbackFn,
  undoFeedbackFn,
  type FeedbackStatus,
} from "@/lib/feedback.functions";
import {
  ShieldAlert,
  Clock,
  ClipboardCheck,
  MessageSquare,
  Pill,
  Printer,
  Sparkles,
  AlertTriangle,
  Check,
  Pencil,
  X,
  Flag,
  Download,
  ChevronDown,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/app/case/$caseId")({
  component: CaseResults,
});

type FeedbackRow = {
  feedback_id: string;
  recommendation_id: string | null;
  status: string;
  notes: string | null;
  created_at: string;
};

type RecRow = {
  recommendation_id: string;
  recommendation_type: string;
  title: string;
  product_id: string | null;
  product_name: string | null;
  brand: string | null;
  confidence: string;
  confidence_score: number | null;
  severity_tier: string | null;
  rank: number;
  why_triggered: string | null;
  pharmacist_checks: unknown;
  talking_points: unknown;
  safety_cautions: unknown;
  interaction_notes: unknown;
  matched_medicines: unknown;
  matched_patient_factors: unknown;
  matched_product_tags: unknown;
  matched_factors: unknown;
  source_references: unknown;
  mechanism: string | null;
  advice: string | null;
  safety_net: string | null;
  alternatives: unknown;
  onset: string | null;
};

type SeverityTier = "contraindicated" | "major" | "moderate" | "minor";

const SEVERITY_BADGE: Record<SeverityTier, { label: string; classes: string }> = {
  contraindicated: {
    label: "Contraindicated",
    classes: "bg-signal/10 text-signal border-signal/30",
  },
  major: {
    label: "Major",
    classes: "bg-signal/10 text-signal border-signal/30",
  },
  moderate: {
    label: "Moderate",
    classes: "bg-amber-500/10 text-amber-700 border-amber-500/30 dark:text-amber-400",
  },
  minor: {
    label: "Minor",
    classes: "bg-foreground/5 text-muted-foreground border-foreground/15",
  },
};

const TYPE_META: Record<string, { label: string; icon: typeof ShieldAlert; tone: string }> = {
  safety_caution: { label: "Safety caution", icon: ShieldAlert, tone: "signal" },
  administration: { label: "Administration & timing", icon: Clock, tone: "accent" },
  review_required: { label: "Review required", icon: ClipboardCheck, tone: "amber" },
  counselling_prompt: { label: "Counselling prompt", icon: MessageSquare, tone: "accent" },
  product_discussion: { label: "Product discussion", icon: Pill, tone: "muted" },
  product_recommendation: { label: "Recommended product", icon: Sparkles, tone: "accent" },
  red_flag: { label: "Red flag — refer", icon: Flag, tone: "signal" },
  otc_interaction: { label: "OTC × prescribed interaction", icon: ShieldAlert, tone: "signal" },
};

function asArr(v: unknown): string[] {
  return Array.isArray(v) ? (v as string[]) : [];
}

type SourceRef = { source: string; tier_label: string; note: string; url?: string };
function asRefs(v: unknown): SourceRef[] {
  return Array.isArray(v) ? (v as SourceRef[]) : [];
}

// -----------------------------------------------------------------------
// Problem 3 — report tidy
// -----------------------------------------------------------------------
// 1. The 4 "Pharmacist checks" on every product_recommendation card
//    are byte-identical (see recommend-products.ts lines 485-490).
//    Instead of repeating them on every card, render them once as a
//    shared header banner. The standard safety net ("Return if
//    symptoms persist or new symptoms develop") is also identical
//    across product recs and is collapsed into the same banner.
// 2. Talking points frequently duplicate the Advice line and repeat
//    the same bullet twice. De-dupe against advice + self-dedupe
//    (case-insensitive). Hide the section when nothing left.
// 3. Interaction notes are raw tag dumps (e.g. "sertraline, pantoprazole,
//    elderly, b12_support") — these are match debug, not counselling.
//    Move them behind a "Why this matched" expander. The expander
//    shows matched_product_tags + matched_medicines + matched_patient_factors
//    (the actual match debug) and is closed by default.
// 4. Group product_recommendation by severity (Contraindicated → Major
//    → Moderate → Minor). When a severity bucket has 3+ items, render
//    the Minor bucket as a compact name-only list rather than full
//    cards.

const STANDARD_PRODUCT_CHECKS = [
  "Confirm no allergies to listed active ingredients",
  "Cross-check with current medication list and dose",
  "Verify patient is not already on a duplicate product",
  "Discuss dose, timing with food/other medicines, and duration",
];

const STANDARD_PRODUCT_SAFETY_NET =
  "Return if symptoms persist or new symptoms develop.";

const SEVERITY_ORDER: SeverityTier[] = [
  "contraindicated",
  "major",
  "moderate",
  "minor",
];

/**
 * Remove talking_points that duplicate the advice line (case-insensitive)
 * or repeat a previous point. Returns the pruned list. Empty result
 * means the talking-points section should be hidden entirely.
 */
function dedupeTalkingPoints(
  advice: string | null | undefined,
  talkingPoints: string[],
): string[] {
  if (talkingPoints.length === 0) return [];
  const adviceNorm = (advice ?? "").trim().toLowerCase();
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of talkingPoints) {
    const t = (raw ?? "").trim();
    if (!t) continue;
    const k = t.toLowerCase();
    if (adviceNorm && k === adviceNorm) continue;
    if (adviceNorm && k.includes(adviceNorm) && adviceNorm.length > 8) continue;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(t);
  }
  return out;
}

function CaseResults() {
  const { caseId } = useParams({ from: "/_authenticated/app/case/$caseId" });
  const fetchCase = useServerFn(getCaseFn);
  const fetchFeedback = useServerFn(getCaseFeedbackFn);
  const exportCase = useServerFn(exportCaseFn);
  const { data, isLoading, error } = useQuery({
    queryKey: ["case", caseId],
    queryFn: () => fetchCase({ data: { caseId } }),
  });
  const feedbackQ = useQuery({
    queryKey: ["case-feedback", caseId],
    queryFn: () => fetchFeedback({ data: { caseId } }),
  });

  const handleExport = async (kind: "json" | "csv") => {
    try {
      const out = await exportCase({ data: { caseId } });
      const blob =
        kind === "json"
          ? new Blob([JSON.stringify(out.json, null, 2)], { type: "application/json" })
          : new Blob([out.csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `case-${caseId}.${kind}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Export failed");
    }
  };

  if (isLoading) return <div className="px-8 py-10 text-sm text-muted-foreground">Loading…</div>;
  if (error)
    return (
      <div className="px-8 py-10 text-sm text-signal">
        {error instanceof Error ? error.message : "Could not load case"}
      </div>
    );
  if (!data) return null;

  const {
    patientCase: p,
    recommendations: recs,
    senseCheck,
  } = data as typeof data & {
    senseCheck: null | {
      status: string;
      model: string;
      applied_changes: unknown;
      rejected_changes: unknown;
      error_message: string | null;
      latency_ms: number | null;
      raw_response: { overall_note?: string } | null;
    };
  };
  const grouped = (Object.keys(TYPE_META) as Array<keyof typeof TYPE_META>).map((t) => ({
    type: t,
    items: (recs as RecRow[]).filter((r) => r.recommendation_type === t),
  }));

  return (
    <div className="px-8 py-10 max-w-5xl mx-auto">
      <div className="flex items-start justify-between no-print">
        <div>
          <Link
            to="/app/cases"
            className="text-xs uppercase tracking-[0.16em] text-muted-foreground hover:text-foreground"
          >
            ← All reviews
          </Link>
          <h1 className="mt-2 text-3xl font-display font-medium">
            {p.case_label || `Patient · ${p.sex ?? "—"} · ${p.age ?? "?"}y`}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {recs.length} recommendation{recs.length === 1 ? "" : "s"} generated by deterministic
            rules.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => handleExport("json")}
            className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm hover:bg-secondary"
          >
            <Download className="h-4 w-4" /> JSON
          </button>
          <button
            onClick={() => handleExport("csv")}
            className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm hover:bg-secondary"
          >
            <Download className="h-4 w-4" /> CSV
          </button>
          <button
            onClick={() => window.print()}
            className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm hover:bg-secondary"
          >
            <Printer className="h-4 w-4" /> Print
          </button>
        </div>
      </div>

      <div className="mt-6 pp-flat p-4 grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
        <Meta k="Pregnancy" v={p.pregnancy_status ?? "—"} />
        <Meta k="Breastfeeding" v={p.breastfeeding_status ?? "—"} />
        <Meta k="Allergies" v={p.allergies || "NKDA"} />
        <Meta k="History" v={p.medical_history || "—"} />
        <Meta k="Symptoms" v={p.symptoms || "—"} />
        <Meta k="Goal" v={p.counselling_goal || "—"} />
        <Meta
          k="Medications"
          v={
            Array.isArray(p.confirmed_medications)
              ? (p.confirmed_medications as Array<{ generic_name: string }>)
                  .map((m) => m.generic_name)
                  .join(", ") || "—"
              : "—"
          }
        />
        <Meta k="Supplements" v={p.existing_supplements || "—"} />
      </div>

      {senseCheck && <SenseCheckBanner sc={senseCheck} />}

      {recs.length === 0 && (
        <div className="mt-8 pp-glass p-6">
          <p className="text-sm">
            No safety triggers fired for this combination. That doesn't mean there's nothing to do —
            apply your clinical judgement.
          </p>
        </div>
      )}

      <div className="mt-8 space-y-8">
        {grouped.map(
          (g) =>
            g.items.length > 0 && (
              <RecommendationGroup
                key={g.type}
                type={g.type}
                items={g.items as RecRow[]}
                feedback={feedbackQ.data}
                caseId={caseId}
              />
            ),
        )}
      </div>
    </div>
  );
}

function RecCard({
  r,
  caseId,
  latestStatus,
  latestNotes,
  suppressStandardProductBoilerplate,
}: {
  r: RecRow;
  caseId: string;
  latestStatus: FeedbackStatus | null;
  latestNotes: string | null;
  /**
   * When true, hide the per-card "Pharmacist checks" list and
   * safety_net line if they match the standard product ones —
   * the parent group renders a single shared banner instead.
   * Used inside a product_recommendation group.
   */
  suppressStandardProductBoilerplate?: boolean;
}) {
  const meta = TYPE_META[r.recommendation_type] ?? TYPE_META.review_required;
  const Icon = meta.icon;
  const isSafety = r.recommendation_type === "safety_caution";
  const isProduct = r.recommendation_type === "product_recommendation";

  // De-dupe talking_points against the advice line + self-dedupe.
  const talkingPoints = dedupeTalkingPoints(
    r.advice,
    asArr(r.talking_points),
  );

  // If the per-card pharmacist_checks and safety_net are the
  // standard product ones, suppress them — the group banner
  // covers them. For safety_cautions and other types we still
  // render the per-card details.
  const checks = asArr(r.pharmacist_checks);
  const isStandardChecks =
    checks.length === STANDARD_PRODUCT_CHECKS.length &&
    checks.every((c) => STANDARD_PRODUCT_CHECKS.includes(c));
  const showChecks = !(suppressStandardProductBoilerplate && isStandardChecks);

  const isStandardSafetyNet =
    (r.safety_net ?? "").trim() === STANDARD_PRODUCT_SAFETY_NET;
  const showSafetyNet = !(suppressStandardProductBoilerplate && isStandardSafetyNet);

  return (
    <article
      className={`pp-glass p-5 ${isSafety ? "pp-safety" : ""} ${isProduct ? "pp-product" : ""}`}
    >
      <div className="flex items-start gap-3">
        <Icon className={`h-5 w-5 mt-0.5 ${isSafety ? "text-signal" : "text-accent"}`} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <h3 className="font-display text-lg leading-snug">{r.title}</h3>
              {isProduct && (r.brand || r.product_id) && (
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {r.brand ? (
                    <span className="font-medium text-foreground/80">{r.brand}</span>
                  ) : null}
                  {r.brand && r.product_id ? " · " : ""}
                  {r.product_id ? <span className="font-mono">{r.product_id}</span> : null}
                </p>
              )}
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              {r.severity_tier && SEVERITY_BADGE[r.severity_tier as SeverityTier] && (
                <span
                  className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider ${SEVERITY_BADGE[r.severity_tier as SeverityTier].classes}`}
                  title={`Severity: ${SEVERITY_BADGE[r.severity_tier as SeverityTier].label}`}
                >
                  {SEVERITY_BADGE[r.severity_tier as SeverityTier].label}
                </span>
              )}
              <span className="pp-chip text-[11px]">
                {r.confidence} confidence
                {typeof r.confidence_score === "number" ? ` · ${r.confidence_score}` : ""}
              </span>
            </div>
          </div>
          {r.why_triggered && (
            <p className="mt-1.5 text-sm text-muted-foreground">{r.why_triggered}</p>
          )}

          {r.advice && (
            <div className="mt-3 rounded-md border border-accent/20 bg-accent/5 p-3">
              <p className="text-[11px] uppercase tracking-wider text-accent font-medium">Advice</p>
              <p className="mt-1 text-sm">{r.advice}</p>
            </div>
          )}

          {showSafetyNet && r.safety_net && (
            <div className="mt-2 rounded-md border border-amber-500/20 bg-amber-500/5 p-3">
              <p className="text-[11px] uppercase tracking-wider text-amber-700 dark:text-amber-400 font-medium">
                Safety net
              </p>
              <p className="mt-1 text-sm">{r.safety_net}</p>
            </div>
          )}

          {r.mechanism && (
            <p className="mt-2 text-xs text-muted-foreground italic">
              Mechanism: {r.mechanism}
            </p>
          )}

          {talkingPoints.length > 0 && (
            <div className="mt-3">
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
                Talking points
              </p>
              <ul className="mt-1.5 text-sm space-y-1 list-disc list-inside marker:text-accent">
                {talkingPoints.map((t, i) => (
                  <li key={i}>{t}</li>
                ))}
              </ul>
            </div>
          )}

          {showChecks && checks.length > 0 && (
            <div className="mt-3">
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
                Pharmacist checks
              </p>
              <ul className="mt-1.5 text-sm space-y-1 list-disc list-inside marker:text-foreground/40">
                {checks.map((t, i) => (
                  <li key={i}>{t}</li>
                ))}
              </ul>
            </div>
          )}

          {asArr(r.alternatives).length > 0 && (
            <div className="mt-3">
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
                Alternatives the pharmacist can offer
              </p>
              <ul className="mt-1.5 text-sm space-y-2">
                {asArr(r.alternatives).map((t, i) => {
                  const obj =
                    typeof t === "object" && t !== null
                      ? (t as { product_name?: string; rationale?: string })
                      : null;
                  return (
                    <li
                      key={i}
                      className="rounded-md border border-foreground/10 bg-foreground/[0.02] px-3 py-2"
                    >
                      {obj?.product_name ? (
                        <p className="font-medium">{obj.product_name}</p>
                      ) : (
                        <p className="font-medium">{String(t)}</p>
                      )}
                      {obj?.rationale && (
                        <p className="mt-0.5 text-xs text-muted-foreground">{obj.rationale}</p>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {asRefs(r.source_references).length > 0 && (
            <div className="mt-4 border-t border-hairline pt-3">
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Sources</p>
              <ul className="mt-1.5 text-xs space-y-1">
                {asRefs(r.source_references).map((s, i) => (
                  <li key={i} className="flex items-baseline gap-2">
                    <span className="pp-chip text-[10px] shrink-0">{s.tier_label}</span>
                    {s.url ? (
                      <a
                        href={s.url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-foreground hover:underline underline-offset-2"
                      >
                        {s.source}
                        {s.note ? ` — ${s.note}` : ""}
                      </a>
                    ) : (
                      <span className="text-muted-foreground">
                        <span className="text-foreground">{s.source}</span>
                        {s.note ? ` — ${s.note}` : ""}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* "Why this matched" expander — replaces the previous raw
              interaction_notes tag dump. Shows the matched_* arrays
              which are the actual match debug, closed by default. */}
          <WhyMatchedExpander r={r} isProduct={isProduct} />

          <FeedbackRow
            caseId={caseId}
            recommendationId={r.recommendation_id}
            latestStatus={latestStatus}
            latestNotes={latestNotes}
          />
        </div>
      </div>
    </article>
  );
}

// -----------------------------------------------------------------------
// "Why this matched" expander — Problem 3
// -----------------------------------------------------------------------
// Replaces the previous raw `interaction_notes` tag dump. Closed by
// default. The match-debug info is the matched_* arrays (medicines,
// patient factors, product tags). Pharmacists who want to see WHY a
// product fired can click to expand; patient-facing views (or quick
// scan of the report) just see a compact button label.
function WhyMatchedExpander({ r, isProduct }: { r: RecRow; isProduct: boolean }) {
  const [open, setOpen] = useState(false);
  const meds = asArr(r.matched_medicines);
  const factors = asArr(r.matched_patient_factors);
  const tags = isProduct ? asArr(r.matched_product_tags) : [];
  const total = meds.length + factors.length + tags.length;
  if (total === 0) return null;
  return (
    <div className="mt-3 no-print">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-muted-foreground hover:text-foreground"
        aria-expanded={open}
      >
        <ChevronDown
          className={`h-3 w-3 transition-transform ${open ? "rotate-0" : "-rotate-90"}`}
        />
        Why this matched
        <span className="text-foreground/50 normal-case">({total})</span>
      </button>
      {open && (
        <div className="mt-2 flex flex-wrap gap-2 text-[11px]">
          {meds.map((m, i) => (
            <span key={`m${i}`} className="pp-chip">
              {m}
            </span>
          ))}
          {factors.map((m, i) => (
            <span
              key={`f${i}`}
              className="pp-chip bg-accent/10 border-accent/20"
            >
              {m}
            </span>
          ))}
          {tags.map((t, i) => (
            <span
              key={`t${i}`}
              className="pp-chip bg-foreground/5 border-foreground/15"
            >
              {t}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// -----------------------------------------------------------------------
// Recommendation group — Problem 3
// -----------------------------------------------------------------------
// Renders one type-bucket (e.g. all product_recommendation recs) with:
//   - a shared header banner (the 4 standard pharmacist_checks + the
//     standard safety net, rendered ONCE, not per card)
//   - a sub-grouping by severity (Contraindicated → Major → Moderate →
//     Minor), and for the Minor bucket in product_recommendation with
//     3+ items, a compact name-only list.
function RecommendationGroup({
  type,
  items,
  feedback,
  caseId,
}: {
  type: keyof typeof TYPE_META;
  items: RecRow[];
  feedback: FeedbackRow[] | undefined;
  caseId: string;
}) {
  const isProduct = type === "product_recommendation";

  // Sub-group by severity in the deterministic order
  // (contraindicated → major → moderate → minor). Recs without a
  // severity_tier fall into the "minor" bucket for display.
  const buckets: Record<SeverityTier, RecRow[]> = {
    contraindicated: [],
    major: [],
    moderate: [],
    minor: [],
  };
  for (const r of items) {
    const s = (r.severity_tier as SeverityTier) ?? "minor";
    if (buckets[s]) buckets[s].push(r);
    else buckets.minor.push(r);
  }

  // Minor product bucket with 3+ items → compact list, not full cards.
  const minorCompact = isProduct && buckets.minor.length >= 3;
  // Severity sub-buckets only render inside product_recommendation.
  // For other types the cards keep the existing simple stack.
  const showSubGroups = isProduct;

  return (
    <section>
      <h2 className="text-xs uppercase tracking-[0.18em] text-muted-foreground mb-3">
        {TYPE_META[type].label} · {items.length}
      </h2>

      {isProduct && (
        <StandardProductBanner />
      )}

      {!showSubGroups ? (
        <div className="space-y-3">
          {items.map((r) => {
            const latest = (feedback ?? []).find(
              (f) => f.recommendation_id === r.recommendation_id,
            );
            return (
              <RecCard
                key={r.recommendation_id}
                r={r}
                caseId={caseId}
                latestStatus={(latest?.status as FeedbackStatus | undefined) ?? null}
                latestNotes={latest?.notes ?? null}
              />
            );
          })}
        </div>
      ) : (
        <div className="space-y-6">
          {SEVERITY_ORDER.filter(
            (s) => buckets[s].length > 0,
          ).map((s) => {
            const bucket = buckets[s];
            const compact = s === "minor" && minorCompact;
            return (
              <div key={s}>
                <h3 className="text-[10px] uppercase tracking-wider text-muted-foreground/80 mb-2 flex items-center gap-2">
                  <span>{SEVERITY_BADGE[s].label}</span>
                  <span className="text-foreground/50">·</span>
                  <span className="text-foreground/60">{bucket.length}</span>
                </h3>
                {compact ? (
                  <CompactMinorList
                    items={bucket}
                    feedback={feedback}
                    caseId={caseId}
                  />
                ) : (
                  <div className="space-y-3">
                    {bucket.map((r) => {
                      const latest = (feedback ?? []).find(
                        (f) => f.recommendation_id === r.recommendation_id,
                      );
                      return (
                        <RecCard
                          key={r.recommendation_id}
                          r={r}
                          caseId={caseId}
                          latestStatus={(latest?.status as FeedbackStatus | undefined) ?? null}
                          latestNotes={latest?.notes ?? null}
                          suppressStandardProductBoilerplate
                        />
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function StandardProductBanner() {
  return (
    <div className="mb-3 rounded-md border border-border/60 bg-foreground/[0.02] p-3 text-xs text-muted-foreground">
      <p className="text-[10px] uppercase tracking-wider text-foreground/60 font-medium">
        Standard pharmacist checks · applied to all product cards below
      </p>
      <ul className="mt-1.5 list-disc list-inside space-y-0.5">
        {STANDARD_PRODUCT_CHECKS.map((c) => (
          <li key={c}>{c}</li>
        ))}
      </ul>
      <p className="mt-1.5 text-foreground/70">
        <span className="font-medium">Safety net:</span> {STANDARD_PRODUCT_SAFETY_NET}
      </p>
    </div>
  );
}

function CompactMinorList({
  items,
  feedback,
  caseId,
}: {
  items: RecRow[];
  feedback: FeedbackRow[] | undefined;
  caseId: string;
}) {
  // Compact list = name + brand/product_id only. Click to expand a
  // full card; an alternative would be a modal. For now we keep a
  // single-row clickable list and lazy-render the full card below.
  return (
    <ul className="rounded-md border border-border/60 divide-y divide-border/40 bg-background text-sm">
      {items.map((r) => {
        const latest = (feedback ?? []).find(
          (f) => f.recommendation_id === r.recommendation_id,
        );
        return (
          <li key={r.recommendation_id} className="px-3 py-2">
            <details>
              <summary className="flex items-center justify-between gap-3 cursor-pointer list-none">
                <span className="min-w-0 flex-1">
                  <span className="font-medium">{r.title}</span>
                  {r.brand && (
                    <span className="ml-2 text-xs text-muted-foreground">{r.brand}</span>
                  )}
                  {r.product_id && (
                    <span className="ml-2 text-xs font-mono text-muted-foreground/80">
                      {r.product_id}
                    </span>
                  )}
                </span>
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground shrink-0">
                  {r.confidence}
                </span>
              </summary>
              <div className="mt-3">
                <RecCard
                  r={r}
                  caseId={caseId}
                  latestStatus={(latest?.status as FeedbackStatus | undefined) ?? null}
                  latestNotes={latest?.notes ?? null}
                  suppressStandardProductBoilerplate
                />
              </div>
            </details>
          </li>
        );
      })}
    </ul>
  );
}

function Meta({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{k}</p>
      <p className="text-sm">{v}</p>
    </div>
  );
}

type SenseCheckProps = {
  sc: {
    status: string;
    model: string;
    applied_changes: unknown;
    rejected_changes: unknown;
    error_message: string | null;
    latency_ms: number | null;
    raw_response: { overall_note?: string } | null;
  };
};

function SenseCheckBanner({ sc }: SenseCheckProps) {
  const applied = Array.isArray(sc.applied_changes)
    ? (sc.applied_changes as Array<{ action: string }>)
    : [];
  const rejected = Array.isArray(sc.rejected_changes)
    ? (sc.rejected_changes as Array<{ action: string }>)
    : [];
  const note = sc.raw_response?.overall_note;

  if (sc.status === "ok") {
    return (
      <div className="mt-6 pp-glass p-4 flex items-start gap-3">
        <Sparkles className="h-5 w-5 mt-0.5 text-accent shrink-0" />
        <div className="flex-1 text-sm">
          <p className="font-medium">
            AI sense-check passed
            <span className="ml-2 text-xs text-muted-foreground">
              {applied.length} applied · {rejected.length} rejected by safer-only guard
              {sc.latency_ms ? ` · ${sc.latency_ms}ms` : ""}
            </span>
          </p>
          {note && <p className="mt-1 text-muted-foreground">{note}</p>}
          <p className="mt-1 text-xs text-muted-foreground">
            Deterministic rules remain the source of truth. AI can only lower confidence, add
            cautions, or flag for review.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-6 pp-glass p-4 flex items-start gap-3 border-amber-500/30">
      <AlertTriangle className="h-5 w-5 mt-0.5 text-amber-500 shrink-0" />
      <div className="flex-1 text-sm">
        <p className="font-medium">
          AI sense-check unavailable — showing deterministic recommendations only.
        </p>
        {sc.error_message && (
          <p className="mt-1 text-xs text-muted-foreground">{sc.error_message}</p>
        )}
      </div>
    </div>
  );
}

const STATUS_META: Record<FeedbackStatus, { label: string; icon: typeof Check; tone: string }> = {
  accepted: { label: "Accepted", icon: Check, tone: "text-accent" },
  modified: { label: "Modified", icon: Pencil, tone: "text-amber-500" },
  declined: { label: "Declined", icon: X, tone: "text-muted-foreground" },
  escalated: { label: "Escalated for review", icon: Flag, tone: "text-signal" },
};

function FeedbackRow({
  caseId,
  recommendationId,
  latestStatus,
  latestNotes,
}: {
  caseId: string;
  recommendationId: string;
  latestStatus: FeedbackStatus | null;
  latestNotes: string | null;
}) {
  const qc = useQueryClient();
  const submit = useServerFn(submitFeedbackFn);
  const undo = useServerFn(undoFeedbackFn);
  const [notes, setNotes] = useState(latestNotes ?? "");
  const [showNotes, setShowNotes] = useState(false);

  const submitMut = useMutation({
    mutationFn: (s: FeedbackStatus) =>
      submit({
        data: {
          case_id: caseId,
          recommendation_id: recommendationId,
          status: s,
          notes: notes.trim() || undefined,
        },
      }),
    onSuccess: (_d, s) => {
      qc.invalidateQueries({ queryKey: ["case-feedback", caseId] });
      toast(`Marked ${STATUS_META[s].label.toLowerCase()}`, {
        action: {
          label: "Undo",
          onClick: async () => {
            await undo({ data: { recommendation_id: recommendationId } });
            qc.invalidateQueries({ queryKey: ["case-feedback", caseId] });
          },
        },
      });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not save feedback"),
  });

  if (latestStatus) {
    const m = STATUS_META[latestStatus];
    const Icon = m.icon;
    return (
      <div className="mt-4 border-t border-hairline pt-3 flex items-center justify-between gap-3 no-print">
        <div className={`flex items-center gap-2 text-sm ${m.tone}`}>
          <Icon className="h-4 w-4" />
          <span>{m.label}</span>
          {latestNotes && <span className="text-muted-foreground">· {latestNotes}</span>}
        </div>
        <button
          className="text-xs text-muted-foreground hover:text-foreground underline-offset-2 hover:underline"
          onClick={async () => {
            await undo({ data: { recommendation_id: recommendationId } });
            qc.invalidateQueries({ queryKey: ["case-feedback", caseId] });
          }}
        >
          Undo
        </button>
      </div>
    );
  }

  const Btn = ({ s, icon: I, label }: { s: FeedbackStatus; icon: typeof Check; label: string }) => (
    <button
      onClick={() => submitMut.mutate(s)}
      disabled={submitMut.isPending}
      className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs hover:bg-secondary disabled:opacity-50"
    >
      <I className="h-3.5 w-3.5" /> {label}
    </button>
  );

  return (
    <div className="mt-4 border-t border-hairline pt-3 no-print">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Btn s="accepted" icon={Check} label="Accept" />
          <Btn s="modified" icon={Pencil} label="Modify" />
          <Btn s="declined" icon={X} label="Decline" />
          <Btn s="escalated" icon={Flag} label="Escalate" />
        </div>
        <button
          className="text-xs text-muted-foreground hover:text-foreground"
          onClick={() => setShowNotes((v) => !v)}
        >
          {showNotes ? "Hide note" : "Add note"}
        </button>
      </div>
      {showNotes && (
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Short note (optional) — included with the feedback record."
          className="mt-2 w-full text-sm rounded-md border border-border bg-background px-3 py-2"
          rows={2}
        />
      )}
    </div>
  );
}
