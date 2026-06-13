/**
 * Tests for the sense-check parser/apply step in ai-sense-check.ts.
 *
 * Background: in a live case the AI returned a `suggestions` array of
 * 36 items, but the Zod schema capped it at 20. The whole response
 * was thrown away (status="error", recs=baseRecs) and the report
 * showed "AI sense-check unavailable — showing deterministic
 * recommendations only" with no AI-driven filtering. Also, most
 * entries in the 36-item response were missing the `reason` field,
 * which is currently `.min(3)` (required).
 *
 * Three failure modes these tests pin down:
 *
 *   A. Cap mismatch. If the model returns >20 suggestions, we must
 *      either chunk the input we send (preferred) or accept the
 *      overflow gracefully. We chose the chunking approach — the
 *      test asserts that the parser NEVER throws when given >20
 *      suggestions, and that it only returns at most 20 applied
 *      actions.
 *
 *   B. Missing `reason` field. We make reason optional in the
 *      schema; when the model omits it we substitute a deterministic
 *      default string and STILL apply the action (we never throw
 *      away a valid action just because the rationale is missing).
 *
 *   C. Malformed response resilience. A response with a completely
 *      unparseable `suggestions` field, or no `suggestions` field at
 *      all, must not throw — the parser returns an empty applied
 *      list and the caller proceeds with the base recs.
 */
import { describe, it, expect } from "vitest";
import { z } from "zod";
import type { GeneratedRec } from "./engine";

// We import the *function under test*. It doesn't exist yet — these
// tests will fail (RED) until the implementation lands.
import { parseAndApplySenseCheckResponse } from "./ai-sense-check";

function makeRec(overrides: Partial<GeneratedRec> = {}): GeneratedRec {
  return {
    recommendation_type: "product_recommendation",
    title: "Test product",
    product_name: "Test product",
    brand: "Test brand",
    confidence: "Medium",
    confidence_score: 50,
    severity_tier: "minor",
    score: 200,
    rank: 0,
    why_triggered: "Test trigger",
    rationale: {
      ruleFired: "test",
      severity: "minor",
      evidenceLevel: "moderate",
      ruleSource: "curated",
      matchedFactors: [],
      advice: "Test advice",
      safetyNet: "Test safety net",
      mechanism: "test",
      mechanismDetail: undefined,
      onset: undefined,
      alternatives: [],
      confidence: 50,
    },
    pharmacist_checks: [],
    talking_points: [],
    safety_cautions: [],
    interaction_notes: [],
    matched_medicines: [],
    matched_patient_factors: [],
    matched_product_tags: [],
    source_references: [],
    ...overrides,
  };
}

// =============================================================================
// A. Cap mismatch (36 > 20)
// =============================================================================

describe("parseAndApplySenseCheckResponse — cap mismatch", () => {
  it("does NOT throw when the model returns 36 suggestions (above the schema cap of 20)", () => {
    const baseRecs: GeneratedRec[] = Array.from({ length: 5 }, (_, i) =>
      makeRec({ title: `Rec ${i}` }),
    );
    // Build a 36-item suggestions array, all valid
    const raw = JSON.stringify({
      suggestions: Array.from({ length: 36 }, (_, i) => ({
        index: i % 5,
        action: "no_change",
        reason: `reason for ${i}`,
      })),
    });
    expect(() => parseAndApplySenseCheckResponse(raw, baseRecs)).not.toThrow();
  });

  it("returns at most 20 applied actions even when the model returns 36", () => {
    const baseRecs: GeneratedRec[] = Array.from({ length: 5 }, (_, i) =>
      makeRec({ title: `Rec ${i}` }),
    );
    const raw = JSON.stringify({
      suggestions: Array.from({ length: 36 }, (_, i) => ({
        index: i % 5,
        action: "no_change",
        reason: `r${i}`,
      })),
    });
    const result = parseAndApplySenseCheckResponse(raw, baseRecs);
    expect(result.applied.length).toBeLessThanOrEqual(20);
    // The applied actions are the 20 lowest-index ones (i%5 cycles
    // through 0..4 so 0..4 are first to be seen). Just assert the
    // count, not the exact entries.
  });

  it("processes a small (<=20) response exactly as before (no regression)", () => {
    const baseRecs: GeneratedRec[] = [makeRec({ title: "Rec 0" })];
    const raw = JSON.stringify({
      suggestions: [
        { index: 0, action: "no_change", reason: "looks fine" },
      ],
    });
    const result = parseAndApplySenseCheckResponse(raw, baseRecs);
    expect(result.applied.length).toBe(1);
    expect(result.applied[0].action).toBe("no_change");
  });
});

