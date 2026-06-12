// Deterministic guardrail engine (Phase 1) + product recommendations (Phase 5)
// + structured rationale on every rec (Phase 6).
// Runs on the server inside a serverFn. No AI, no vector search.
import { recommendProducts, type ProductRow } from "./recommend-products";
import {
  buildRationale,
  type Rationale,
  type SeverityTier,
  type EvidenceLevel,
  type RuleSource,
  type MatchedFactor,
  severityCompare,
} from "./rationale";
import { screenRedFlags, type RedFlagHit } from "./red-flags";
import { checkOtcInteractions, type OtcInteractionHit } from "./otc-interactions";
import type { PatientCtx } from "./engine-types";
export type { PatientCtx };

/**
 * Safety rule shape as stored in the `safety_rules` table. Extended in
 * Phase 6 to include 4-tier severity, GRADE evidence, source label,
 * advice, and safety-netting string. The legacy `severity: "High"|"Medium"|"Low"`
 * field is retained for backwards compatibility with the existing
 * migration and is mapped to the new 4-tier `severity_tier` field.
 */
export type SafetyRuleRow = {
  rule_id: string;
  name: string;
  description: string;
  trigger_drug_classes: string[];
  trigger_patient_factors: string[];
  avoid_product_keywords: string[];
  severity: string;
  severity_tier?: SeverityTier;
  evidence_level?: EvidenceLevel;
  rule_source?: RuleSource;
  mechanism?: string;
  mechanism_detail?: string;
  advice?: string;
  safety_net?: string;
  onset?: string;
  recommendation_type: string;
  pharmacist_message: string;
  pharmacist_checks: string[];
  review_required: boolean;
};

export type RecType =
  | "safety_caution"
  | "administration"
  | "review_required"
  | "counselling_prompt"
  | "product_discussion"
  | "product_recommendation"
  | "red_flag"
  | "otc_interaction";

export type GeneratedRec = {
  recommendation_type: RecType;
  title: string;
  product_id?: string;
  product_name?: string;
  brand?: string | null;
  confidence: "High" | "Medium" | "Low";
  confidence_score: number;
  severity_tier: SeverityTier;
  score: number;
  rank: number;
  why_triggered: string;
  rationale: Rationale;
  pharmacist_checks: string[];
  talking_points: string[];
  safety_cautions: string[];
  interaction_notes: string[];
  matched_medicines: string[];
  matched_patient_factors: string[];
  matched_product_tags?: string[];
  source_references: Array<{ source: string; tier_label: string; note: string }>;
};

const TYPE_BASE_SCORE: Record<RecType, number> = {
  safety_caution: 1000,
  red_flag: 950,
  otc_interaction: 920,
  administration: 800,
  review_required: 700,
  counselling_prompt: 500,
  product_discussion: 300,
  product_recommendation: 200,
};

const TYPE_ORDER: RecType[] = [
  "safety_caution",
  "red_flag",
  "otc_interaction",
  "administration",
  "review_required",
  "counselling_prompt",
  "product_discussion",
  "product_recommendation",
];

function resolveSeverityTier(rule: SafetyRuleRow): SeverityTier {
  if (rule.severity_tier) return rule.severity_tier;
  switch ((rule.severity ?? "").toLowerCase()) {
    case "high":
      return "major";
    case "medium":
      return "moderate";
    case "low":
      return "minor";
    default:
      return "moderate";
  }
}

function confidenceToTier(c: number): "High" | "Medium" | "Low" {
  if (c >= 70) return "High";
  if (c >= 40) return "Medium";
  return "Low";
}

