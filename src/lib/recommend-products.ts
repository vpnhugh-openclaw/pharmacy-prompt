// Phase 5 — product recommendation pass.
// Permissive matching strategy:
//   1. Compute "trigger tags" for each product from its clinical_use_tags.
//   2. Match against three layers:
//        - drug-class → tag map   (e.g. metformin → b12_support)
//        - patient-factor → tag map (e.g. elderly → calcium_support)
//        - symptom/goal keyword → tag map (e.g. "cramp" → magnesium_support)
//   3. SUPPRESS a product if:
//        - one of its avoid_if_tags maps to a patient factor we detected, OR
//        - one of its avoid_if_tags maps to a drug class the patient is on, OR
//        - one of its active_ingredients matches an avoid_product_keyword from
//          a triggered safety rule, OR
//        - one of its active_ingredients duplicates something in existing_supplements.
//   4. Score = matched tag count * 20 + 400 base.
//   5. Output: product_recommendation records ready to be rendered in the case UI.
import type { SafetyRuleRow, PatientCtx } from "./engine";
import { buildRationale, type Rationale, type SeverityTier, type EvidenceLevel } from "./rationale";

export type ProductRow = {
  product_id: string;
  name: string;
  brand: string | null;
  category: string | null;
  active_ingredients: string[];
  indications: string[];
  cautions: string[];
  pack_sizes: string[];
  schedule: string | null;
  reviewed: boolean;
  source_url: string | null;
  notes: string | null;
  clinical_use_tags: string[];
  avoid_if_tags: string[];
  medicine_interaction_flags: string[];
  counselling_flags: string[];
};

export type ProductRecommendation = {
  recommendation_type: "product_recommendation";
  title: string;
  product_id: string;
  product_name: string;
  brand: string | null;
  confidence: "High" | "Medium" | "Low";
  score: number;
  rank: number;
  why_triggered: string;
  pharmacist_checks: string[];
  talking_points: string[];
  safety_cautions: string[];
  interaction_notes: string[];
  matched_medicines: string[];
  matched_patient_factors: string[];
  matched_product_tags: string[];
  source_references: Array<{ source: string; tier_label: string; note: string }>;
  rationale: Rationale;
  severity_tier: SeverityTier;
  confidence_score: number;
};

export type DrugClassTagMap = Record<string, string[]>;
export type FactorTagMap = Record<string, string[]>;
export type SymptomTagMap = Record<string, string[]>;

export type TagMaps = {
  drugClassMap: DrugClassTagMap;
  factorMap: FactorTagMap;
  symptomMap: SymptomTagMap;
};

const DEFAULT_DRUG_CLASS_MAP: DrugClassTagMap = {
  diabetes: ["b12_support", "magnesium_support"],
  ppi: ["b12_support", "magnesium_support", "calcium_support"],
  ssri: ["b12_support", "folate_support"],
  snri: ["b12_support"],
  statin: ["coq10_support", "magnesium_support"],
  bisphosphonate: ["calcium_support", "vitamin_d_support"],
  thyroid: ["iron_support"],
  corticosteroid: ["calcium_support", "vitamin_d_support"],
};

const DEFAULT_FACTOR_MAP: FactorTagMap = {
  elderly: ["calcium_support", "vitamin_d_support", "b12_support"],
  pregnancy: ["folate_support", "iron_support"],
  breastfeeding: ["b12_support", "calcium_support"],
  postmenopausal: ["calcium_support", "vitamin_d_support"],
  diabetes: ["magnesium_support", "b12_support"],
  hypertension: ["magnesium_support", "potassium_support"],
  renal_disease: [],
  hepatic_disease: [],
  child: [],
  polypharmacy: [],
  swallowing_difficulty: [],
  allergy_risk: [],
  bleeding_risk: [],
  mineral_timing_risk: [],
  existing_supplement_duplication: [],
};

const DEFAULT_SYMPTOM_MAP: SymptomTagMap = {
  cramp: ["magnesium_support"],
  muscle_ach: ["magnesium_support"],
  leg_cramp: ["magnesium_support"],
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
};

