/**
 * Precision-floor validation (Item 2).
 *
 * The "≥2 matched tags OR ≥1 symptom-map tag" rule is a heuristic, not
 * a spec. These tests drive the real `recommendProducts` against
 * three canonical cases to prove the floor doesn't over-suppress:
 *
 *   Case A — young healthy adult (25F, no conditions) with ONE symptom
 *            "fatigue".  Expected: a reasonable set of B12/energy
 *            products. Must NOT zero out.
 *
 *   Case B — adult, single clear nutrient need: "pregnancy planning"
 *            → folate.  Expected: Activated Folate 500 (HOG-0004)
 *            MUST surface. If the floor drops this, the rule is
 *            broken.
 *
 *   Case C — 90yo polypharmacy (regression from last session). Same
 *            fixture as the existing recommend-products-age-gate test.
 *
 * Each case uses the full HOG catalogue, runs the real exported
 * recommendProducts, and asserts the result.  These are the canonical
 * "did the floor over-suppress" canaries.
 */
import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { recommendProducts, type ProductRow } from "./recommend-products";
import type { PatientCtx } from "./engine";

const HOG_PATH = path.join(
  process.env.HOME ?? "/Users/hughn78",
  "herbsofgold_scraped/HerbsOfGold_KnowledgeBase/output/herbs_of_gold_products.json",
);

function loadCatalogue(): ProductRow[] {
  const raw = fs.readFileSync(HOG_PATH, "utf-8");
  const arr = JSON.parse(raw) as Array<{
    product_id: string;
    product_name: string;
    clinical_tags?: { clinical_use_tags?: string[]; avoid_if_tags?: string[] };
  }>;
  return arr.map((p) => ({
    product_id: p.product_id,
    name: p.product_name,
    brand: "Herbs of Gold",
    category: null,
    active_ingredients: [],
    indications: [],
    cautions: [],
    pack_sizes: [],
    schedule: null,
    reviewed: true,
    source_url: null,
    notes: null,
    clinical_use_tags: p.clinical_tags?.clinical_use_tags ?? [],
    avoid_if_tags: p.clinical_tags?.avoid_if_tags ?? [],
    medicine_interaction_flags: [],
    counselling_flags: [],
  }));
}

function baseCtx(overrides: Partial<PatientCtx>): PatientCtx {
  return {
    age: null,
    sex: "female",
    pregnancy_status: "not_applicable",
    breastfeeding_status: "not_applicable",
    allergies: "NKDA",
    medical_history: "",
    symptoms: "",
    counselling_goal: "",
    existing_supplements: "",
    pathology_notes: "",
    confirmed_medications: [],
    ...overrides,
  };
}

describe("recommendProducts — precision floor does not over-suppress (Item 2)", () => {
  const catalogue = loadCatalogue();

  it("CASE A: 25yo healthy F, symptom 'fatigue' → returns a non-empty, sensible set of B12/energy products", () => {
    // NOTE: baseCtx defaults symptoms to ''. The test must explicitly set
    // it to the symptom under test or the floor is correctly returning 0
    // (no drivers, no matches). Probe with `npx tsx scripts/probe-precision-floor.ts`
    // confirms the same engine returns 16 products when symptoms='fatigue'.
    const ctx = baseCtx({ age: 25, symptoms: "fatigue" });
    const recs = recommendProducts(ctx, catalogue, []);
    const ids = recs.map((r) => r.product_id);

    // Floor must not zero out
    expect(recs.length).toBeGreaterThan(0);
    // All products should be non-children's (we're an adult, no children's
    // products in the seed match the adult-only HOG catalogue on tags)
    expect(ids.every((id) => !id.includes("CHILD"))).toBe(true);
    // At least one B12 product should surface
    expect(
      ids.some((id) => {
        const p = catalogue.find((x) => x.product_id === id);
        return p?.clinical_use_tags.includes("b12_support");
      }),
    ).toBe(true);
    // Log so you can see exactly which products were selected
    console.log(
      "  CASE A returned",
      recs.length,
      "products:",
      recs.map((r) => `${r.product_id} ${r.title}`).slice(0, 20),
    );
  });

  it("CASE B: 32yo F, 'pregnancy planning' → Activated Folate 500 (HOG-0004) MUST surface", () => {
    // The critical assertion. If the precision floor drops HOG-0004
    // for a clear folate-need case, the floor is too aggressive.
    const ctx = baseCtx({
      age: 32,
      pregnancy_status: "planning",
      symptoms: "",
      counselling_goal: "pregnancy planning — want the right supplements before conceiving",
    });
    const recs = recommendProducts(ctx, catalogue, []);
    const ids = recs.map((r) => r.product_id);
    console.log(
      "  CASE B returned",
      recs.length,
      "products:",
      recs.map((r) => `${r.product_id} ${r.title}`),
    );

    // The headline assertion — Activated Folate 500 is the gold-
    // standard preconception product and must surface.
    expect(ids).toContain("HOG-0004");
    // Sanity: at least one other folate product should also be there
    const folateSurfaces = recs.filter((r) =>
      r.matched_product_tags?.includes("folate_support"),
    );
    expect(folateSurfaces.length).toBeGreaterThanOrEqual(2);
  });

  it("CASE C (regression): 90yo M polypharmacy → 0 children's products, finite count", () => {
    // Mirrors the existing age-gate regression test but as a true
    // Item 2 validation against the live catalogue.
    const ctx = baseCtx({
      age: 90,
      sex: "male",
      symptoms: "tiredness, low mood",
      counselling_goal: "general energy support",
      confirmed_medications: [
        { generic_name: "sertraline", drug_class: "ssri" },
        { generic_name: "olanzapine", drug_class: "antipsychotic_atypical" },
        { generic_name: "aripiprazole", drug_class: "antipsychotic_atypical" },
        { generic_name: "pantoprazole", drug_class: "ppi" },
        { generic_name: "empagliflozin", drug_class: "sglt2" },
      ],
    });
    const recs = recommendProducts(ctx, catalogue, []);
    const ids = recs.map((r) => r.product_id);
    const paedIds = ids.filter((id) => {
      const p = catalogue.find((x) => x.product_id === id);
      return p?.name.match(/^(Children|Child|Kid|Junior|Infant|Baby|Paediatric|Pediatric)/i);
    });
    console.log(
      "  CASE C returned",
      recs.length,
      "products, paed=",
      paedIds.length,
    );
    expect(paedIds).toEqual([]);
    expect(recs.length).toBeGreaterThan(0);
    expect(recs.length).toBeLessThan(catalogue.length); // sanity: floor did SOMETHING
  });
});
