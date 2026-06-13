/**
 * Pure helpers for the case report presentation (Problem 3).
 *
 * Kept in src/lib/ so they're testable without spinning up React/Tanstack.
 * The route file imports these and uses them inside RecCard /
 * RecommendationGroup.
 */

/**
 * De-dupe talking points against the advice line + self-dedupe
 * (case-insensitive). An empty result means the talking-points
 * section should be hidden entirely from the on-screen report.
 *
 * Behaviour:
 *   - Skip empty / whitespace-only strings
 *   - Skip a point that exactly matches advice (case-insensitive)
 *   - Skip a point that CONTAINS the advice line, but only if the
 *     advice line is > 8 characters (avoids "Take it" eating
 *     "Take it with food")
 *   - Skip duplicates of earlier points (case-insensitive)
 */
export function dedupeTalkingPoints(
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

/**
 * The four pharmacist checks that every product_recommendation
 * card attaches. Identical across all product cards (see
 * recommend-products.ts lines 485-490). Used to detect the
 * standard boilerplate in the per-card payload and to render
 * the shared banner once per product group.
 */
export const STANDARD_PRODUCT_CHECKS = [
  "Confirm no allergies to listed active ingredients",
  "Cross-check with current medication list and dose",
  "Verify patient is not already on a duplicate product",
  "Discuss dose, timing with food/other medicines, and duration",
];

/** Standard safety-net line for product_recommendation cards. */
export const STANDARD_PRODUCT_SAFETY_NET =
  "Return if symptoms persist or new symptoms develop.";

export function isStandardProductChecks(checks: string[]): boolean {
  return (
    checks.length === STANDARD_PRODUCT_CHECKS.length &&
    checks.every((c) => STANDARD_PRODUCT_CHECKS.includes(c))
  );
}

export function isStandardProductSafetyNet(s: string | null | undefined): boolean {
  return (s ?? "").trim() === STANDARD_PRODUCT_SAFETY_NET;
}