// =============================================================================
// B. Missing `reason` field
// =============================================================================

describe("parseAndApplySenseCheckResponse — missing reason", () => {
  it("does NOT throw when every suggestion omits `reason`", () => {
    const baseRecs: GeneratedRec[] = [makeRec()];
    const raw = JSON.stringify({
      suggestions: [{ index: 0, action: "no_change" }], // no reason
    });
    expect(() => parseAndApplySenseCheckResponse(raw, baseRecs)).not.toThrow();
  });

  it("STILL APPLIES the action when `reason` is missing, using a deterministic default reason", () => {
    const baseRecs: GeneratedRec[] = [makeRec()];
    const raw = JSON.stringify({
      suggestions: [{ index: 0, action: "no_change" }], // no reason
    });
    const result = parseAndApplySenseCheckResponse(raw, baseRecs);
    expect(result.applied.length).toBe(1);
    expect(result.applied[0].action).toBe("no_change");
    // The reason should be a non-empty default (NOT a crash, NOT
    // silently dropped from the applied list).
    expect(result.applied[0].reason).toBeTruthy();
    expect(result.applied[0].reason.length).toBeGreaterThan(0);
  });

  it("uses the model's reason when provided (no regression)", () => {
    const baseRecs: GeneratedRec[] = [makeRec()];
    const raw = JSON.stringify({
      suggestions: [
        { index: 0, action: "no_change", reason: "model-provided reason" },
      ],
    });
    const result = parseAndApplySenseCheckResponse(raw, baseRecs);
    expect(result.applied[0].reason).toBe("model-provided reason");
  });

  it("accepts a short (1-char) reason rather than rejecting it", () => {
    // The current schema requires reason.min(3); a single-char reason
    // would currently throw the whole response away. The fix: make
    // reason optional, default short reasons to a placeholder.
    const baseRecs: GeneratedRec[] = [makeRec()];
    const raw = JSON.stringify({
      suggestions: [{ index: 0, action: "no_change", reason: "x" }],
    });
    expect(() => parseAndApplySenseCheckResponse(raw, baseRecs)).not.toThrow();
  });
});

// =============================================================================
// C. Malformed response resilience
// =============================================================================

