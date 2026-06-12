// Medication parser — deterministic dictionary + fuzzy match.
// Used in Step 2 of the review wizard to interpret pasted medication lists.

export type DictEntry = {
  generic_name: string;
  brand_names: string[];
  drug_class: string | null;
  aliases: string[];
};

export type ParsedItem = {
  raw: string;
  status: "recognised" | "fuzzy" | "unknown";
  generic_name?: string;
  brand_name?: string;
  drug_class?: string | null;
  suggestion?: string; // for fuzzy
};

function normalise(s: string): string {
  return s
    .toLowerCase()
    .replace(/\d+\s*(mg|mcg|g|ml|iu|%)/g, " ")
    .replace(/\b(tablet|tab|tabs|cap|caps|capsule|once|twice|daily|bd|tds|qid|nocte|mane|prn|xr|sr|cr|er|mr)\b/g, " ")
    .replace(/[^a-z0-9/+\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const v0 = new Array(b.length + 1).fill(0).map((_, i) => i);
  const v1 = new Array(b.length + 1).fill(0);
  for (let i = 0; i < a.length; i++) {
    v1[0] = i + 1;
    for (let j = 0; j < b.length; j++) {
      const cost = a[i] === b[j] ? 0 : 1;
      v1[j + 1] = Math.min(v1[j] + 1, v0[j + 1] + 1, v0[j] + cost);
    }
    for (let j = 0; j <= b.length; j++) v0[j] = v1[j];
  }
  return v1[b.length];
}

export function splitMedicationText(text: string): string[] {
  return text
    .split(/[,;\n\r]+/g)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

export function parseMedications(text: string, dict: DictEntry[]): ParsedItem[] {
  const tokens = splitMedicationText(text);
  return tokens.map((raw) => parseOne(raw, dict));
}

function parseOne(raw: string, dict: DictEntry[]): ParsedItem {
  const norm = normalise(raw);
  if (!norm) return { raw, status: "unknown" };

  // exact match: generic, brand, alias
  for (const e of dict) {
    if (norm === e.generic_name) {
      return { raw, status: "recognised", generic_name: e.generic_name, drug_class: e.drug_class };
    }
    for (const b of e.brand_names) {
      if (norm === b.toLowerCase() || norm.startsWith(b.toLowerCase() + " ")) {
        return { raw, status: "recognised", generic_name: e.generic_name, brand_name: b, drug_class: e.drug_class };
      }
    }
    for (const a of e.aliases) {
      if (norm === a.toLowerCase()) {
        return { raw, status: "recognised", generic_name: e.generic_name, drug_class: e.drug_class };
      }
    }
  }

  // substring/prefix match (e.g. user typed "metformin 1000 xr")
  for (const e of dict) {
    if (norm.startsWith(e.generic_name)) {
      return { raw, status: "recognised", generic_name: e.generic_name, drug_class: e.drug_class };
    }
    for (const b of e.brand_names) {
      const bn = b.toLowerCase();
      if (norm.startsWith(bn)) {
        return { raw, status: "recognised", generic_name: e.generic_name, brand_name: b, drug_class: e.drug_class };
      }
    }
  }

  // fuzzy match against the first word of input
  const first = norm.split(" ")[0];
  let bestName = "";
  let bestDist = Infinity;
  for (const e of dict) {
    const candidates = [e.generic_name, ...e.brand_names.map((b) => b.toLowerCase()), ...e.aliases.map((a) => a.toLowerCase())];
    for (const c of candidates) {
      const d = levenshtein(first, c);
      if (d < bestDist) {
        bestDist = d;
        bestName = c;
      }
    }
  }
  const threshold = Math.max(2, Math.floor(first.length / 5));
  if (bestDist <= threshold && bestName) {
    return { raw, status: "fuzzy", suggestion: bestName };
  }

  return { raw, status: "unknown" };
}
