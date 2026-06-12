/**
 * Integration test: run the real recommendProducts() against the real
 * Herbs of Gold catalogue (loaded from disk) for a realistic T2DM patient
 * on metformin with fatigue. This test guards against regressions in the
 * matching logic when the catalogue is updated.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { recommendProducts, type ProductRow } from "./recommend-products";
import type { SafetyRuleRow, PatientCtx } from "./engine";

const CATALOGUE_PATH = join(
  process.env.HOME ?? "/tmp",
  "herbsofgold_scraped/HerbsOfGold_KnowledgeBase/output/herbs_of_gold_products.json",
);

type HogIngredient = {
  ingredient_name?: string;
  strength?: string | number;
  strength_unit?: string;
};
type HogIndication = { text?: string };
type HogCaution = { text?: string };
type HogProduct = {
  product_id: string;
  product_name: string;
  brand?: string;
  ingredients?: HogIngredient[];
  indications?: HogIndication[];
  cautions?: HogCaution[];
  pack_size?: string;
  clinical_tags?: {
    clinical_use_tags?: string[];
    avoid_if_tags?: string[];
    medicine_interaction_flags?: string[];
    counselling_flags?: string[];
  };
};

function mapHogProduct(p: HogProduct): ProductRow {
  const ct = p.clinical_tags ?? {};
  return {
    product_id: p.product_id,
    name: p.product_name,
    brand: p.brand ?? "Herbs of Gold",
    category: "supplement",
    active_ingredients: (p.ingredients ?? []).map((i) =>
      `${i.ingredient_name ?? ""} ${i.strength ?? ""}${i.strength_unit ?? ""}`.trim(),
    ),
    indications: (p.indications ?? []).map((i) => i.text ?? "").filter(Boolean),
    cautions: (p.cautions ?? []).map((c) => c.text ?? "").filter(Boolean),
    pack_sizes: p.pack_size ? [p.pack_size] : [],
    schedule: null,
    reviewed: true,
    source_url: null,
    notes: p.product_id,
    clinical_use_tags: ct.clinical_use_tags ?? [],
    avoid_if_tags: ct.avoid_if_tags ?? [],
    medicine_interaction_flags: ct.medicine_interaction_flags ?? [],
    counselling_flags: ct.counselling_flags ?? [],
  };
}

describe("recommendProducts — integration against real Herbs of Gold catalogue", () => {
  let products: ProductRow[] = [];

  beforeAll(() => {
    const raw = JSON.parse(readFileSync(CATALOGUE_PATH, "utf-8"));
    products = raw.map(mapHogProduct);
  });

  it("catalogue loads and has 100+ products", () => {
    expect(products.length).toBeGreaterThanOrEqual(100);
    expect(products.length).toBeLessThan(120);
  });

  it("every reviewed product has an id, name, and clinical_use_tags", () => {
    for (const p of products) {
      expect(p.product_id).toBeTruthy();
      expect(p.name).toBeTruthy();
      expect(Array.isArray(p.clinical_use_tags)).toBe(true);
    }
  });

  it("metformin + fatigue patient gets a B12 product recommendation", () => {
    const ctx: PatientCtx = {
      age: 58,
      sex: "male",
      pregnancy_status: "not_applicable",
      breastfeeding_status: "not_applicable",
      allergies: "NKDA",
      medical_history: "T2DM",
      symptoms: "fatigue, low energy",
      counselling_goal: "energy",
      existing_supplements: "",
      pathology_notes: "",
      confirmed_medications: [{ generic_name: "metformin", drug_class: "diabetes" }],
    };
    const recs = recommendProducts(ctx, products, []);
    const ids = recs.map((r) => r.product_id);
    // At least one B12 product should be in the recommendations
    const b12Rec = recs.find((r) => r.matched_product_tags.includes("b12_support"));
    expect(b12Rec, `expected a B12 recommendation, got: ${ids.join(", ")}`).toBeDefined();
  });

  it("warfarin patient gets NO fish oil product even if heart_health tag fires", () => {
    const ctx: PatientCtx = {
      age: 70,
      sex: "male",
      pregnancy_status: "not_applicable",
      breastfeeding_status: "not_applicable",
      allergies: "NKDA",
      medical_history: "AF",
      symptoms: "",
      counselling_goal: "",
      existing_supplements: "",
      pathology_notes: "",
      confirmed_medications: [{ generic_name: "warfarin", drug_class: "anticoagulant" }],
    };
    const recs = recommendProducts(ctx, products, []);
    for (const r of recs) {
      const ings = r.talking_points.join(" ").toLowerCase();
      expect(ings).not.toContain("fish oil");
      expect(ings).not.toContain("omega");
      // Also check the product's avoid_if_tags include a warfarin-relevant tag
      const product = products.find((p) => p.product_id === r.product_id);
      if (product) {
        const hasWarfarinFlag = product.avoid_if_tags.some((t) =>
          ["warfarin", "anticoagulant_review_required", "doac"].includes(t),
        );
        expect(hasWarfarinFlag, `${r.product_id} is recommended despite warfarin context`).toBe(
          false,
        );
      }
    }
  });

  it("pregnant patient gets NO product flagged pregnancy_review_required", () => {
    const ctx: PatientCtx = {
      age: 30,
      sex: "female",
      pregnancy_status: "yes",
      breastfeeding_status: "no",
      allergies: "NKDA",
      medical_history: "",
      symptoms: "fatigue",
      counselling_goal: "",
      existing_supplements: "",
      pathology_notes: "",
      confirmed_medications: [],
    };
    const recs = recommendProducts(ctx, products, []);
    for (const r of recs) {
      const product = products.find((p) => p.product_id === r.product_id);
      expect(
        product?.avoid_if_tags.includes("pregnancy_review_required"),
        `${r.product_id} flagged pregnancy but was recommended for pregnant patient`,
      ).toBe(false);
    }
  });

  it("CKD patient gets NO product flagged renal_impairment_caution", () => {
    const ctx: PatientCtx = {
      age: 70,
      sex: "male",
      pregnancy_status: "not_applicable",
      breastfeeding_status: "not_applicable",
      allergies: "NKDA",
      medical_history: "CKD stage 3",
      symptoms: "fatigue",
      counselling_goal: "",
      existing_supplements: "",
      pathology_notes: "",
      confirmed_medications: [],
    };
    const recs = recommendProducts(ctx, products, []);
    for (const r of recs) {
      const product = products.find((p) => p.product_id === r.product_id);
      expect(
        product?.avoid_if_tags.includes("renal_impairment_caution"),
        `${r.product_id} flagged renal but was recommended for CKD patient`,
      ).toBe(false);
    }
  });

  it("elderly post-menopausal female gets calcium + vit D recommendations", () => {
    const ctx: PatientCtx = {
      age: 68,
      sex: "female",
      pregnancy_status: "not_applicable",
      breastfeeding_status: "not_applicable",
      allergies: "NKDA",
      medical_history: "postmenopausal",
      symptoms: "",
      counselling_goal: "bone health",
      existing_supplements: "",
      pathology_notes: "",
      confirmed_medications: [],
    };
    const recs = recommendProducts(ctx, products, []);
    const hasCalcium = recs.some((r) =>
      r.matched_product_tags.some(
        (t) => t === "calcium_support" || t === "vitamin_d_support" || t === "bone_health",
      ),
    );
    expect(
      hasCalcium,
      `expected a Ca/vit D rec, got: ${recs.map((r) => r.title).join(" | ")}`,
    ).toBe(true);
  });

  // Regression lock-in: there was a bug where the suppression map
  // FACTOR_TO_AVOID[factor] = [tags] was being queried by tag (the wrong key),
  // which silently let products through that should have been suppressed.
  it("suppression lookup is keyed by factor, not by avoid_if_tag", () => {
    // HOG-0001 has avoid_if_tag "pregnancy_review_required" and a single
    // clinical_use_tag "energy_support". If the suppression map is keyed
    // by tag, the lookup returns undefined and the product slips through.
    // This test would have caught that bug at unit-test time.
    const ctx: PatientCtx = {
      age: 30,
      sex: "female",
      pregnancy_status: "yes",
      breastfeeding_status: "no",
      allergies: "NKDA",
      medical_history: "",
      symptoms: "",
      counselling_goal: "",
      existing_supplements: "",
      pathology_notes: "",
      confirmed_medications: [],
    };
    const justHog1: ProductRow[] = [
      {
        product_id: "HOG-0001",
        name: "Acetyl L-Carnitine",
        brand: "Herbs of Gold",
        category: "supplement",
        active_ingredients: ["acetyl l-carnitine 500mg"],
        indications: [],
        cautions: [],
        pack_sizes: [],
        schedule: null,
        reviewed: true,
        source_url: null,
        notes: "HOG-0001",
        clinical_use_tags: ["energy_support"],
        avoid_if_tags: ["pregnancy_review_required"],
        medicine_interaction_flags: [],
        counselling_flags: [],
      },
    ];
    const recs = recommendProducts(ctx, justHog1, []);
    expect(recs).toHaveLength(0);
  });
});
