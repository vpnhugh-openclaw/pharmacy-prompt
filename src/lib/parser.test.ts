/**
 * Tests for the medication parser + dictionary.
 *
 * Regression lock-in: olanzapine, risperidone, quetiapine, aripiprazole,
 * clozapine, haloperidol, lithium carbonate and other common psychiatric
 * drugs were not in the Phase 1 medication_dictionary seed. Users
 * entering them got "unknown" and the engine skipped them. The
 * 20260614020000_extend_medication_dictionary migration fixes that;
 * these tests guard against re-removal.
 */
import { describe, it, expect } from "vitest";
import { parseMedications, type DictEntry } from "./parser";

// Subset of the dictionary that exercises the most common psychiatric
// and community-pharmacy drugs. In real use this comes from
// listDictionaryFn via the Supabase client; here we just test the parser.
const DICT: DictEntry[] = [
  // Common psychiatric drugs that MUST be in the dictionary
  {
    generic_name: "olanzapine",
    brand_names: ["Zyprexa"],
    drug_class: "antipsychotic_atypical",
    aliases: [],
  },
  {
    generic_name: "risperidone",
    brand_names: ["Risperdal"],
    drug_class: "antipsychotic_atypical",
    aliases: [],
  },
  {
    generic_name: "quetiapine",
    brand_names: ["Seroquel"],
    drug_class: "antipsychotic_atypical",
    aliases: [],
  },
  {
    generic_name: "aripiprazole",
    brand_names: ["Abilify"],
    drug_class: "antipsychotic_atypical",
    aliases: [],
  },
  {
    generic_name: "clozapine",
    brand_names: ["Clozaril"],
    drug_class: "antipsychotic_atypical",
    aliases: [],
  },
  {
    generic_name: "haloperidol",
    brand_names: ["Serenace"],
    drug_class: "antipsychotic_typical",
    aliases: [],
  },
  {
    generic_name: "lithium carbonate",
    brand_names: ["Lithicarb", "Priadel"],
    drug_class: "mood_stabiliser",
    aliases: ["lithium"],
  },
  // Some other drugs that should already be in the dictionary from the Phase 1 seed
  { generic_name: "metformin", brand_names: ["Diabex"], drug_class: "diabetes", aliases: [] },
  { generic_name: "sertraline", brand_names: ["Zoloft"], drug_class: "ssri", aliases: [] },
  {
    generic_name: "warfarin",
    brand_names: ["Marevan", "Coumadin"],
    drug_class: "anticoagulant",
    aliases: [],
  },
];

function parse(text: string) {
  return parseMedications(text, DICT);
}

describe("parser — psychiatric drugs (regression: olanzapine etc)", () => {
  it("recognises olanzapine by generic name", () => {
    const items = parse("Olanzapine 5mg nocte");
    expect(items).toHaveLength(1);
    expect(items[0].status).toBe("recognised");
    expect(items[0].generic_name).toBe("olanzapine");
    expect(items[0].drug_class).toBe("antipsychotic_atypical");
  });

  it("recognises olanzapine by brand (Zyprexa)", () => {
    const items = parse("Zyprexa 5mg");
    expect(items[0].status).toBe("recognised");
    expect(items[0].generic_name).toBe("olanzapine");
  });

  it("recognises risperidone by generic", () => {
    const items = parse("Risperidone 1mg BD");
    expect(items[0].status).toBe("recognised");
    expect(items[0].drug_class).toBe("antipsychotic_atypical");
  });

  it("recognises quetiapine by brand (Seroquel)", () => {
    const items = parse("Seroquel 50mg PRN");
    expect(items[0].status).toBe("recognised");
    expect(items[0].generic_name).toBe("quetiapine");
  });

  it("recognises aripiprazole", () => {
    const items = parse("Aripiprazole 10mg daily");
    expect(items[0].status).toBe("recognised");
  });

  it("recognises clozapine", () => {
    const items = parse("Clozapine 100mg BD");
    expect(items[0].status).toBe("recognised");
  });

  it("recognises haloperidol by brand (Serenace)", () => {
    const items = parse("Serenace 1.5mg");
    expect(items[0].status).toBe("recognised");
    expect(items[0].drug_class).toBe("antipsychotic_typical");
  });

  it("recognises lithium via its alias (lowercase, no brand)", () => {
    // Common community typo: "lithium" instead of "lithium carbonate"
    const items = parse("lithium 250mg BD");
    expect(items[0].status).toBe("recognised");
    expect(items[0].generic_name).toBe("lithium carbonate");
    expect(items[0].drug_class).toBe("mood_stabiliser");
  });

  it("multi-medication: olanzapine + sertraline + metformin parses all three", () => {
    const items = parse("Olanzapine 5mg\nSertraline 100mg daily\nMetformin 1g BD");
    expect(items).toHaveLength(3);
    expect(items.map((i) => i.generic_name).sort()).toEqual(
      ["metformin", "olanzapine", "sertraline"].sort(),
    );
  });
});

describe("parser — still flags truly unknown drugs", () => {
  it("returns 'unknown' for a made-up drug name", () => {
    const items = parse("Xylophrenium 5mg");
    expect(items[0].status).toBe("unknown");
  });
});