export function detectPatientFactors(ctx: PatientCtx): string[] {
  const factors: string[] = [];
  const hist = (
    ctx.medical_history +
    " " +
    ctx.symptoms +
    " " +
    ctx.pathology_notes
  ).toLowerCase();
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
  if (/(epilep|seizure)/.test(hist)) factors.push("seizure_disorder");
  if (/(postmenopaus|menopaus)/.test(hist)) factors.push("postmenopausal");
  if (/(immunosuppress)/.test(hist)) factors.push("immunosuppressed");
  if (/(shellfish)/.test(hist)) factors.push("shellfish_allergy");
  if (/(swallow|dysphag|crush|peg|enteral|nasogastric)/.test(hist))
    factors.push("swallowing_difficulty");
  if (ctx.allergies && !/^(nkda|nil|none|no)/i.test(ctx.allergies.trim()))
    factors.push("allergy_risk");

  const classes = ctx.confirmed_medications
    .map((m) => (m.drug_class ?? "").toLowerCase())
    .filter(Boolean);
  if (classes.some((c) => /anticoagulant|antiplatelet/.test(c)))
    factors.push("bleeding_risk");
  if (classes.some((c) => /thyroid|quinolone|tetracycline|bisphosphonate/.test(c)))
    factors.push("mineral_timing_risk");
  if (classes.some((c) => /nsaid/.test(c))) factors.push("on_nsaid");
  if (classes.some((c) => /ace_inhibitor|arb|diuretic/.test(c)))
    factors.push("on_renin_angiotensin_or_diuretic");

  const existing = ctx.existing_supplements.toLowerCase();
  const mineralWords = [
    "magnesium",
    "calcium",
    "iron",
    "zinc",
    "vitamin d",
    "fish oil",
    "omega",
  ];
  if (mineralWords.some((w) => existing.includes(w)))
    factors.push("existing_supplement_duplication");

  return Array.from(new Set(factors));
}

function buildMatchedFactors(
  rule: SafetyRuleRow,
  ctx: PatientCtx,
  factors: string[],
): MatchedFactor[] {
  const out: MatchedFactor[] = [];
  for (const tc of rule.trigger_drug_classes) {
    const matchedMed = ctx.confirmed_medications.find(
      (m) => (m.drug_class ?? "").toLowerCase().includes(tc),
    );
    if (matchedMed) {
      out.push({
        factor: "medication_class",
        value: `${matchedMed.generic_name} (${matchedMed.drug_class ?? tc})`,
        matched: true,
        evidence: `Drug class '${tc}' triggers rule`,
      });
    }
  }
  for (const f of rule.trigger_patient_factors) {
    if (factors.includes(f)) {
      out.push({
        factor: f === "pregnancy"
          ? "pregnancy"
          : f === "breastfeeding"
            ? "breastfeeding"
            : f === "elderly"
              ? "age"
              : f === "renal_disease"
                ? "renal_function"
                : "medication_class",
        value: f,
        matched: true,
      });
    }
  }
  return out;
}

const SYMPTOM_MAP: Array<{
  keywords: string[];
  topic: string;
  suggestionTitle: string;
  talking: string[];
  checks: string[];
  advice: string;
  safetyNet: string;
}> = [
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
    advice: "If proceeding, trial magnesium glycinate 200-400mg evening; reassess at 4 weeks.",
    safetyNet: "Return if cramps worsen, GI upset, or new palpitations.",
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
    advice: "Refer to GP for iron studies, B12, folate, TFTs before any supplement is started.",
    safetyNet:
      "Return promptly if fatigue is sudden, severe, or accompanied by breathlessness/pallor.",
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
    checks: [
      "Confirm symptom duration and red flags (weight loss, dysphagia)",
      "Review current acid-suppression therapy",
    ],
    advice: "Trial lifestyle measures for 4 weeks; consider alginate therapy PRN.",
    safetyNet:
      "Return promptly if dysphagia, weight loss, haematemesis, or pain radiating to jaw/arm.",
  },
];

