// Phase 6 — Structured rationale + 4-tier severity + GRADE evidence.
// This module is the foundation that every recommendation in the engine
// composes against. The shape is modelled on:
//   - PMC 2024 XAI-CDSS meta-analysis recommendations
//   - EU AI Act Article 13 (transparency for high-risk AI systems)
//   - Stockley / Lexicomp monograph conventions
//
// The rule of thumb: a pharmacist must be able to defend every
// recommendation in <10 seconds by reading the rationale object.

export type SeverityTier =
  | "contraindicated" // do not co-administer
  | "major"          // significant clinical risk; refer or substitute
  | "moderate"       // monitor or adjust; counsel
  | "minor";         // information only; usually no action

export type EvidenceLevel =
  | "high"         // GRADE high: further research very unlikely to change estimate
  | "moderate"     // GRADE moderate: further research likely to have important impact
  | "low"          // GRADE low: further research very likely to have important impact
  | "very_low";    // GRADE very low: any estimate is very uncertain

export type RuleSource =
  | "BNF"                  // British National Formulary
  | "NICE_CKS"             // NICE Clinical Knowledge Summaries
  | "NICE_Guideline"       // e.g. NG101 (NSAIDs), NG12 (cancer 2WW)
  | "AMH"                  // Australian Medicines Handbook
  | "MIMS"                 // MIMS Australia / NZ
  | "Stockley"             // Stockley's Drug Interactions
  | "FDA_label"            // US FDA prescribing information
  | "TGA"                  // Australian Therapeutic Goods Administration
  | "AMH_Online"           // AMH online
  | "eTG"                  // Therapeutic Guidelines (eTG)
  | "DRTC"                 // Don't Rush to Crush
  | "ACB"                  // Anticholinergic Burden calculator
  | "Beers_2023"           // AGS Beers Criteria 2023
  | "local_guidance"       // Pharmacy-internal SOP
  | "manufacturer"         // Product leaflet / sponsor
  | "pharmacist_judgement"// Explicitly a pharmacist's clinical call
  | "curated";             // PharmaPrompt catalogue-derived

export type MatchedFactor = {
  // A discrete piece of patient context that contributed to the
  // recommendation. Pharmacist can scan this list to see WHY.
  factor:
    | "medication"
    | "medication_class"
    | "age"
    | "pregnancy"
    | "breastfeeding"
    | "renal_function"
    | "hepatic_function"
    | "allergy"
    | "indication"
    | "symptom"
    | "red_flag"
    | "existing_supplement"
    | "polypharmacy"
    | "sex"
    | "dose";
  value: string;
  matched: boolean;
  evidence?: string; // optional human-readable reason for the match
};

export type Alternative = {
  // A substitute product or therapy the pharmacist could consider.
  product_id?: string;
  product_name: string;
  brand?: string | null;
  rationale: string; // why this is a safe alternative
};

export type ReferralTrigger = {
  // A reason this case should be referred out of pharmacy scope.
  level: "emergency_999" | "gp_urgent" | "gp_routine" | "pharmacy_first_pom" | "self_care";
  reason: string;
  red_flag_id?: string;
};

/**
 * The structured rationale attached to EVERY recommendation.
 * Mirrors the XAI-CDSS literature: confidence, evidence, mechanism,
 * matched factors, alternatives, safety-netting, source attribution.
 */
export type Rationale = {
  confidence: number; // 0-100; computed from severity + evidence + patient-fit
  evidenceLevel: EvidenceLevel;
  severity: SeverityTier;
  mechanism?: string; // pharmacodynamic / pharmacokinetic / clinical / regulatory
  mechanismDetail?: string; // e.g. "additive antiplatelet effect increasing bleeding risk"
  ruleFired: string; // rule_id or "engine:symptom_map:cramp" etc.
  ruleSource: RuleSource;
  matchedFactors: MatchedFactor[];
  alternatives: Alternative[];
  safetyNet: string; // pre-written "come back if..." phrase
  advice: string; // single-sentence actionable advice
  onset?: string; // "immediate" | "hours" | "days" | "weeks" — when the interaction manifests
  documentation?: string; // "advised patient of X, patient verbalised understanding"
};

