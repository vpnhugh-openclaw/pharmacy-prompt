// Phase 3 — retrieval helper. Pulls supporting passages from kb_chunks
// for each generated recommendation and returns them as source_references.
// Runs server-side inside createCaseFn (caller passes the authenticated supabase client).

import type { SupabaseClient } from "@supabase/supabase-js";
import type { GeneratedRec } from "./engine";

const TIER_LABEL: Record<number, string> = {
  1: "Australian therapeutic guidelines",
  2: "Australian medicines reference",
  3: "Peer-reviewed reference",
  4: "Patient education",
  5: "Supplementary source",
};

type ChunkRow = {
  chunk_id: string;
  source: string;
  source_name: string | null;
  source_tier: number | null;
  title: string | null;
  section_heading: string | null;
  source_url: string | null;
  text: string;
};

function buildQuery(rec: GeneratedRec): string {
  // Combine matched meds + the most informative words from the title and why_triggered.
  const parts: string[] = [];
  if (rec.matched_medicines.length) parts.push(rec.matched_medicines.slice(0, 3).join(" OR "));
  const title = rec.title.replace(/[^a-zA-Z0-9 ]/g, " ").trim();
  if (title) parts.push(title);
  if (rec.matched_patient_factors.length) {
    parts.push(rec.matched_patient_factors.slice(0, 3).map((f) => f.replace(/_/g, " ")).join(" "));
  }
  return parts.join(" ").slice(0, 240);
}

export async function attachEvidence(
  supabase: SupabaseClient,
  recs: GeneratedRec[],
): Promise<GeneratedRec[]> {
  await Promise.all(
    recs.map(async (rec) => {
      const q = buildQuery(rec);
      if (!q.trim()) return;
      try {
        const { data, error } = await supabase
          .from("kb_chunks")
          .select("chunk_id, source, source_name, source_tier, title, section_heading, source_url, text")
          .textSearch("tsv", q, { type: "websearch", config: "english" })
          .order("source_tier", { ascending: true, nullsFirst: false })
          .limit(3);
        if (error || !data) return;
        const refs = (data as ChunkRow[]).map((c) => ({
          source: c.source_name ?? c.source ?? "Knowledge base",
          tier_label: TIER_LABEL[c.source_tier ?? 3] ?? "Reference",
          note: [c.title, c.section_heading].filter(Boolean).join(" · ") || c.text.slice(0, 140),
          url: c.source_url ?? undefined,
          chunk_id: c.chunk_id,
        }));
        if (refs.length) {
          rec.source_references = [...rec.source_references, ...refs];
        }
      } catch {
        // swallow — evidence is best-effort, the built-in rule reference remains
      }
    }),
  );
  return recs;
}