export function runEngine(
  ctx: PatientCtx,
  rules: SafetyRuleRow[],
  products: ProductRow[] = [],
): GeneratedRec[] {
  const factors = detectPatientFactors(ctx);
  const classes = new Set(
    ctx.confirmed_medications
      .map((m) => (m.drug_class ?? "").toLowerCase())
      .filter(Boolean),
  );
  const expandedClasses = new Set<string>();
  for (const c of classes) c.split(/[+/]/).forEach((p) => expandedClasses.add(p.trim()));

  const recs: GeneratedRec[] = [];

  // ---- Safety rules pass --------------------------------------------------
  for (const rule of rules) {
    const classMatch = rule.trigger_drug_classes.some((tc) =>
      Array.from(expandedClasses).some((c) => c.includes(tc) || tc.includes(c)),
    );
    const factorMatch = rule.trigger_patient_factors.some((f) => factors.includes(f));
    if (!classMatch && !factorMatch) continue;
    if (rule.rule_id === "allergy_check" && !factors.includes("allergy_risk")) continue;
    if (rule.rule_id === "elderly_falls_awareness" && !factors.includes("elderly")) continue;
    if (rule.rule_id === "polypharmacy_awareness" && !factors.includes("polypharmacy"))
      continue;
    if (
      rule.rule_id === "duplication_caution" &&
      !factors.includes("existing_supplement_duplication")
    )
      continue;
    if (rule.rule_id === "renal_mineral_caution" && !factors.includes("renal_disease"))
      continue;

    const type = (rule.recommendation_type as RecType) ?? "review_required";
    const matchedMeds = ctx.confirmed_medications
      .filter((m) =>
        rule.trigger_drug_classes.some((tc) => (m.drug_class ?? "").toLowerCase().includes(tc)),
      )
      .map((m) => m.generic_name);

    const severityTier = resolveSeverityTier(rule);
    const matchedFactors = buildMatchedFactors(rule, ctx, factors);
    const rationale = buildRationale({
      ruleId: rule.rule_id,
      severity: severityTier,
      evidence: rule.evidence_level ?? "moderate",
      source: rule.rule_source ?? "curated",
      matchedFactors,
      advice: rule.advice ?? rule.pharmacist_message,
      safetyNet: rule.safety_net ?? "Return if symptoms worsen or new symptoms develop.",
      mechanism: rule.mechanism,
      mechanismDetail: rule.mechanism_detail,
      onset: rule.onset,
      alternatives: [],
    });
    const conf = rationale.confidence;

    recs.push({
      recommendation_type: type,
      title: rule.name,
      confidence: confidenceToTier(conf),
      confidence_score: conf,
      severity_tier: severityTier,
      score: TYPE_BASE_SCORE[type] + (classMatch ? 80 : 0) + (factorMatch ? 60 : 0),
      rank: 0,
      why_triggered: rule.description,
      rationale,
      pharmacist_checks: rule.pharmacist_checks ?? [],
      talking_points: [rule.pharmacist_message],
      safety_cautions:
        severityCompare(severityTier, "moderate") >= 0 ? [rule.pharmacist_message] : [],
      interaction_notes: rule.avoid_product_keywords.length
        ? [`Avoid: ${rule.avoid_product_keywords.slice(0, 6).join(", ")}`]
        : [],
      matched_medicines: matchedMeds,
      matched_patient_factors: rule.trigger_patient_factors.filter((f) => factors.includes(f)),
      source_references: [
        {
          source: rule.rule_source ?? "curated",
          tier_label: "Built-in safety rule",
          note: rule.rule_id,
        },
      ],
    });
  }

  // ---- Symptom-driven counselling prompts --------------------------------
  const symptomBlob = (ctx.symptoms + " " + ctx.counselling_goal).toLowerCase();
  const pregBlock = factors.includes("pregnancy") || factors.includes("breastfeeding");

  for (const map of SYMPTOM_MAP) {
    if (!map.keywords.some((k) => symptomBlob.includes(k))) continue;
    if (map.topic === "magnesium" && pregBlock) continue;

    const matchedFactors: MatchedFactor[] = [
      { factor: "symptom", value: symptomBlob.slice(0, 120), matched: true },
    ];
    if (factors.includes("renal_disease") && map.topic === "magnesium") {
      matchedFactors.push({
        factor: "renal_function",
        value: "renal impairment",
        matched: true,
        evidence: "Magnesium contraindicated in renal impairment",
      });
    }
    if (factors.includes("mineral_timing_risk") && map.topic === "magnesium") {
      matchedFactors.push({
        factor: "medication_class",
        value: "thyroid/quinolone/tetracycline/bisphosphonate",
        matched: true,
        evidence: "Mineral separation required",
      });
    }
    const severityTier: SeverityTier = factors.includes("renal_disease")
      ? "major"
      : "moderate";
    const rationale = buildRationale({
      ruleId: `engine:symptom_map:${map.topic}`,
      severity: severityTier,
      evidence: "moderate",
      source: "curated",
      matchedFactors,
      advice: map.advice,
      safetyNet: map.safetyNet,
      mechanism: "clinical",
    });
    const conf = rationale.confidence;

    const recType: RecType =
      map.topic === "reflux_counselling" || map.topic === "iron_b12"
        ? "counselling_prompt"
        : "product_discussion";
    recs.push({
      recommendation_type: recType,
      title: map.suggestionTitle,
      product_name: map.topic === "magnesium" ? "Magnesium (generic)" : undefined,
      confidence: confidenceToTier(conf),
      confidence_score: conf,
      severity_tier: severityTier,
      score: TYPE_BASE_SCORE[recType] + 60,
      rank: 0,
      why_triggered: `Symptom or goal mentioned: "${map.keywords.find((k) => symptomBlob.includes(k))}"`,
      rationale,
      pharmacist_checks: [...map.checks],
      talking_points: map.talking,
      safety_cautions: [],
      interaction_notes: [],
      matched_medicines: [],
      matched_patient_factors: factors.filter((f) => f !== "allergy_risk"),
      source_references: [
        {
          source: "PharmaPrompt symptom map",
          tier_label: "Built-in counselling prompt",
          note: map.topic,
        },
      ],
    });
  }

  if (factors.includes("allergy_risk")) {
    for (const r of recs) {
      if (r.recommendation_type === "product_discussion") {
        r.pharmacist_checks.push(
          `Cross-check ingredients against patient allergies: ${ctx.allergies}`,
        );
      }
    }
  }

  // ---- Red-flag symptom screening (REDS / WWHAM) -------------------------
  for (const hit of screenRedFlags(ctx, factors)) {
    recs.push(redFlagToRec(hit, ctx, factors));
  }

  // ---- OTC × prescribed-medication interactions ---------------------------
  for (const hit of checkOtcInteractions(ctx, factors)) {
    recs.push(otcInteractionToRec(hit));
  }

  // ---- Product recommendations (Phase 5) ----------------------------------
  if (products.length > 0) {
    const triggeredRuleIds = new Set(
      recs
        .filter(
          (r) =>
            r.recommendation_type === "safety_caution" ||
            r.recommendation_type === "administration" ||
            r.recommendation_type === "review_required",
        )
        .map((r) => r.rationale.ruleFired)
        .filter((id) => id && !id.startsWith("engine:") && !id.startsWith("red_flag:") && !id.startsWith("otc_interaction:")),
    );
    const triggeredRules = rules.filter((r) => triggeredRuleIds.has(r.rule_id));
    const productRecs = recommendProducts(ctx, products, triggeredRules);
    // Convert ProductRecommendation to GeneratedRec shape
    for (const pr of productRecs) {
      recs.push({
        recommendation_type: "product_recommendation",
        title: pr.title,
        product_id: pr.product_id,
        product_name: pr.product_name,
        brand: pr.brand,
        confidence: "Medium",
        confidence_score: 50,
        severity_tier: "minor",
        score: TYPE_BASE_SCORE.product_recommendation + 50,
        rank: 0,
        why_triggered: pr.why_triggered,
        rationale: pr.rationale,
        pharmacist_checks: pr.pharmacist_checks,
        talking_points: pr.talking_points,
        safety_cautions: pr.safety_cautions,
        interaction_notes: pr.interaction_notes,
        matched_medicines: pr.matched_medicines,
        matched_patient_factors: pr.matched_patient_factors,
        matched_product_tags: pr.matched_product_tags,
        source_references: pr.source_references,
      });
    }
  }

  // ---- Sort and rank ------------------------------------------------------
  recs.sort((a, b) => {
    const sev = severityCompare(b.severity_tier, a.severity_tier);
    if (sev !== 0) return sev;
    const ti = TYPE_ORDER.indexOf(a.recommendation_type) - TYPE_ORDER.indexOf(b.recommendation_type);
    if (ti !== 0) return ti;
    return b.confidence_score - a.confidence_score;
  });
  recs.forEach((r, i) => (r.rank = i));

  return recs;
}

