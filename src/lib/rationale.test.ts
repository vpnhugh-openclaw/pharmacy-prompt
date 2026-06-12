/**
 * Tests for the structured rationale module.
 *
 * Every recommendation in the engine must have a Rationale. These tests
 * lock in the public contract: confidence scoring, severity tier
 * ordering, label/tone mappings, and the buildRationale shape.
 */
import { describe, it, expect } from "vitest";
import {
  buildRationale,
  computeConfidence,
  severityCompare,
  SEVERITY,
  EVIDENCE,
  SOURCES,
  type Rationale,
  type SeverityTier,
  type EvidenceLevel,
  type RuleSource,
  type MatchedFactor,
} from "./rationale";

describe("computeConfidence", () => {
  it("contraindicated + high evidence + 0 factors = 95", () => {
    expect(computeConfidence("contraindicated", "high", 0)).toBe(95);
  });

  it("major + moderate evidence = 80 * 0.9 = 72", () => {
    expect(computeConfidence("major", "moderate", 0)).toBe(72);
  });

  it("minor + very_low evidence = 25 * 0.55 = 14", () => {
    expect(computeConfidence("minor", "very_low", 0)).toBe(14);
  });

  it("patient-fit multiplier caps at 1.25 (5+ factors reach the cap)", () => {
    const baseline = computeConfidence("moderate", "high", 0); // 55
    const five = computeConfidence("moderate", "high", 5); // 55 * 1.0 * 1.25 = 68.75 → 69
    const twelve = computeConfidence("moderate", "high", 12); // same cap → 69
    expect(five).toBe(69);
    expect(twelve).toBe(69);
    expect(five).toBeGreaterThan(baseline);
  });

  it("never returns more than 100", () => {
    // Worst case: contraindicated + high + 100 factors
    const c = computeConfidence("contraindicated", "high", 100);
    expect(c).toBeLessThanOrEqual(100);
  });

  it("returns an integer in [0, 100]", () => {
    const tiers: SeverityTier[] = ["contraindicated", "major", "moderate", "minor"];
    const evidences: EvidenceLevel[] = ["high", "moderate", "low", "very_low"];
    for (const s of tiers) {
      for (const e of evidences) {
        for (let f = 0; f < 8; f++) {
          const c = computeConfidence(s, e, f);
          expect(c).toBeGreaterThanOrEqual(0);
          expect(c).toBeLessThanOrEqual(100);
          expect(Number.isInteger(c)).toBe(true);
        }
      }
    }
  });

  it("higher severity always yields >= confidence of lower severity at same evidence+factors", () => {
    const pairs: Array<[SeverityTier, SeverityTier]> = [
      ["contraindicated", "major"],
      ["contraindicated", "moderate"],
      ["contraindicated", "minor"],
      ["major", "moderate"],
      ["major", "minor"],
      ["moderate", "minor"],
    ];
    for (const [hi, lo] of pairs) {
      expect(computeConfidence(hi, "high", 3)).toBeGreaterThanOrEqual(
        computeConfidence(lo, "high", 3),
      );
    }
  });
});

describe("severityCompare", () => {
  it("contraindicated > major > moderate > minor", () => {
    expect(severityCompare("contraindicated", "major")).toBeGreaterThan(0);
    expect(severityCompare("major", "moderate")).toBeGreaterThan(0);
    expect(severityCompare("moderate", "minor")).toBeGreaterThan(0);
    expect(severityCompare("contraindicated", "minor")).toBeGreaterThan(0);
    expect(severityCompare("minor", "contraindicated")).toBeLessThan(0);
    expect(severityCompare("major", "major")).toBe(0);
  });
});

