// Deterministic guardrail engine (Phase 1).
// Runs on the server inside a serverFn. No AI, no vector search.
// Inputs: confirmed medications + patient context + safety_rules.
// Output: ranked recommendation cards.

export type PatientCtx = {
  age: number | null;
  sex: string | null;
  pregnancy_status: string | null;
  breastfeeding_status: string | null;
  allergies: string;
  medical_history: string;
  symptoms: string;
  counselling_goal: string;
  existing_supplements: string;
  confirmed_medications: Array<{ generic_name: string; brand_name?: string; drug_class?: string | null }>;
};

export type SafetyRuleRow = {
  rule_id: string;
  name: string;
  description: string;
  trigger_drug_classes: string[];
  trigger_patient_factors: string[];
  avoid_product_keywords: string[];
  severity: string;
  recommendation_type: string;
  pharmacist_message: string;
  pharmacist_checks: string[];
  review_required: boolean;
};

export type GeneratedRec = {
  recommendation_type: "safety_caution" | "administration" | "review_required" | "counselling_prompt" | "product_discussion";
  title: string;
  product_name?: string;
  brand?: string;
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
  source_references: Array<{ source: string; tier_label: string; note: string }>;
};

const TYPE_BASE_SCORE = {
  safety_caution: 900,
  administration: 800,
  review_required: 700,
  counselling_prompt: 500,
  product_discussion: 300,
} as const;

const TYPE_ORDER = ["safety_caution", "administration", "review_required", "counselling_prompt", "product_discussion"] as const;

export function detectPatientFactors(ctx: PatientCtx): string[] {
  const factors: string[] = [];
  const hist = (ctx.medical_history + " " + ctx.symptoms + " " + ctx.pathology_notes_safe()).toLowerCase();
  if (ctx.age !== null && ctx.age >= 65) factors.push("elderly");
  if (ctx.age !== null && ctx.age < 12) factors.push("child");
  if (ctx.confirmed_medications.length >= 5) factors.push("polypharmacy");
  if (ctx.pregnancy_status === "yes" || ctx.pregnancy_status === "unsure") factors.push("pregnancy");
  if (ctx.breastfeeding_status === "yes" || ctx.breastfeeding_status === "unsure") factors.push("breastfeeding");
  if (/(renal|ckd|kidney|dialysis|egfr|nephro)/.test(hist)) factors.push("renal_disease");
  if (/(hepatic|liver|cirrho)/.test(hist)) factors.push("hepatic_disease");
  if (/(diabet|t2dm|t1dm)/.test(hist)) factors.push("diabetes");
  if (/(hypertens|high blood pressure|bp)/.test(hist)) factors.push("hypertension");
  if (/(swallow|dysphag|crush|peg|enteral|nasogastric)/.test(hist)) factors.push("swallowing_difficulty");
  if (ctx.allergies && !/^(nkda|nil|none|no)/i.test(ctx.allergies.trim())) factors.push("allergy_risk");

  const classes = ctx.confirmed_medications.map((m) => (m.drug_class ?? "").toLowerCase());
  const hasBleeding = classes.some((c) => /anticoagulant|antiplatelet/.test(c));
  if (hasBleeding) factors.push("bleeding_risk");

  const hasMineralTimingDrug = classes.some((c) => /thyroid|quinolone|tetracycline|bisphosphonate/.test(c));
  if (hasMineralTimingDrug) factors.push("mineral_timing_risk");

  // Existing supplement duplication
  const existing = ctx.existing_supplements.toLowerCase();
  const mineralWords = ["magnesium", "calcium", "iron", "zinc", "vitamin d", "fish oil", "omega"];
  if (mineralWords.some((w) => existing.includes(w))) factors.push("existing_supplement_duplication");

  return Array.from(new Set(factors));
}

// Patch the missing helper above
declare module "./engine" {}