function redFlagToRec(hit: RedFlagHit, ctx: PatientCtx, factors: string[]): GeneratedRec {
  const matchedFactors: MatchedFactor[] = [
    {
      factor: "red_flag",
      value: hit.trigger_matched,
      matched: true,
      evidence: hit.trigger_reason,
    },
  ];
  if (ctx.age !== null && ctx.age >= 65) {
    matchedFactors.push({ factor: "age", value: String(ctx.age), matched: true });
  }
  if (factors.includes("polypharmacy")) {
    matchedFactors.push({ factor: "polypharmacy", value: "5+ medications", matched: true });
  }
  const rationale = buildRationale({
    ruleId: `red_flag:${hit.id}`,
    severity: hit.severity,
    evidence: "high",
    source: hit.source,
    matchedFactors,
    advice: hit.advice,
    safetyNet: hit.safety_net,
    mechanism: "clinical",
    mechanismDetail: hit.trigger_reason,
  });
  return {
    recommendation_type: "red_flag",
    title: hit.title,
    confidence: confidenceToTier(rationale.confidence),
    confidence_score: rationale.confidence,
    severity_tier: hit.severity,
    score: TYPE_BASE_SCORE.red_flag + rationale.confidence,
    rank: 0,
    why_triggered: hit.trigger_reason,
    rationale,
    pharmacist_checks: hit.pharmacist_checks,
    talking_points: [hit.advice],
    safety_cautions: [hit.advice],
    interaction_notes: [],
    matched_medicines: [],
    matched_patient_factors: [],
    source_references: [
      { source: hit.source, tier_label: "Red-flag screening", note: hit.id },
    ],
  };
}

