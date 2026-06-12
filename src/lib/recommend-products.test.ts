/**
 * Tests for the new product-recommendation pass.
 *
 * Permissive matching strategy:
 *   1. For each product, compute a set of "trigger tags" from clinical_use_tags
 *      (e.g. "b12_support", "magnesium_support", "energy_support", "immune_support").
 *   2. Match product trigger tags against:
 *        - drug-class → tag map (e.g. metformin → b12_support)
 *        - patient-factor → tag map (e.g. elderly → calcium_support, vitamin_d_support)
 *        - symptom/goal keyword → tag map (e.g. "cramp" → magnesium_support)
 *   3. SUPPRESS the product if it has an avoid_if_tag that the engine has flagged
 *      for this patient (e.g. pregnancy, renal_impairment, warfarin, quinolone).
 *   4. SUPPRESS duplicate ingredients (existing_supplement_duplication factor).
 *   5. Output: product_recommendation records with product_id, brand, name,
 *      matched_product_tags, talking_points, why_triggered.
 */
import { describe, it, expect } from "vitest";
import {
  recommendProducts,
  type ProductRow,
  type DrugClassTagMap,
  type FactorTagMap,
  type SymptomTagMap,
} from "./recommend-products";
import type { SafetyRuleRow, PatientCtx } from "./engine";

// Minimal stand-in for a SafetyRuleRow that still has avoid_product_keywords
function makeRule(
  id: string,
  avoidKeywords: string[] = [],
  patientFactors: string[] = [],
): SafetyRuleRow {
  return {
    rule_id: id,
    name: id,
    description: "",
    trigger_drug_classes: [],
    trigger_patient_factors: patientFactors,
    avoid_product_keywords: avoidKeywords,
    severity: "Medium",
    recommendation_type: "review_required",
    pharmacist_message: "",
    pharmacist_checks: [],
    review_required: false,
  };
}

// Minimal product factory
function makeProduct(overrides: Partial<ProductRow>): ProductRow {
  return {
    product_id: "HOG-TEST-001",
    name: "Test Product",
    brand: "Test Brand",
    category: "supplement",
    active_ingredients: ["test ingredient"],
    indications: [],
    cautions: [],
    pack_sizes: [],
    schedule: null,
    reviewed: true,
    source_url: null,
    notes: null,
    clinical_use_tags: [],
    avoid_if_tags: [],
    medicine_interaction_flags: [],
    counselling_flags: [],
    ...overrides,
  };
}

// Standard drug-class, patient-factor and symptom tag maps for tests
const DRUG_CLASS_MAP: DrugClassTagMap = {
  diabetes: ["b12_support", "magnesium_support"],
  ppi: ["b12_support", "magnesium_support", "calcium_support"],
  ssri: ["b12_support", "folate_support"],
  snri: ["b12_support"],
  statin: ["coq10_support", "magnesium_support"],
  bisphosphonate: ["calcium_support", "vitamin_d_support"],
  thyroid: ["iron_support"],
  corticosteroid: ["calcium_support", "vitamin_d_support"],
  anticoagulant: [],
  antiplatelet: [],
  quinolone: [],
  tetracycline: [],
};

const FACTOR_MAP: FactorTagMap = {
  elderly: ["calcium_support", "vitamin_d_support", "b12_support"],
  pregnancy: ["folate_support", "iron_support"],
  breastfeeding: ["b12_support", "calcium_support"],
  postmenopausal: ["calcium_support", "vitamin_d_support"],
  child: [],
  polypharmacy: [],
  renal_disease: [],
  hepatic_disease: [],
  diabetes: ["magnesium_support", "b12_support"],
  hypertension: ["magnesium_support", "potassium_support"],
  swallowing_difficulty: [],
  allergy_risk: [],
  bleeding_risk: [],
  mineral_timing_risk: [],
  existing_supplement_duplication: [],
};

const SYMPTOM_MAP: SymptomTagMap = {
  cramp: ["magnesium_support"],
  fatigue: ["b12_support", "iron_support", "energy_support"],
  tired: ["b12_support", "iron_support", "energy_support"],
  low_energy: ["b12_support", "iron_support", "energy_support"],
  sleep: ["magnesium_support"],
  insomnia: ["magnesium_support"],
  immunity: ["immune_support"],
  immune: ["immune_support"],
  skin: ["skin_health"],
  hair: ["hair_nail_support"],
  nail: ["hair_nail_support"],
  joint: ["joint_health"],
  bone: ["bone_health"],
  reflux: [],
  heartburn: [],
  indigestion: [],
};