/**
 * Compute a 0-100 confidence score for a rationale.
 * Formula: severity baseline × evidence multiplier × patient-fit multiplier
 *
 * - Severity baseline:  contraindicated=95, major=80, moderate=55, minor=25
 * - Evidence multiplier: high=1.0, moderate=0.9, low=0.75, very_low=0.55
 * - Patient-fit multiplier: 1.0 + (0.05 * matched_factor_count), capped at 1.25
 *
 * The raw product is clamped to [0, 100] and rounded.
 * Returns an integer in [0, 100].
 */
export function computeConfidence(
  severity: SeverityTier,
  evidence: EvidenceLevel,
  matchedFactorCount: number,
): number {
  const severityBase: Record<SeverityTier, number> = {
    contraindicated: 95,
    major: 80,
    moderate: 55,
    minor: 25,
  };
  const evidenceMult: Record<EvidenceLevel, number> = {
    high: 1.0,
    moderate: 0.9,
    low: 0.75,
    very_low: 0.55,
  };
  const fitMult = Math.min(1.0 + 0.05 * matchedFactorCount, 1.25);
  const raw = severityBase[severity] * evidenceMult[evidence] * fitMult;
  return Math.max(0, Math.min(100, Math.round(raw)));
}

const SEVERITY_RANK: Record<SeverityTier, number> = {
  contraindicated: 4,
  major: 3,
  moderate: 2,
  minor: 1,
};

/** Higher rank = more urgent. */
export function severityCompare(a: SeverityTier, b: SeverityTier): number {
  return SEVERITY_RANK[a] - SEVERITY_RANK[b];
}

const SEVERITY_LABEL: Record<SeverityTier, string> = {
  contraindicated: "Contraindicated",
  major: "Major",
  moderate: "Moderate",
  minor: "Minor",
};

const SEVERITY_TONE: Record<SeverityTier, string> = {
  contraindicated: "signal",
  major: "signal",
  moderate: "amber",
  minor: "muted",
};

const EVIDENCE_LABEL: Record<EvidenceLevel, string> = {
  high: "High certainty",
  moderate: "Moderate certainty",
  low: "Low certainty",
  very_low: "Very low certainty",
};

const SOURCE_LABEL: Record<RuleSource, string> = {
  BNF: "British National Formulary",
  NICE_CKS: "NICE Clinical Knowledge Summaries",
  NICE_Guideline: "NICE Guideline",
  AMH: "Australian Medicines Handbook",
  AMH_Online: "AMH Online",
  MIMS: "MIMS",
  Stockley: "Stockley's Drug Interactions",
  FDA_label: "FDA prescribing information",
  TGA: "TGA",
  eTG: "Therapeutic Guidelines",
  DRTC: "Don't Rush to Crush",
  ACB: "Anticholinergic Burden",
  Beers_2023: "AGS Beers Criteria 2023",
  local_guidance: "Local guidance",
  manufacturer: "Manufacturer information",
  pharmacist_judgement: "Pharmacist judgement",
  curated: "PharmaPrompt catalogue",
};

export const SEVERITY = {
  label: SEVERITY_LABEL,
  tone: SEVERITY_TONE,
  rank: SEVERITY_RANK,
};

export const EVIDENCE = { label: EVIDENCE_LABEL };
export const SOURCES = { label: SOURCE_LABEL, list: Object.keys(SOURCE_LABEL) as RuleSource[] };

/**
 * Build a Rationale object from the raw inputs an engine pass produces.
 * Centralises the construction so every recommendation has a consistent shape.
 */
export function buildRationale(args: {
  ruleId: string;
  severity: SeverityTier;
  evidence: EvidenceLevel;
  source: RuleSource;
  matchedFactors: MatchedFactor[];
  advice: string;
  safetyNet: string;
  mechanism?: string;
  mechanismDetail?: string;
  alternatives?: Alternative[];
  onset?: string;
}): Rationale {
  return {
    confidence: computeConfidence(args.severity, args.evidence, args.matchedFactors.length),
    evidenceLevel: args.evidence,
    severity: args.severity,
    mechanism: args.mechanism,
    mechanismDetail: args.mechanismDetail,
    ruleFired: args.ruleId,
    ruleSource: args.source,
    matchedFactors: args.matchedFactors,
    alternatives: args.alternatives ?? [],
    safetyNet: args.safetyNet,
    advice: args.advice,
    onset: args.onset,
  };
}
