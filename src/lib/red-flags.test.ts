/**
 * Tests for red-flag symptom screening.
 * REGRESSION LOCK-IN: the engine must always surface these critical
 * symptoms above the product recommendations.
 */
import { describe, it, expect } from "vitest";
import { screenRedFlags } from "./red-flags";
import type { PatientCtx } from "./engine-types";

const base: PatientCtx = {
  age: 45,
  sex: "female",
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

describe("screenRedFlags", () => {
  it("returns no hits for an uneventful case", () => {
    expect(screenRedFlags(base, [])).toHaveLength(0);
  });

  it("flags chest pain at rest as contraindicated", () => {
    const ctx = { ...base, symptoms: "crushing chest pain" };
    const hits = screenRedFlags(ctx, []);
    const cardiac = hits.find((h) => h.id === "chest_pain_cardiac");
    expect(cardiac).toBeDefined();
    expect(cardiac?.severity).toBe("contraindicated");
    expect(cardiac?.advice).toMatch(/999|ED/i);
  });

  it("flags FAST-positive symptoms as stroke", () => {
    const ctx = { ...base, symptoms: "facial droop and slurred speech" };
    const hits = screenRedFlags(ctx, []);
    const stroke = hits.find((h) => h.id === "stroke_fast");
    expect(stroke).toBeDefined();
    expect(stroke?.severity).toBe("contraindicated");
  });

  it("flags anaphylaxis with airway involvement", () => {
    const ctx = { ...base, symptoms: "throat swelling and wheeze" };
    const hits = screenRedFlags(ctx, []);
    const ana = hits.find((h) => h.id === "anaphylaxis");
    expect(ana).toBeDefined();
    expect(ana?.severity).toBe("contraindicated");
  });

  it("flags GI bleeding (melaena) as major", () => {
    const ctx = { ...base, symptoms: "black stool for 2 days" };
    const hits = screenRedFlags(ctx, []);
    const gi = hits.find((h) => h.id === "gi_bleeding");
    expect(gi).toBeDefined();
    expect(gi?.severity).toBe("major");
  });

  it("flags thunderclap headache as contraindicated", () => {
    const ctx = { ...base, symptoms: "worst headache of my life, sudden onset" };
    const hits = screenRedFlags(ctx, []);
    const tch = hits.find((h) => h.id === "sudden_severe_headache");
    expect(tch).toBeDefined();
    expect(tch?.severity).toBe("contraindicated");
  });

  it("flags meningism with neck stiffness + fever as contraindicated", () => {
    const ctx = { ...base, symptoms: "fever, severe headache, stiff neck" };
    const hits = screenRedFlags(ctx, []);
    const m = hits.find((h) => h.id === "headache_neck_stiff");
    expect(m).toBeDefined();
    expect(m?.severity).toBe("contraindicated");
  });

  it("flags vaginal bleeding in pregnancy as major", () => {
    const ctx = {
      ...base,
      age: 28,
      pregnancy_status: "yes",
      symptoms: "vaginal bleeding, light",
    };
    const hits = screenRedFlags(ctx, []);
    const p = hits.find((h) => h.id === "pregnancy_bleeding");
    expect(p).toBeDefined();
    expect(p?.severity).toBe("major");
  });

  it("flags fever in infant <3 months as major", () => {
    const ctx = { ...base, age: 0.1, symptoms: "fever 38.5°C" };
    const hits = screenRedFlags(ctx, []);
    const f = hits.find((h) => h.id === "child_fever_under3m");
    expect(f).toBeDefined();
    expect(f?.severity).toBe("major");
  });

  it("flags non-blanching rash in child as contraindicated", () => {
    const ctx = { ...base, age: 5, symptoms: "fever and non-blanching rash on glass test" };
    const hits = screenRedFlags(ctx, []);
    const m = hits.find((h) => h.id === "child_signs_meningitis");
    expect(m).toBeDefined();
    expect(m?.severity).toBe("contraindicated");
  });

  it("flags suicidal ideation as major", () => {
    const ctx = { ...base, symptoms: "feeling like I want to kill myself" };
    const hits = screenRedFlags(ctx, []);
    const s = hits.find((h) => h.id === "suicidal_ideation");
    expect(s).toBeDefined();
    expect(s?.severity).toBe("major");
  });

  it("flags the triple whammy (ACEi + diuretic + NSAID-considering symptoms)", () => {
    const ctx: PatientCtx = {
      ...base,
      age: 72,
      confirmed_medications: [
        { generic_name: "ramipril", drug_class: "ace_inhibitor" },
        { generic_name: "furosemide", drug_class: "diuretic" },
      ],
      symptoms: "back pain, want to take ibuprofen",
    };
    const hits = screenRedFlags(ctx, ["elderly", "on_renin_angiotensin_or_diuretic"]);
    const t = hits.find((h) => h.id === "ace_nsaid_diuretic");
    expect(t).toBeDefined();
    expect(t?.severity).toBe("major");
  });

  it("does NOT flag the triple whammy if pain symptoms are absent", () => {
    const ctx: PatientCtx = {
      ...base,
      age: 72,
      confirmed_medications: [
        { generic_name: "ramipril", drug_class: "ace_inhibitor" },
        { generic_name: "furosemide", drug_class: "diuretic" },
      ],
      symptoms: "just here for a blood pressure check",
    };
    const hits = screenRedFlags(ctx, []);
    const t = hits.find((h) => h.id === "ace_nsaid_diuretic");
    expect(t).toBeUndefined();
  });

  it("every red flag has a non-empty advice and safety_net", () => {
    // Build every plausible variation to exercise the table.
    const scenarios: PatientCtx[] = [
      { ...base, symptoms: "chest pain" },
      { ...base, symptoms: "slurred speech" },
      { ...base, symptoms: "throat tight" },
      { ...base, symptoms: "black stool" },
      { ...base, symptoms: "can't swallow food" },
      { ...base, symptoms: "worst headache" },
      { ...base, symptoms: "fever stiff neck" },
      { ...base, symptoms: "vomiting blood" },
      { ...base, symptoms: "can\'t breathe" },
      { ...base, age: 0.1, symptoms: "fever 38" },
      { ...base, age: 5, symptoms: "non-blanching rash" },
      { ...base, symptoms: "want to end my life" },
    ];
    for (const s of scenarios) {
      for (const h of screenRedFlags(s, [])) {
        expect(h.advice).toBeTruthy();
        expect(h.safety_net).toBeTruthy();
        expect(h.pharmacist_checks.length).toBeGreaterThan(0);
      }
    }
  });
});