// Cards: factor → product/topic keyword associations for symptom-driven prompts.
const SYMPTOM_MAP: Array<{ keywords: string[]; topic: string; suggestionTitle: string; talking: string[]; checks: string[]; tags: string[] }> = [
  {
    keywords: ["cramp", "muscle ach", "leg cramp"],
    topic: "magnesium",
    suggestionTitle: "Magnesium could be worth a conversation",
    talking: [
      "Worth asking when the cramps occur and any triggers (time of day, exercise, dehydration).",
      "Magnesium is sometimes trialled for cramps; evidence is mixed — frame as a trial, not a treatment.",
      "Separate from levothyroxine, quinolones, tetracyclines or bisphosphonates if applicable.",
    ],
    checks: [
      "Confirm no renal impairment",
      "Check current diuretic/PPI use that may affect electrolytes",
      "Rule out statin-related muscle symptoms before attributing to deficiency",
    ],
    tags: ["magnesium"],
  },
  {
    keywords: ["fatigue", "tired", "low energy"],
    topic: "iron_b12",
    suggestionTitle: "Pathology review before any supplement",
    talking: [
      "I'd want to rule out iron deficiency, B12/folate, thyroid, sleep and depression before suggesting a product.",
      "If pathology hasn't been done recently, consider GP referral as a counselling outcome.",
    ],
    checks: [
      "Ask about recent bloods (iron studies, B12/folate, TFTs)",
      "Ask about sleep quality and mood",
      "Check for medication-related fatigue (beta blockers, antihistamines, opioids)",
    ],
    tags: ["iron", "b12"],
  },
  {
    keywords: ["reflux", "heartburn", "indigestion"],
    topic: "reflux_counselling",
    suggestionTitle: "Reflux counselling opportunity",
    talking: [
      "Confirm frequency and duration — chronic symptoms warrant GP review.",
      "Lifestyle: meal size and timing, weight, smoking, alcohol, late-night eating.",
      "If already on a PPI, check dosing and whether a deprescribing trial is appropriate.",
    ],
    checks: ["Confirm symptom duration and red flags (weight loss, dysphagia)", "Review current acid-suppression therapy"],
    tags: ["reflux"],
  },
];