// Suppress the product if it has an avoid_if_tag AND the patient has one
// of the listed factors. This is the authoritative list — derived from
// the Herbs of Gold catalogue and the existing Phase 1 safety rules.
const AVOID_TAG_FACTOR_MAP: Record<string, string[]> = {
  // Reproduction
  pregnancy_review_required: ["pregnancy", "trying_to_conceive"],
  breastfeeding_review_required: ["breastfeeding"],
  // Renal
  renal_impairment_caution: ["renal_disease"],
  hypercalcaemia_caution: ["renal_disease", "hypercalcaemia"],
  sarcoidosis_caution: ["sarcoidosis"],
  hyperparathyroidism_caution: ["hyperparathyroidism"],
  // Hepatic
  liver_impairment_caution: ["hepatic_disease"],
  // Other organs / systems
  seizure_disorder_review_required: ["epilepsy", "seizure_disorder"],
  immunosuppressed_review_required: ["immunosuppressed"],
  child_review_required: ["child", "paediatric"],
  constipation_caution: ["constipation_history"],
  central_line_caution: ["central_line"],
  shellfish_allergy_caution: ["shellfish_allergy"],
  // Thyroid-specific (suppress iodine/selenium/tyrosine/withania if patient
  // has a known thyroid condition)
  thyroid_condition_review_required: ["thyroid_condition"],
  surgery_caution: ["pre_surgical", "recent_surgery"],
};

// Suppress the product if it has an avoid_if_tag AND the patient is on
// a drug class that conflicts. Keyed by avoid_if_tag.
const AVOID_TAG_DRUG_CLASS_MAP: Record<string, string[]> = {
  warfarin: ["anticoagulant"],
  anticoagulant_review_required: ["anticoagulant", "doac"],
  antiplatelet: ["antiplatelet"],
  doac: ["anticoagulant", "doac"],
  quinolone_antibiotic: ["quinolone"],
  tetracycline_antibiotic: ["tetracycline"],
  bisphosphonate: ["bisphosphonate"],
  penicillamine: ["penicillamine"],
  levothyroxine: ["thyroid"],
  digoxin: ["digoxin"],
  oral_contraceptive: ["contraceptive"],
  antidiabetic: ["diabetes", "sulfonylurea", "metformin", "insulin"],
  antidepressant_review_required: ["ssri", "snri", "tca", "maoi"],
  immunosuppressant: ["immunosuppressant"],
  antacid_separation: ["antacid", "ppi", "h2_antagonist"],
};

// Pre-compute reverse indexes for fast lookup in the hot path.
//   FACTOR_TO_AVOID[factor]   = avoid_if_tags that suppress when factor is present
//   CLASS_TO_AVOID[drugClass] = avoid_if_tags that suppress when drug class is present
const FACTOR_TO_AVOID: Record<string, string[]> = {};
for (const [tag, factors] of Object.entries(AVOID_TAG_FACTOR_MAP)) {
  for (const f of factors) {
    (FACTOR_TO_AVOID[f] ??= []).push(tag);
  }
}
const CLASS_TO_AVOID: Record<string, string[]> = {};
for (const [tag, classes] of Object.entries(AVOID_TAG_DRUG_CLASS_MAP)) {
  for (const c of classes) {
    (CLASS_TO_AVOID[c] ??= []).push(tag);
  }
}