// =============================================================================
// 1. Core happy-path matching
// =============================================================================

describe("recommendProducts — indication matching", () => {
  it("matches a B12-supporting product for a patient on metformin", () => {
    const ctx: PatientCtx = {
      age: 58,
      sex: "male",
      pregnancy_status: "not_applicable",
      breastfeeding_status: "not_applicable",
      allergies: "NKDA",
      medical_history: "T2DM",
      symptoms: "",
      counselling_goal: "",
      existing_supplements: "",
      pathology_notes: "",
      confirmed_medications: [{ generic_name: "metformin", drug_class: "diabetes" }],
    };
    const rules: SafetyRuleRow[] = [];
    const products: ProductRow[] = [
      makeProduct({
        product_id: "HOG-B12-01",
        name: "Activ8 B12",
        active_ingredients: ["cyanocobalamin"],
        clinical_use_tags: ["b12_support", "energy_support"],
        indications: ["B12 supplementation"],
        cautions: [],
      }),
    ];
    const recs = recommendProducts(ctx, products, rules, {
      drugClassMap: DRUG_CLASS_MAP,
      factorMap: FACTOR_MAP,
      symptomMap: SYMPTOM_MAP,
    });
    expect(recs).toHaveLength(1);
    expect(recs[0].product_id).toBe("HOG-B12-01");
    expect(recs[0].matched_product_tags).toContain("b12_support");
  });

  it("matches a vitamin-D + calcium product for a post-menopausal woman", () => {
    const ctx: PatientCtx = {
      age: 65,
      sex: "female",
      pregnancy_status: "not_applicable",
      breastfeeding_status: "not_applicable",
      allergies: "NKDA",
      medical_history: "postmenopausal, hypertension",
      symptoms: "",
      counselling_goal: "",
      existing_supplements: "",
      pathology_notes: "",
      confirmed_medications: [],
    };
    const rules: SafetyRuleRow[] = [];
    const products: ProductRow[] = [
      makeProduct({
        product_id: "HOG-CA-01",
        name: "Cal-D-Solve",
        active_ingredients: ["calcium citrate", "cholecalciferol"],
        clinical_use_tags: ["calcium_support", "vitamin_d_support", "bone_health"],
      }),
    ];
    const recs = recommendProducts(ctx, products, rules, {
      drugClassMap: DRUG_CLASS_MAP,
      factorMap: FACTOR_MAP,
      symptomMap: SYMPTOM_MAP,
    });
    expect(recs.length).toBeGreaterThan(0);
    expect(recs.find((r) => r.product_id === "HOG-CA-01")).toBeDefined();
  });
});

// =============================================================================
// 2. Symptom-driven matching
// =============================================================================

describe("recommendProducts — symptom matching", () => {
  it("matches a magnesium product when symptom 'cramp' is mentioned", () => {
    const ctx: PatientCtx = {
      age: 35,
      sex: "female",
      pregnancy_status: "no",
      breastfeeding_status: "no",
      allergies: "NKDA",
      medical_history: "",
      symptoms: "leg cramps at night",
      counselling_goal: "",
      existing_supplements: "",
      pathology_notes: "",
      confirmed_medications: [],
    };
    const products: ProductRow[] = [
      makeProduct({
        product_id: "HOG-MG-01",
        name: "Magnesium Complete",
        active_ingredients: ["magnesium glycinate"],
        clinical_use_tags: ["magnesium_support", "muscle_cramps", "sleep_support"],
      }),
    ];
    const recs = recommendProducts(ctx, products, [], {
      drugClassMap: DRUG_CLASS_MAP,
      factorMap: FACTOR_MAP,
      symptomMap: SYMPTOM_MAP,
    });
    expect(recs.find((r) => r.product_id === "HOG-MG-01")).toBeDefined();
  });

  it("matches B12 + iron products for 'fatigue' symptom", () => {
    const ctx: PatientCtx = {
      age: 42,
      sex: "female",
      pregnancy_status: "no",
      breastfeeding_status: "no",
      allergies: "NKDA",
      medical_history: "",
      symptoms: "always tired, low energy",
      counselling_goal: "energy",
      existing_supplements: "",
      pathology_notes: "",
      confirmed_medications: [],
    };
    const products: ProductRow[] = [
      makeProduct({
        product_id: "HOG-B12",
        name: "B12 Spray",
        active_ingredients: ["cyanocobalamin"],
        clinical_use_tags: ["b12_support", "energy_support"],
      }),
      makeProduct({
        product_id: "HOG-FE",
        name: "Iron Fix",
        active_ingredients: ["iron bisglycinate"],
        clinical_use_tags: ["iron_support", "energy_support"],
      }),
      makeProduct({
        product_id: "HOG-MG",
        name: "Magnesium",
        active_ingredients: ["magnesium"],
        clinical_use_tags: ["magnesium_support"],
      }),
    ];
    const recs = recommendProducts(ctx, products, [], {
      drugClassMap: DRUG_CLASS_MAP,
      factorMap: FACTOR_MAP,
      symptomMap: SYMPTOM_MAP,
    });
    const ids = recs.map((r) => r.product_id);
    expect(ids).toContain("HOG-B12");
    expect(ids).toContain("HOG-FE");
    // Magnesium has no fatigue-related tag — should NOT match
    expect(ids).not.toContain("HOG-MG");
  });
});