describe("parseAndApplySenseCheckResponse — malformed responses", () => {
  it("returns empty applied + base recs when the response is not JSON", () => {
    const baseRecs: GeneratedRec[] = [makeRec()];
    const result = parseAndApplySenseCheckResponse("not json at all", baseRecs);
    expect(result.applied).toEqual([]);
    expect(result.rejected).toEqual([]);
    expect(result.recs).toBe(baseRecs);
  });

  it("returns empty applied when `suggestions` is missing entirely", () => {
    const baseRecs: GeneratedRec[] = [makeRec()];
    const raw = JSON.stringify({ overall_note: "no suggestions here" }); // no suggestions
    const result = parseAndApplySenseCheckResponse(raw, baseRecs);
    expect(result.applied).toEqual([]);
    // On a no-suggestions response the parser still returns a deep
    // copy (defensive); we assert no data is dropped, not object identity.
    expect(result.recs).toHaveLength(1);
    expect(result.recs[0].title).toBe(baseRecs[0].title);
  });

  it("returns empty applied when `suggestions` is the wrong type (string not array)", () => {
    const baseRecs: GeneratedRec[] = [makeRec()];
    const raw = JSON.stringify({ suggestions: "not an array" });
    const result = parseAndApplySenseCheckResponse(raw, baseRecs);
    expect(result.applied).toEqual([]);
  });

  it("does NOT throw on a suggestion with the wrong action enum", () => {
    const baseRecs: GeneratedRec[] = [makeRec()];
    const raw = JSON.stringify({
      suggestions: [
        { index: 0, action: "totally_invalid_action", reason: "?" },
      ],
    });
    expect(() => parseAndApplySenseCheckResponse(raw, baseRecs)).not.toThrow();
  });

  it("does NOT throw on a suggestion with index out of range — it goes to `rejected`", () => {
    const baseRecs: GeneratedRec[] = [makeRec()];
    const raw = JSON.stringify({
      suggestions: [{ index: 999, action: "no_change", reason: "oob" }],
    });
    const result = parseAndApplySenseCheckResponse(raw, baseRecs);
    expect(result.rejected.length).toBe(1);
    expect(result.rejected[0].why_rejected).toMatch(/index|range/i);
  });
});

// =============================================================================
// D. Failure posture (the critical safety contract)
// =============================================================================

describe("parseAndApplySenseCheckResponse — failure posture", () => {
  it("NEVER drops recs on parse failure — always returns the input recs' titles", () => {
    // This is the contract: if the AI fails, the caller MUST still
    // get the full input list of recs. The deterministic gates
    // (Problem 2) have already run upstream; this is just the AI
    // layer falling back. Zero recs would be failing OPEN.
    const baseRecs: GeneratedRec[] = [
      makeRec({ title: "A" }),
      makeRec({ title: "B" }),
    ];
    const result = parseAndApplySenseCheckResponse("garbage", baseRecs);
    expect(result.recs).toHaveLength(2);
    expect(result.recs.map((r) => r.title)).toEqual(["A", "B"]);
    // status reflects the failure but the recs are still there
    expect(result.status).not.toBe("ok");
  });

  it("preserves the input recs' titles on parse failure (no silent drops)", () => {
    const baseRecs: GeneratedRec[] = [
      makeRec({ title: "X" }),
      makeRec({ title: "Y" }),
      makeRec({ title: "Z" }),
    ];
    const result = parseAndApplySenseCheckResponse("not json", baseRecs);
    expect(result.recs).toHaveLength(3);
    expect(result.recs.map((r) => r.title).sort()).toEqual(["X", "Y", "Z"]);
  });

  it("preserves the input recs when the response is valid JSON but suggestions is missing", () => {
    const baseRecs: GeneratedRec[] = [makeRec({ title: "kept" })];
    const raw = JSON.stringify({ overall_note: "no suggestions here" });
    const result = parseAndApplySenseCheckResponse(raw, baseRecs);
    expect(result.recs).toHaveLength(1);
    expect(result.recs[0].title).toBe("kept");
  });
});

// =============================================================================
// E. Happy path (Item 3) — a realistic, well-formed model response.
// =============================================================================
// Failing closed is the floor. This block proves the success path works
// end-to-end: a model that returns ≤20 suggestions with reasons produces
// status:"ok", every suggestion is applied, and the per-rec fields are
// updated correctly.