function otcInteractionToRec(hit: OtcInteractionHit): GeneratedRec {
  const rationale = buildRationale({
    ruleId: `otc_interaction:${hit.id}`,
    severity: hit.severity,
    evidence: hit.evidence,
    source: hit.source,
    matchedFactors: [
      { factor: "medication_class", value: hit.trigger_drug_class, matched: true },
      { factor: "indication", value: hit.otc_name, matched: true },
    ],
    advice: hit.advice,
    safetyNet: hit.safety_net,
    mechanism: hit.mechanism,
    mechanismDetail: hit.mechanism_detail,
    onset: hit.onset,
    alternatives: hit.alternatives,
  });
  return {
    recommendation_type: "otc_interaction",
    title: hit.title,
    product_name: hit.otc_name,
    confidence: confidenceToTier(rationale.confidence),
    confidence_score: rationale.confidence,
    severity_tier: hit.severity,
    score: TYPE_BASE_SCORE.otc_interaction + rationale.confidence,
    rank: 0,
    why_triggered: hit.mechanism_detail ?? hit.mechanism,
    rationale,
    pharmacist_checks: hit.pharmacist_checks,
    talking_points: [hit.advice],
    safety_cautions: [hit.advice],
    interaction_notes: hit.avoid_ingredients.map((x) => `Avoid: ${x}`),
    matched_medicines: [],
    matched_patient_factors: [],
    source_references: [
      { source: hit.source, tier_label: "OTC interaction table", note: hit.id },
    ],
  };
}