// =============================================================================
// 3. Safety cross-check (the critical "conservative cut")
// =============================================================================

describe("recommendProducts — safety cross-check", () => {
  it("SUPPRESSES a pregnancy-flagged product for a pregnant patient", () => {
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
    const products: ProductRow[] = [
      makeProduct({
        product_id: "HOG-CONTRA",
        name: "High Strength Vitamin A",
        clinical_use_tags: ["immune_support"],
        avoid_if_tags: ["pregnancy_review_required"],
      }),
    ];
    const recs = recommendProducts(ctx, products, [], {
      drugClassMap: DRUG_CLASS_MAP,
      factorMap: FACTOR_MAP,
      symptomMap: SYMPTOM_MAP,
    });
    expect(recs.find((r) => r.product_id === "HOG-CONTRA")).toBeUndefined();
  });

  it("SUPPRESSES a renal-flagged product for a CKD patient", () => {
    const ctx: PatientCtx = {
      age: 70,
      sex: "male",
      pregnancy_status: "not_applicable",
      breastfeeding_status: "not_applicable",
      allergies: "NKDA",
      medical_history: "CKD stage 3, eGFR 35",
      symptoms: "",
      counselling_goal: "",
      existing_supplements: "",
      pathology_notes: "",
      confirmed_medications: [],
    };
    const products: ProductRow[] = [
      makeProduct({
        product_id: "HOG-MG-RENAL",
        name: "Magnesium Citrate",
        clinical_use_tags: ["magnesium_support"],
        avoid_if_tags: ["renal_impairment_caution"],
      }),
    ];
    const recs = recommendProducts(ctx, products, [], {
      drugClassMap: DRUG_CLASS_MAP,
      factorMap: FACTOR_MAP,
      symptomMap: SYMPTOM_MAP,
    });
    expect(recs.find((r) => r.product_id === "HOG-MG-RENAL")).toBeUndefined();
  });

  it("SUPPRESSES a warfarin-flagged product for a patient on warfarin", () => {
    const ctx: PatientCtx = {
      age: 72,
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
    const products: ProductRow[] = [
      makeProduct({
        product_id: "HOG-FO",
        name: "Fish Oil 1000",
        active_ingredients: ["fish oil", "omega-3"],
        clinical_use_tags: ["heart_health"],
        avoid_if_tags: ["warfarin", "anticoagulant_review_required"],
      }),
      makeProduct({
        product_id: "HOG-COQ10",
        name: "CoQ10 150mg",
        active_ingredients: ["ubiquinol"],
        clinical_use_tags: ["energy_support"],
        avoid_if_tags: [],
      }),
    ];
    const recs = recommendProducts(ctx, products, [], {
      drugClassMap: DRUG_CLASS_MAP,
      factorMap: FACTOR_MAP,
      symptomMap: SYMPTOM_MAP,
    });
    expect(recs.find((r) => r.product_id === "HOG-FO")).toBeUndefined();
    // CoQ10 has no avoid tag, should still be candidate (won't match — no indication trigger — but not suppressed)
    expect(recs.find((r) => r.product_id === "HOG-COQ10")).toBeUndefined();
  });

  it("SUPPRESSES a product whose avoid tag fires from a TRIGGERED safety rule's keywords", () => {
    // Safety rules that have already fired in the main engine carry avoid_product_keywords
    // like "fish oil", "omega", "warfarin". A product that has one of those in its
    // active_ingredients should be suppressed.
    const ctx: PatientCtx = {
      age: 68,
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
    const rules: SafetyRuleRow[] = [
      makeRule("bleeding_risk_anticoagulant", ["fish oil", "omega", "ginkgo", "turmeric"]),
    ];
    const products: ProductRow[] = [
      makeProduct({
        product_id: "HOG-FO",
        name: "Fish Oil 2000",
        active_ingredients: ["fish oil", "omega-3"],
        clinical_use_tags: ["heart_health"],
      }),
    ];
    const recs = recommendProducts(ctx, products, rules, {
      drugClassMap: DRUG_CLASS_MAP,
      factorMap: FACTOR_MAP,
      symptomMap: SYMPTOM_MAP,
    });
    expect(recs.find((r) => r.product_id === "HOG-FO")).toBeUndefined();
  });

  it("SUPPRESSES products with ingredients already in the patient's existing supplements", () => {
    const ctx: PatientCtx = {
      age: 45,
      sex: "female",
      pregnancy_status: "no",
      breastfeeding_status: "no",
      allergies: "NKDA",
      medical_history: "",
      symptoms: "fatigue",
      counselling_goal: "",
      existing_supplements: "vitamin B12 1000mcg daily",
      pathology_notes: "",
      confirmed_medications: [],
    };
    const products: ProductRow[] = [
      makeProduct({
        product_id: "HOG-B12-DUP",
        name: "B12 Spray",
        active_ingredients: ["cyanocobalamin", "vitamin b12"],
        clinical_use_tags: ["b12_support", "energy_support"],
      }),
    ];
    const recs = recommendProducts(ctx, products, [], {
      drugClassMap: DRUG_CLASS_MAP,
      factorMap: FACTOR_MAP,
      symptomMap: SYMPTOM_MAP,
    });
    expect(recs.find((r) => r.product_id === "HOG-B12-DUP")).toBeUndefined();
  });
});

// =============================================================================
// 4. Output shape
// =============================================================================

describe("recommendProducts — output shape", () => {
  it("returns records with product_id, brand, name, and matched_product_tags", () => {
    const ctx: PatientCtx = {
      age: 58,
      sex: "male",
      pregnancy_status: "not_applicable",
      breastfeeding_status: "not_applicable",
      allergies: "NKDA",
      medical_history: "T2DM",
      symptoms: "",
      counselling_goal: "",
      existing_supplements: "",
      pathology_notes: "",
      confirmed_medications: [{ generic_name: "metformin", drug_class: "diabetes" }],
    };
    const products: ProductRow[] = [
      makeProduct({
        product_id: "HOG-B12",
        name: "B12 Spray",
        brand: "Herbs of Gold",
        active_ingredients: ["cyanocobalamin"],
        clinical_use_tags: ["b12_support", "energy_support"],
        indications: ["B12 supplementation"],
        cautions: ["Consult health professional if pregnant"],
      }),
    ];
    const recs = recommendProducts(ctx, products, [], {
      drugClassMap: DRUG_CLASS_MAP,
      factorMap: FACTOR_MAP,
      symptomMap: SYMPTOM_MAP,
    });
    expect(recs).toHaveLength(1);
    const r = recs[0];
    expect(r.product_id).toBe("HOG-B12");
    expect(r.brand).toBe("Herbs of Gold");
    expect(r.product_name).toBe("B12 Spray");
    expect(r.matched_product_tags.length).toBeGreaterThan(0);
    expect(r.why_triggered).toBeTruthy();
    expect(r.recommendation_type).toBe("product_recommendation");
  });

  it("returns empty array when no products match", () => {
    const ctx: PatientCtx = {
      age: 25,
      sex: "male",
      pregnancy_status: "no",
      breastfeeding_status: "no",
      allergies: "NKDA",
      medical_history: "",
      symptoms: "",
      counselling_goal: "",
      existing_supplements: "",
      pathology_notes: "",
      confirmed_medications: [],
    };
    const products: ProductRow[] = [
      makeProduct({
        product_id: "HOG-UNRELATED",
        name: "Skin Cream",
        clinical_use_tags: ["skin_health"],
      }),
    ];
    const recs = recommendProducts(ctx, products, [], {
      drugClassMap: DRUG_CLASS_MAP,
      factorMap: FACTOR_MAP,
      symptomMap: SYMPTOM_MAP,
    });
    expect(recs).toEqual([]);
  });
});
