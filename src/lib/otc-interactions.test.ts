/**
 * Tests for OTC × prescribed-medication interaction table.
 * Locks in clinical content so a refactor can't silently drop a rule.
 */
import { describe, it, expect } from "vitest";
import { checkOtcInteractions } from "./otc-interactions";
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

describe("checkOtcInteractions", () => {
  it("returns no hits for an uneventful case", () => {
    expect(checkOtcInteractions(base, [])).toHaveLength(0);
  });

  it("warns about NSAID + warfarin (anticoagulant)", () => {
    const ctx: PatientCtx = {
      ...base,
      confirmed_medications: [
        { generic_name: "warfarin 5mg", drug_class: "anticoagulant" },
      ],
    };
    const hits = checkOtcInteractions(ctx, []);
    const w = hits.find((h) => h.id === "nsaid_anticoagulant");
    expect(w).toBeDefined();
    expect(w?.severity).toBe("major");
    expect(w?.avoid_ingredients).toContain("ibuprofen");
    expect(w?.alternatives.length).toBeGreaterThan(0);
  });

  it("warns about NSAID + DOAC (apixaban)", () => {
    const ctx: PatientCtx = {
      ...base,
      confirmed_medications: [
        { generic_name: "apixaban 5mg", drug_class: "anticoagulant" },
      ],
    };
    const hits = checkOtcInteractions(ctx, []);
    const w = hits.find((h) => h.id === "nsaid_anticoagulant");
    expect(w).toBeDefined();
  });

  it("warns about NSAID + SSRI (sertraline)", () => {
    const ctx: PatientCtx = {
      ...base,
      confirmed_medications: [{ generic_name: "sertraline 50mg", drug_class: "ssri" }],
    };
    const hits = checkOtcInteractions(ctx, []);
    const s = hits.find((h) => h.id === "nsaid_ssri");
    expect(s).toBeDefined();
    expect(s?.severity).toBe("moderate");
  });

  it("contraindicates St John's Wort + SSRI", () => {
    const ctx: PatientCtx = {
      ...base,
      confirmed_medications: [{ generic_name: "fluoxetine", drug_class: "ssri" }],
    };
    const hits = checkOtcInteractions(ctx, []);
    const c = hits.find((h) => h.id === "sjw_ssri");
    expect(c).toBeDefined();
    expect(c?.severity).toBe("contraindicated");
    expect(c?.advice).toMatch(/Do NOT/i);
  });

  it("contraindicates decongestant + MAOI", () => {
    const ctx: PatientCtx = {
      ...base,
      confirmed_medications: [{ generic_name: "phenelzine", drug_class: "maoi" }],
    };
    const hits = checkOtcInteractions(ctx, []);
    const d = hits.find((h) => h.id === "decongestant_maoi");
    expect(d).toBeDefined();
    expect(d?.severity).toBe("contraindicated");
  });

  it("flags calcium/iron + levothyroxine timing interaction", () => {
    const ctx: PatientCtx = {
      ...base,
      confirmed_medications: [{ generic_name: "levothyroxine 50mcg", drug_class: "thyroid" }],
    };
    const hits = checkOtcInteractions(ctx, []);
    const t = hits.find((h) => h.id === "calcium_levothyroxine");
    expect(t).toBeDefined();
    expect(t?.severity).toBe("moderate");
    expect(t?.advice).toMatch(/4 hours|≥4/i);
  });

  it("flags calcium/iron + quinolone (ciprofloxacin)", () => {
    const ctx: PatientCtx = {
      ...base,
      confirmed_medications: [{ generic_name: "ciprofloxacin 500mg", drug_class: "quinolone" }],
    };
    const hits = checkOtcInteractions(ctx, []);
    const q = hits.find((h) => h.id === "calcium_quinolone");
    expect(q).toBeDefined();
    expect(q?.severity).toBe("major");
  });

  it("flags the triple whammy when ACEi + diuretic + pain symptoms", () => {
    const ctx: PatientCtx = {
      ...base,
      age: 72,
      confirmed_medications: [
        { generic_name: "ramipril", drug_class: "ace_inhibitor" },
        { generic_name: "furosemide", drug_class: "diuretic" },
      ],
      symptoms: "back pain",
    };
    const hits = checkOtcInteractions(ctx, []);
    const t = hits.find((h) => h.id === "nsaid_ace_diuretic");
    expect(t).toBeDefined();
    expect(t?.severity).toBe("major");
  });

  it("does NOT fire the triple whammy without pain symptoms", () => {
    const ctx: PatientCtx = {
      ...base,
      confirmed_medications: [
        { generic_name: "ramipril", drug_class: "ace_inhibitor" },
        { generic_name: "furosemide", drug_class: "diuretic" },
      ],
      symptoms: "BP check, no complaints",
    };
    const hits = checkOtcInteractions(ctx, []);
    const t = hits.find((h) => h.id === "nsaid_ace_diuretic");
    expect(t).toBeUndefined();
  });

  it("flags sedating antihistamine in elderly", () => {
    const ctx: PatientCtx = {
      ...base,
      age: 78,
      confirmed_medications: [],
    };
    const hits = checkOtcInteractions(ctx, ["elderly"]);
    const a = hits.find((h) => h.id === "antihistamine_elderly");
    expect(a).toBeDefined();
    expect(a?.severity).toBe("moderate");
    expect(a?.alternatives.length).toBeGreaterThan(0);
  });

  it("warns about NSAID + lithium (toxicity)", () => {
    const ctx: PatientCtx = {
      ...base,
      confirmed_medications: [
        { generic_name: "lithium carbonate", drug_class: "mood_stabiliser" },
      ],
    };
    const hits = checkOtcInteractions(ctx, []);
    const l = hits.find((h) => h.id === "nsaid_lithium");
    expect(l).toBeDefined();
    expect(l?.severity).toBe("major");
    expect(l?.mechanism).toBe("pharmacokinetic");
  });

  it("warns about St John's Wort + OCP", () => {
    const ctx: PatientCtx = {
      ...base,
      confirmed_medications: [
        { generic_name: "ethinylestradiol/levonorgestrel", drug_class: "contraceptive" },
      ],
    };
    const hits = checkOtcInteractions(ctx, []);
    const o = hits.find((h) => h.id === "sjw_ocp");
    expect(o).toBeDefined();
    expect(o?.severity).toBe("major");
  });

  it("every hit has alternatives (substitutes the pharmacist can offer)", () => {
    const scenarios: Array<{ id: string; meds: Array<{ g: string; c: string }>; sx?: string }> = [
      { id: "nsaid_anticoagulant", meds: [{ g: "warfarin", c: "anticoagulant" }] },
      { id: "nsaid_lithium", meds: [{ g: "lithium", c: "mood_stabiliser" }] },
      { id: "calcium_levothyroxine", meds: [{ g: "levothyroxine", c: "thyroid" }] },
      { id: "calcium_quinolone", meds: [{ g: "ciprofloxacin", c: "quinolone" }] },
    ];
    for (const s of scenarios) {
      const ctx: PatientCtx = {
        ...base,
        confirmed_medications: s.meds.map((m) => ({
          generic_name: m.g,
          drug_class: m.c,
        })),
      };
      const hits = checkOtcInteractions(ctx, []);
      for (const h of hits) {
        expect(h.alternatives.length, `${h.id} should have alternatives`).toBeGreaterThan(0);
      }
    }
  });

  it("hits have evidence level, source, and onset populated", () => {
    const ctx: PatientCtx = {
      ...base,
      confirmed_medications: [
        { generic_name: "warfarin", drug_class: "anticoagulant" },
        { generic_name: "sertraline", drug_class: "ssri" },
        { generic_name: "ciprofloxacin", drug_class: "quinolone" },
      ],
    };
    const hits = checkOtcInteractions(ctx, []);
    expect(hits.length).toBeGreaterThan(2);
    for (const h of hits) {
      expect(["high", "moderate", "low", "very_low"]).toContain(h.evidence);
      expect(h.source).toBeTruthy();
      expect(["immediate", "hours", "days", "weeks"]).toContain(h.onset);
    }
  });
});