function normalise(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function uniq<T>(arr: T[]): T[] {
  return Array.from(new Set(arr));
}

function matchProduct(
  product: ProductRow,
  ctx: PatientCtx,
  drugClasses: Set<string>,
  factors: string[],
  symptomBlob: string,
  maps: TagMaps,
): { matchedTags: string[]; matchedMeds: string[]; matchedFactors: string[] } {
  const matchedTags = new Set<string>();
  const matchedMeds = new Set<string>();
  const matchedFactors = new Set<string>();

  for (const dc of drugClasses) {
    const tags = maps.drugClassMap[dc] ?? [];
    for (const t of tags) {
      if (product.clinical_use_tags.includes(t)) {
        matchedTags.add(t);
      }
    }
    if (tags.some((t) => product.clinical_use_tags.includes(t))) {
      for (const m of ctx.confirmed_medications) {
        if (
          (m.drug_class ?? "").toLowerCase().includes(dc) ||
          dc.includes((m.drug_class ?? "").toLowerCase())
        ) {
          matchedMeds.add(m.generic_name);
        }
      }
    }
  }

  for (const f of factors) {
    const tags = maps.factorMap[f] ?? [];
    for (const t of tags) {
      if (product.clinical_use_tags.includes(t)) {
        matchedTags.add(t);
        matchedFactors.add(f);
      }
    }
  }

  for (const [kw, tags] of Object.entries(maps.symptomMap)) {
    if (!symptomBlob.includes(kw)) continue;
    for (const t of tags) {
      if (product.clinical_use_tags.includes(t)) {
        matchedTags.add(t);
      }
    }
  }

  return {
    matchedTags: Array.from(matchedTags),
    matchedMeds: Array.from(matchedMeds),
    matchedFactors: Array.from(matchedFactors),
  };
}

function detectFactorsLocal(ctx: PatientCtx): string[] {
  const factors: string[] = [];
  const hist = (ctx.medical_history + " " + ctx.symptoms + " " + ctx.pathology_notes).toLowerCase();
  if (ctx.age !== null && ctx.age >= 65) factors.push("elderly");
  if (ctx.age !== null && ctx.age < 12) factors.push("child");
  if (ctx.confirmed_medications.length >= 5) factors.push("polypharmacy");
  if (ctx.pregnancy_status === "yes" || ctx.pregnancy_status === "unsure")
    factors.push("pregnancy");
  if (ctx.breastfeeding_status === "yes" || ctx.breastfeeding_status === "unsure")
    factors.push("breastfeeding");
  if (/(renal|ckd|kidney|dialysis|egfr|nephro)/.test(hist)) factors.push("renal_disease");
  if (/(hepatic|liver|cirrho)/.test(hist)) factors.push("hepatic_disease");
  if (/(diabet|t2dm|t1dm)/.test(hist)) factors.push("diabetes");
  if (/(hypertens|high blood pressure|bp)/.test(hist)) factors.push("hypertension");
  if (/(postmenopaus|menopaus)/.test(hist)) factors.push("postmenopausal");
  if (/(epilep|seizure)/.test(hist)) factors.push("seizure_disorder");
  if (/(thyroid)/.test(hist)) factors.push("thyroid_condition");
  if (/(immunosuppress)/.test(hist)) factors.push("immunosuppressed");
  if (/(shellfish)/.test(hist)) factors.push("shellfish_allergy");
  if (ctx.allergies && !/^(nkda|nil|none|no)/i.test(ctx.allergies.trim()))
    factors.push("allergy_risk");
  const classes = ctx.confirmed_medications
    .map((m) => (m.drug_class ?? "").toLowerCase())
    .filter(Boolean);
  if (classes.some((c) => /anticoagulant|antiplatelet/.test(c))) factors.push("bleeding_risk");
  if (classes.some((c) => /thyroid|quinolone|tetracycline|bisphosphonate/.test(c)))
    factors.push("mineral_timing_risk");
  return uniq(factors);
}

function drugClasses(ctx: PatientCtx): Set<string> {
  const out = new Set<string>();
  for (const m of ctx.confirmed_medications) {
    const dc = (m.drug_class ?? "").toLowerCase();
    if (!dc) continue;
    out.add(dc);
    for (const p of dc.split(/[+/]/)) {
      const t = p.trim();
      if (t) out.add(t);
    }
  }
  return out;
}

/**
 * Return suppression reasons (empty array = not suppressed).
 * Three suppression paths:
 *   1. Product's avoid_if_tag matches a patient factor we detected.
 *   2. Product's avoid_if_tag matches a drug class the patient is on.
 *   3. Product's active_ingredient matches an avoid_product_keyword from
 *      a triggered safety rule, or duplicates something the patient
 *      already takes.
 */
function isSuppressed(
  product: ProductRow,
  ctx: PatientCtx,
  drugClassSet: Set<string>,
  factors: string[],
  triggeredRules: SafetyRuleRow[],
): string[] {
  const reasons: string[] = [];

  // 1. avoid_if_tag → patient factor
  for (const tag of product.avoid_if_tags) {
    for (const factor of factors) {
      if ((FACTOR_TO_AVOID[factor] ?? []).includes(tag)) {
        reasons.push(`Contains ${tag} — patient has factor: ${factor}`);
      }
    }
  }

  // 2. avoid_if_tag → drug class
  for (const tag of product.avoid_if_tags) {
    for (const dc of drugClassSet) {
      if ((CLASS_TO_AVOID[dc] ?? []).includes(tag)) {
        reasons.push(`Contains ${tag} — patient is on drug class: ${dc}`);
      }
    }
  }

  // 3a. active_ingredients vs avoid_product_keywords from triggered rules
  const avoidKeywords = triggeredRules.flatMap((r) =>
    r.avoid_product_keywords.map((k) => k.toLowerCase()),
  );
  for (const ing of product.active_ingredients) {
    const ingNorm = normalise(ing);
    for (const kw of avoidKeywords) {
      const kwNorm = normalise(kw);
      if (!kwNorm) continue;
      if (ingNorm.includes(kwNorm) || kwNorm.includes(ingNorm)) {
        reasons.push(`Contains ${ing} — flagged by safety rule (avoid: ${kw})`);
      }
    }
  }

  // 3b. active_ingredients vs existing supplements
  const existing = normalise(ctx.existing_supplements);
  if (existing) {
    for (const ing of product.active_ingredients) {
      const ingNorm = normalise(ing);
      if (ingNorm && existing.includes(ingNorm)) {
        reasons.push(`Patient already takes ${ing} (existing supplement)`);
      }
    }
  }

  return reasons;
}

export function recommendProducts(
  ctx: PatientCtx,
  products: ProductRow[],
  triggeredRules: SafetyRuleRow[],
  maps: Partial<TagMaps> = {},
): ProductRecommendation[] {
  const fullMaps: TagMaps = {
    drugClassMap: maps.drugClassMap ?? DEFAULT_DRUG_CLASS_MAP,
    factorMap: maps.factorMap ?? DEFAULT_FACTOR_MAP,
    symptomMap: maps.symptomMap ?? DEFAULT_SYMPTOM_MAP,
  };

  const factors = detectFactorsLocal(ctx);
  const drugClassSet = drugClasses(ctx);
  const symptomBlob = normalise(`${ctx.symptoms} ${ctx.counselling_goal}`);

  const out: ProductRecommendation[] = [];

  for (const product of products) {
    if (!product.reviewed) continue;

    const suppressionReasons = isSuppressed(product, ctx, drugClassSet, factors, triggeredRules);
    if (suppressionReasons.length) continue;

    const { matchedTags, matchedMeds, matchedFactors } = matchProduct(
      product,
      ctx,
      drugClassSet,
      factors,
      symptomBlob,
      fullMaps,
    );

    if (matchedTags.length === 0) continue;

    const confidence: ProductRecommendation["confidence"] =
      matchedTags.length >= 2 ? "High" : matchedTags.length === 1 ? "Medium" : "Low";

    const baseScore = 400;
    const score = baseScore + matchedTags.length * 20;

    const triggerParts: string[] = [];
    if (matchedMeds.length) {
      triggerParts.push(`matches medications: ${matchedMeds.join(", ")}`);
    }
    if (matchedFactors.length) {
      triggerParts.push(`matches patient factors: ${matchedFactors.join(", ")}`);
    }
    if (matchedTags.some((t) => Object.values(fullMaps.symptomMap).flat().includes(t))) {
      triggerParts.push(`matches symptoms/goal`);
    }
    if (triggerParts.length === 0) {
      triggerParts.push(`Matches clinical-use tags: ${matchedTags.join(", ")}`);
    }

    const title = product.brand ? `${product.name} (${product.brand})` : product.name;

    out.push({
      recommendation_type: "product_recommendation",
      title,
      product_id: product.product_id,
      product_name: product.name,
      brand: product.brand,
      confidence,
      score,
      rank: 0,
      why_triggered: `Suggested from curated catalogue — ${triggerParts.join("; ")}.`,
      pharmacist_checks: [
        "Confirm no allergies to listed active ingredients",
        "Cross-check with current medication list and dose",
        "Verify patient is not already on a duplicate product",
        "Discuss dose, timing with food/other medicines, and duration",
      ],
      talking_points: product.indications.length
        ? product.indications.slice(0, 4)
        : [`${product.name} is curated for the indications above.`],
      safety_cautions: product.cautions,
      interaction_notes: product.medicine_interaction_flags,
      matched_medicines: matchedMeds,
      matched_patient_factors: matchedFactors,
      matched_product_tags: matchedTags,
      source_references: [
        {
          source: "Herbs of Gold Technical Manual",
          tier_label: "Pharmacist-reviewed catalogue",
          note: product.product_id,
        },
      ],
      rationale: buildRationale({
        ruleId: `product:${product.product_id}`,
        severity: "minor",
        evidence: "moderate",
        source: "curated",
        matchedFactors: matchedTags.map((t) => ({
          factor: "indication" as const,
          value: t,
          matched: true,
        })),
        advice: `Consider ${product.name} as a pharmacist-reviewed option.`,
        safetyNet: "Return if symptoms persist or new symptoms develop.",
        mechanism: "clinical",
      }),
      severity_tier: "minor",
      confidence_score: 50,
    });
  }

  out.sort((a, b) => b.score - a.score);
  out.forEach((r, i) => (r.rank = i));
  return out;
}