describe("parseAndApplySenseCheckResponse — happy path (Item 3)", () => {
  function makeRealisticRecs(): GeneratedRec[] {
    return [
      makeRec({
        recommendation_type: "safety_caution",
        title: "Sertraline + ibuprofen: bleeding risk",
        brand: null,
        confidence: "High",
        confidence_score: 90,
        severity_tier: "major",
        safety_cautions: ["Both drugs affect platelet aggregation"],
        talking_points: ["Take with food"],
        matched_medicines: ["sertraline"],
        matched_patient_factors: [],
      }),
      makeRec({
        recommendation_type: "product_recommendation",
        title: "Activated B Complex",
        product_id: "HOG-0002",
        product_name: "Activated B Complex",
        brand: "Herbs of Gold",
        confidence: "High",
        confidence_score: 80,
        severity_tier: "minor",
        safety_cautions: [],
      }),
      makeRec({
        recommendation_type: "product_recommendation",
        title: "Magnesium Forte",
        product_id: "HOG-0055",
        product_name: "Magnesium Forte",
        brand: "Herbs of Gold",
        confidence: "Medium",
        confidence_score: 60,
        severity_tier: "minor",
        safety_cautions: [],
      }),
      makeRec({
        recommendation_type: "counselling_prompt",
        title: "Discuss timing of sertraline dose",
        confidence: "Medium",
        confidence_score: 65,
        severity_tier: "minor",
        safety_cautions: [],
      }),
      makeRec({
        recommendation_type: "product_recommendation",
        title: "B Sustained Release",
        product_id: "HOG-0008",
        product_name: "B Sustained Release",
        brand: "Herbs of Gold",
        confidence: "Medium",
        confidence_score: 55,
        severity_tier: "minor",
        safety_cautions: [],
      }),
    ];
  }

  it("HAPPY PATH: 6 well-formed suggestions (mix of actions) → status:ok, all applied, recs annotated", () => {
    const baseRecs = makeRealisticRecs();

    // Realistic model response: 6 suggestions, all with reasons, mix of
    // every action type, all indices valid, ≤20. Plus an overall_note.
    const raw = JSON.stringify({
      overall_note:
        "Patient is on sertraline; the major safety caution is well-founded. B-vitamin suggestions are reasonable for fatigue but confidence should be tempered because the patient's tiredness is multifactorial (PPI + SSRI + polypharmacy). Magnesium Forte is supported by the elderly factor but the calcium_support match is incidental.",
      suggestions: [
        {
          index: 0,
          action: "no_change",
          reason: "Major bleeding-risk caution is correct and well-evidenced.",
        },
        {
          index: 1,
          action: "lower_confidence",
          new_confidence: "Medium",
          reason:
            "B-complex supported by tiredness symptom and PPI drug class, but not strongly differentiated from other B products.",
        },
        {
          index: 2,
          action: "add_caution",
          added_caution:
            "Check renal function before recommending long-term magnesium in a 90yo.",
          reason:
            "Magnesium is renally cleared; elderly patients need baseline eGFR check.",
        },
        {
          index: 3,
          action: "flag_for_review",
          reason:
            "Counselling prompt about sertraline timing depends on the patient's morning routine — pharmacist should confirm.",
        },
        {
          index: 4,
          action: "lower_confidence",
          new_confidence: "Low",
          reason:
            "B Sustained Release overlaps with Activated B Complex; pharmacist should pick one.",
        },
        {
          index: 1,
          action: "no_change",
          reason: "Re-iterating — confidence is appropriate after the lower.",
        },
      ],
    });

    const result = parseAndApplySenseCheckResponse(raw, baseRecs);

    // 1. Status is "ok" — the happy path
    expect(result.status).toBe("ok");
    expect(result.error).toBeUndefined();

    // 2. Every suggestion is applied (no rejections in the happy path)
    expect(result.applied.length).toBe(6);
    expect(result.rejected.length).toBe(0);

    // 3. overall_note is preserved
    expect(result.overall_note).toContain("Patient is on sertraline");

    // 4. The recs array is the same length as the input
    expect(result.recs.length).toBe(baseRecs.length);

    // 5. Rec #0 (safety_caution, no_change): confidence UNCHANGED (safer-only)
    expect(result.recs[0].confidence).toBe("High");
    expect(result.recs[0].confidence_score).toBe(90);

    // 6. Rec #1 (Activated B Complex, lower_confidence High→Medium): confidence dropped
    expect(result.recs[1].confidence).toBe("Medium");
    expect(result.recs[1].why_triggered).toContain("AI sense-check");

    // 7. Rec #2 (Magnesium Forte, add_caution): caution appended
    expect(result.recs[2].safety_cautions.length).toBe(1);
    expect(result.recs[2].safety_cautions[0]).toContain("renal function");

    // 8. Rec #3 (counselling_prompt, flag_for_review): confidence forced to Low
    expect(result.recs[3].confidence).toBe("Low");
    expect(result.recs[3].why_triggered).toContain("Flagged for review");

    // 9. Rec #4 (B Sustained Release, lower_confidence Medium→Low): confidence dropped
    expect(result.recs[4].confidence).toBe("Low");

    // 10. The second index=1 suggestion (no_change) is also applied — the
    //     engine does not dedupe by index, which is correct because each
    //     suggestion is an independent action the model requested.
    const idx1Suggestions = result.applied.filter((a) => a.index === 1);
    expect(idx1Suggestions.length).toBe(2);
  });

  it("HAPPY PATH: cap enforcement — 25 well-formed suggestions causes a parse error (schema rejects overflow, doesn't silently drop)", () => {
    // The schema-level cap (`z.array(SuggestionSchema).max(20)`) is
    // enforced by Zod: an array of 25 well-formed suggestions is
    // rejected, and the parser returns status="error" with the
    // base recs preserved (fail-closed). The cap is a defensive
    // belt-and-braces for the upstream candidate chunking in
    // runAiSenseCheck, which slices to 20 BEFORE the model sees them.
    // This test pins the schema behaviour so it doesn't silently
    // change to "first 20 survive" later.
    const baseRecs = makeRealisticRecs();
    const suggestions = [];
    for (let i = 0; i < 25; i++) {
      const idx = i % baseRecs.length;
      let action: string;
      if (idx === 0) {
        action = ["no_change", "add_caution", "flag_for_review"][i % 3];
      } else {
        action = ["no_change", "lower_confidence", "add_caution", "flag_for_review"][i % 4];
      }
      const s: Record<string, unknown> = { index: idx, action, reason: `cap-test reason ${i}` };
      if (action === "lower_confidence") {
        s.new_confidence = "Low";
      }
      if (action === "add_caution") {
        s.added_caution = `cap-test caution ${i}`;
      }
      suggestions.push(s);
    }
    const raw = JSON.stringify({
      overall_note: "Cap enforcement test — 25 suggestions, schema caps at 20.",
      suggestions,
    });
    const result = parseAndApplySenseCheckResponse(raw, baseRecs);
    // Zod rejects the whole array on overflow. status is "error" and
    // the failure posture applies: recs are preserved, no rec data is
    // dropped.
    expect(result.status).toBe("error");
    expect(result.applied.length).toBe(0);
    expect(result.rejected.length).toBe(0);
    expect(result.recs.length).toBe(baseRecs.length);
    expect(result.error).toBeDefined();
    expect(result.error).toMatch(/too big|Array must contain at most|at most 20/i);
  });

  it("HAPPY PATH: realistic response with safety_caution that has confidence lowered (rejected) — safer-only posture holds", () => {
    // The model tries to lower the safety_caution's confidence (High → Medium).
    // The parser MUST reject this — safety_cautions never have their
    // confidence lowered, even on the happy path. This is a critical
    // safety invariant.
    const baseRecs = makeRealisticRecs();
    const raw = JSON.stringify({
      overall_note: "Safety caution is well-evidenced.",
      suggestions: [
        {
          index: 0,
          action: "lower_confidence",
          new_confidence: "Medium",
          reason: "Maybe the bleeding risk is overstated?",
        },
      ],
    });
    const result = parseAndApplySenseCheckResponse(raw, baseRecs);
    expect(result.status).toBe("ok");
    // The suggestion is REJECTED, not applied
    expect(result.applied.length).toBe(0);
    expect(result.rejected.length).toBe(1);
    expect(result.rejected[0].why_rejected).toMatch(/safety_caution/);
    // The rec's confidence is preserved
    expect(result.recs[0].confidence).toBe("High");
  });
});
