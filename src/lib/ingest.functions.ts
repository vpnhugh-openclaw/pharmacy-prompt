// Phase 2 — ingestion of pharma_kb_unified shards from the kb-source bucket.
// Each call processes ONE shard so the worker stays under the request timeout.
// Uses the admin client to bypass RLS for the kb_chunks insert.
// SECURITY: All admin/ingestion endpoints require the caller to have the 'admin' role.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type RawChunk = {
  chunk_id: string;
  source: string;
  source_name?: string;
  source_tier?: number;
  page_id?: string;
  page_short_id?: string;
  page_type?: string;
  title?: string;
  source_url?: string;
  section_heading?: string;
  section_level?: number;
  chunk_index?: number;
  topic_area?: string;
  topic_code?: string;
  cross_source_tags?: string[];
  retrieval_hints?: string[];
  char_count?: number;
  token_estimate?: number;
  text: string;
};

async function assertAdmin(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (error) throw new Error("Authorization check failed");
  if (!data) throw new Error("Forbidden: admin role required");
}

const JobIdSchema = z.object({ jobId: z.string().uuid() });
const SearchSchema = z.object({
  query: z.string().min(1).max(500),
  limit: z.number().int().min(1).max(50).optional(),
});

export const getIngestionStatusFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("ingestion_jobs")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    const { count } = await supabaseAdmin
      .from("kb_chunks")
      .select("*", { count: "exact", head: true });
    return { jobs: data ?? [], total_chunks: count ?? 0 };
  });

export const ingestShardFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => JobIdSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: job, error: jobErr } = await supabaseAdmin
      .from("ingestion_jobs")
      .select("*")
      .eq("job_id", data.jobId)
      .maybeSingle();
    if (jobErr) throw new Error(jobErr.message);
    if (!job) throw new Error("Job not found");
    if (job.shard_done >= job.shard_total) {
      await supabaseAdmin
        .from("ingestion_jobs")
        .update({ status: "complete", updated_at: new Date().toISOString() })
        .eq("job_id", job.job_id);
      return { done: true, processed: 0, shard_index: job.shard_done };
    }

    const shardIndex = job.shard_done;
    const padded = String(shardIndex).padStart(2, "0");
    const objectPath = `${job.shard_prefix}${padded}.jsonl`;

    const { data: signed, error: signedErr } = await supabaseAdmin.storage
      .from(job.bucket)
      .createSignedUrl(objectPath, 600);
    if (signedErr || !signed) throw new Error(signedErr?.message ?? "Could not sign url");

    await supabaseAdmin
      .from("ingestion_jobs")
      .update({ status: "running", last_error: null, updated_at: new Date().toISOString() })
      .eq("job_id", job.job_id);

    let inserted = 0;
    try {
      const res = await fetch(signed.signedUrl);
      if (!res.ok) throw new Error(`Shard fetch failed: ${res.status}`);
      const text = await res.text();
      const lines = text.split("\n").filter((l) => l.trim().length > 0);

      const BATCH = 250;
      for (let i = 0; i < lines.length; i += BATCH) {
        const slice = lines.slice(i, i + BATCH);
        const rows = slice
          .map((line): RawChunk | null => {
            try {
              return JSON.parse(line) as RawChunk;
            } catch {
              return null;
            }
          })
          .filter((r): r is RawChunk => !!r && !!r.chunk_id && !!r.text)
          .map((r) => ({
            chunk_id: r.chunk_id,
            source: r.source,
            source_name: r.source_name ?? null,
            source_tier: r.source_tier ?? 3,
            page_id: r.page_id ?? null,
            page_short_id: r.page_short_id ?? null,
            page_type: r.page_type ?? null,
            title: r.title ?? null,
            source_url: r.source_url ?? null,
            section_heading: r.section_heading ?? null,
            section_level: r.section_level ?? null,
            chunk_index: r.chunk_index ?? null,
            topic_area: r.topic_area ?? null,
            topic_code: r.topic_code ?? null,
            cross_source_tags: r.cross_source_tags ?? [],
            retrieval_hints: r.retrieval_hints ?? [],
            char_count: r.char_count ?? null,
            token_estimate: r.token_estimate ?? null,
            text: r.text,
          }));
        if (!rows.length) continue;
        const { error: insErr } = await supabaseAdmin
          .from("kb_chunks")
          .upsert(rows, { onConflict: "chunk_id", ignoreDuplicates: true });
        if (insErr) throw new Error(insErr.message);
        inserted += rows.length;
      }

      const nextDone = shardIndex + 1;
      const isComplete = nextDone >= job.shard_total;
      await supabaseAdmin
        .from("ingestion_jobs")
        .update({
          shard_done: nextDone,
          chunks_inserted: job.chunks_inserted + inserted,
          status: isComplete ? "complete" : "running",
          updated_at: new Date().toISOString(),
        })
        .eq("job_id", job.job_id);

      return { done: isComplete, processed: inserted, shard_index: shardIndex };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await supabaseAdmin
        .from("ingestion_jobs")
        .update({ status: "error", last_error: msg, updated_at: new Date().toISOString() })
        .eq("job_id", job.job_id);
      throw new Error(msg);
    }
  });

export const searchKbFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => SearchSchema.parse(d))
  .handler(async ({ data, context }) => {
    const q = data.query.trim();
    if (!q) return { results: [] };
    const limit = Math.min(Math.max(data.limit ?? 20, 1), 50);
    const { data: rows, error } = await context.supabase
      .from("kb_chunks")
      .select("chunk_id, source, source_name, source_tier, title, section_heading, source_url, text, topic_area")
      .textSearch("tsv", q, { type: "websearch", config: "english" })
      .order("source_tier", { ascending: true })
      .limit(limit);
    if (error) throw new Error(error.message);
    return { results: rows ?? [] };
  });

export const resetIngestionFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => JobIdSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin
      .from("ingestion_jobs")
      .update({ shard_done: 0, chunks_inserted: 0, status: "ready", last_error: null })
      .eq("job_id", data.jobId);
    await supabaseAdmin.from("kb_chunks").delete().neq("chunk_id", "");
    return { ok: true };
  });