export function runEngine(ctx: PatientCtx, rules: SafetyRuleRow[]): GeneratedRec[] {
  const factors = detectPatientFactors(ctx);
  const classes = new Set(ctx.confirmed_medications.map((m) => (m.drug_class ?? "").toLowerCase()).filter(Boolean));
  // Expand class buckets (e.g. ace_inhibitor+diuretic → ace_inhibitor, diuretic)
  const expandedClasses = new Set<string>();
  for (const c of classes) c.split(/[+/]/).forEach((p) => expandedClasses.add(p.trim()));

  const recs: GeneratedRec[] = [];

  // 1. Fire matching safety_rules
  for (const rule of rules) {
    const classMatch = rule.trigger_drug_classes.some((tc) => Array.from(expandedClasses).some((c) => c.includes(tc) || tc.includes(c)));
    const factorMatch = rule.trigger_patient_factors.some((f) => factors.includes(f));
    if (!classMatch && !factorMatch) continue;
    if (rule.rule_id === "allergy_check" && !factors.includes("allergy_risk")) continue;
    if (rule.rule_id === "elderly_falls_awareness" && !factors.includes("elderly")) continue;
    if (rule.rule_id === "polypharmacy_awareness" && !factors.includes("polypharmacy")) continue;
    if (rule.rule_id === "duplication_caution" && !factors.includes("existing_supplement_duplication")) continue;

    const type = (rule.recommendation_type as GeneratedRec["recommendation_type"]) ?? "review_required";
    const matchedMeds = ctx.confirmed_medications
      .filter((m) => rule.trigger_drug_classes.some((tc) => (m.drug_class ?? "").toLowerCase().includes(tc)))
      .map((m) => m.generic_name);

    recs.push({
      recommendation_type: type,
      title: rule.name,
      confidence: rule.severity === "High" ? "High" : rule.severity === "Medium" ? "Medium" : "Low",
      score: TYPE_BASE_SCORE[type] + (classMatch ? 80 : 0) + (factorMatch ? 60 : 0),
      rank: 0,
      why_triggered: rule.description,
      pharmacist_checks: rule.pharmacist_checks ?? [],
      talking_points: [rule.pharmacist_message],
      safety_cautions: rule.severity === "High" ? [rule.pharmacist_message] : [],
      interaction_notes: rule.avoid_product_keywords.length
        ? [`Avoid: ${rule.avoid_product_keywords.slice(0, 6).join(", ")}`]
        : [],
      matched_medicines: matchedMeds,
      matched_patient_factors: rule.trigger_patient_factors.filter((f) => factors.includes(f)),
      source_references: [
        { source: "PharmaPrompt safety ruleset", tier_label: "Built-in safety rule", note: rule.rule_id },
      ],
    });
  }

  // 2. Symptom-driven counselling prompts (only if not blocked by pregnancy)
  const symptomBlob = (ctx.symptoms + " " + ctx.counselling_goal).toLowerCase();
  const pregBlock = factors.includes("pregnancy") || factors.includes("breastfeeding");

  for (const map of SYMPTOM_MAP) {
    if (!map.keywords.some((k) => symptomBlob.includes(k))) continue;

    if (map.topic === "magnesium" && pregBlock) continue;

    // Magnesium suggestion downgraded if bleeding or renal
    let confidence: GeneratedRec["confidence"] = "Medium";
    const extraChecks: string[] = [];
    if (map.topic === "magnesium") {
      if (factors.includes("renal_disease")) {
        confidence = "Low";
        extraChecks.push("Renal impairment — defer magnesium until reviewed");
      }
      if (factors.includes("mineral_timing_risk")) {
        extraChecks.push("Separate magnesium from levothyroxine/quinolone/tetracycline/bisphosphonate");
      }
      if (factors.includes("existing_supplement_duplication")) {
        confidence = "Low";
        extraChecks.push("Patient may already be on a mineral supplement — confirm before adding");
      }
    }

    recs.push({
      recommendation_type: map.topic === "reflux_counselling" || map.topic === "iron_b12" ? "counselling_prompt" : "product_discussion",
      title: map.suggestionTitle,
      product_name: map.topic === "magnesium" ? "Magnesium (generic)" : undefined,
      confidence,
      score: TYPE_BASE_SCORE[map.topic === "reflux_counselling" || map.topic === "iron_b12" ? "counselling_prompt" : "product_discussion"] + 60,
      rank: 0,
      why_triggered: `Symptom/goal mentioned: ${map.keywords.find((k) => symptomBlob.includes(k))}`,
      pharmacist_checks: [...map.checks, ...extraChecks],
      talking_points: map.talking,
      safety_cautions: [],
      interaction_notes: [],
      matched_medicines: [],
      matched_patient_factors: factors.filter((f) => f !== "allergy_risk"),
      source_references: [
        { source: "PharmaPrompt symptom map", tier_label: "Built-in counselling prompt", note: map.topic },
      ],
    });
  }

  // 3. Polypharmacy / elderly awareness prompts (already covered by rules above if matched)

  // 4. Allergy check appended to every product discussion if allergy_risk
  if (factors.includes("allergy_risk")) {
    for (const r of recs) {
      if (r.recommendation_type === "product_discussion") {
        r.pharmacist_checks.push(`Cross-check ingredients against patient allergies: ${ctx.allergies}`);
      }
    }
  }

  // 5. Sort by score, then by type order
  recs.sort((a, b) => {
    const ti = TYPE_ORDER.indexOf(a.recommendation_type) - TYPE_ORDER.indexOf(b.recommendation_type);
    if (ti !== 0) return ti;
    return b.score - a.score;
  });
  recs.forEach((r, i) => (r.rank = i));

  return recs;
}

// Helper attached to PatientCtx via prototype is awkward — provide a util instead.
declare global {
  interface Object {
    pathology_notes_safe?(): string;
  }
}

// Implement on PatientCtx-like via plain helper used above
(Object.prototype as any).pathology_notes_safe = function () {
  return (this as any).pathology_notes ?? "";
};