describe("SEVERITY / EVIDENCE / SOURCES metadata", () => {
  it("every severity tier has a label and tone", () => {
    const tiers: SeverityTier[] = ["contraindicated", "major", "moderate", "minor"];
    for (const t of tiers) {
      expect(SEVERITY.label[t]).toBeTruthy();
      expect(SEVERITY.tone[t]).toBeTruthy();
      expect(typeof SEVERITY.rank[t]).toBe("number");
    }
  });

  it("contraindicated and major both use the 'signal' tone (clinically urgent)", () => {
    expect(SEVERITY.tone.contraindicated).toBe("signal");
    expect(SEVERITY.tone.major).toBe("signal");
  });

  it("every evidence level has a label", () => {
    const levels: EvidenceLevel[] = ["high", "moderate", "low", "very_low"];
    for (const l of levels) {
      expect(EVIDENCE.label[l]).toBeTruthy();
    }
  });

  it("every rule source has a label and is in the list", () => {
    const sources: RuleSource[] = [
      "BNF",
      "NICE_CKS",
      "NICE_Guideline",
      "AMH",
      "AMH_Online",
      "MIMS",
      "Stockley",
      "FDA_label",
      "TGA",
      "eTG",
      "DRTC",
      "ACB",
      "Beers_2023",
      "local_guidance",
      "manufacturer",
      "pharmacist_judgement",
      "curated",
    ];
    for (const s of sources) {
      expect(SOURCES.label[s]).toBeTruthy();
      expect(SOURCES.list).toContain(s);
    }
  });
});

describe("buildRationale", () => {
  it("produces a complete Rationale with the right shape", () => {
    const factors: MatchedFactor[] = [
      { factor: "medication", value: "warfarin 5mg", matched: true, evidence: "INR-raising co-med" },
      { factor: "symptom", value: "back pain", matched: true },
    ];
    const r: Rationale = buildRationale({
      ruleId: "nsaid-on-anticoagulant-v1",
      severity: "major",
      evidence: "high",
      source: "BNF",
      matchedFactors: factors,
      advice: "Suggest paracetamol 500mg q6h as first-line; if inadequate, refer to GP.",
      safetyNet: "Return if black stools, vomiting blood, or pain worsens over 7 days.",
      mechanism: "pharmacodynamic",
      mechanismDetail: "Additive antiplatelet effect increasing bleeding risk",
      alternatives: [
        { product_name: "Paracetamol 500mg", rationale: "No anticoagulant interaction" },
        { product_name: "Topical ibuprofen gel", rationale: "Low systemic absorption" },
      ],
      onset: "hours",
    });

    expect(r.ruleFired).toBe("nsaid-on-anticoagulant-v1");
    expect(r.severity).toBe("major");
    expect(r.evidenceLevel).toBe("high");
    expect(r.ruleSource).toBe("BNF");
    expect(r.matchedFactors).toHaveLength(2);
    expect(r.alternatives).toHaveLength(2);
    expect(r.onset).toBe("hours");
    expect(r.advice).toContain("paracetamol");
    expect(r.safetyNet).toContain("Return if");
    expect(r.confidence).toBeGreaterThan(70);
    expect(r.confidence).toBeLessThan(100);
  });

  it("confidence scales with matched factors but caps", () => {
    const r0 = buildRationale({
      ruleId: "x",
      severity: "moderate",
      evidence: "high",
      source: "MIMS",
      matchedFactors: [],
      advice: "a",
      safetyNet: "s",
    });
    const r3 = buildRationale({
      ruleId: "x",
      severity: "moderate",
      evidence: "high",
      source: "MIMS",
      matchedFactors: [
        { factor: "medication", value: "a", matched: true },
        { factor: "medication", value: "b", matched: true },
        { factor: "age", value: "70", matched: true },
      ],
      advice: "a",
      safetyNet: "s",
    });
    expect(r3.confidence).toBeGreaterThan(r0.confidence);
  });

  it("accepts empty alternatives and undefined onset", () => {
    const r = buildRationale({
      ruleId: "y",
      severity: "minor",
      evidence: "low",
      source: "manufacturer",
      matchedFactors: [],
      advice: "Take with food",
      safetyNet: "Return if symptoms persist >7 days",
    });
    expect(r.alternatives).toEqual([]);
    expect(r.onset).toBeUndefined();
    expect(r.mechanism).toBeUndefined();
  });
});
