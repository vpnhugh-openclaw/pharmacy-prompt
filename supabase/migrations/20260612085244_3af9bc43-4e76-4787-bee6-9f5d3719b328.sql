
-- KB chunks (text + future embedding column reserved)
CREATE TABLE public.kb_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chunk_id TEXT UNIQUE NOT NULL,
  source TEXT NOT NULL,
  source_name TEXT,
  source_tier INT NOT NULL DEFAULT 3,
  page_id TEXT,
  page_short_id TEXT,
  page_type TEXT,
  title TEXT,
  source_url TEXT,
  section_heading TEXT,
  section_level INT,
  chunk_index INT,
  topic_area TEXT,
  topic_code TEXT,
  cross_source_tags TEXT[] DEFAULT '{}',
  retrieval_hints TEXT[] DEFAULT '{}',
  char_count INT,
  token_estimate INT,
  text TEXT NOT NULL,
  tsv TSVECTOR,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.kb_chunks TO authenticated;
GRANT ALL ON public.kb_chunks TO service_role;
ALTER TABLE public.kb_chunks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can read kb_chunks" ON public.kb_chunks
  FOR SELECT TO authenticated USING (true);

CREATE INDEX kb_chunks_tsv_idx ON public.kb_chunks USING GIN (tsv);
CREATE INDEX kb_chunks_source_idx ON public.kb_chunks (source, source_tier);
CREATE INDEX kb_chunks_tags_idx ON public.kb_chunks USING GIN (cross_source_tags);

CREATE OR REPLACE FUNCTION public.kb_chunks_tsv_trigger() RETURNS TRIGGER
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.tsv :=
    setweight(to_tsvector('english', coalesce(NEW.title,'')), 'A') ||
    setweight(to_tsvector('english', coalesce(NEW.section_heading,'')), 'B') ||
    setweight(to_tsvector('english', coalesce(NEW.text,'')), 'C');
  RETURN NEW;
END;
$$;
CREATE TRIGGER kb_chunks_tsv_update BEFORE INSERT OR UPDATE
  ON public.kb_chunks FOR EACH ROW EXECUTE FUNCTION public.kb_chunks_tsv_trigger();

-- Products catalogue (placeholder for Phase 2; populated later)
CREATE TABLE public.products (
  product_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  brand TEXT,
  category TEXT,
  active_ingredients TEXT[] DEFAULT '{}',
  indications TEXT[] DEFAULT '{}',
  cautions TEXT[] DEFAULT '{}',
  pack_sizes TEXT[] DEFAULT '{}',
  schedule TEXT,
  reviewed BOOLEAN NOT NULL DEFAULT false,
  source_url TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.products TO authenticated;
GRANT ALL ON public.products TO service_role;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can read products" ON public.products
  FOR SELECT TO authenticated USING (true);
CREATE INDEX products_name_idx ON public.products (lower(name));

-- Ingestion jobs
CREATE TABLE public.ingestion_jobs (
  job_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_label TEXT NOT NULL,
  bucket TEXT NOT NULL,
  shard_prefix TEXT NOT NULL,
  shard_total INT NOT NULL DEFAULT 0,
  shard_done INT NOT NULL DEFAULT 0,
  chunks_inserted INT NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending',
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.ingestion_jobs TO authenticated;
GRANT ALL ON public.ingestion_jobs TO service_role;
ALTER TABLE public.ingestion_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can read ingestion_jobs" ON public.ingestion_jobs
  FOR SELECT TO authenticated USING (true);

-- Lookup indexes (deterministic concept → chunk pointers)
CREATE TABLE public.lookup_indexes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  concept_type TEXT NOT NULL,
  concept_key TEXT NOT NULL,
  chunk_id TEXT NOT NULL,
  weight INT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.lookup_indexes TO authenticated;
GRANT ALL ON public.lookup_indexes TO service_role;
ALTER TABLE public.lookup_indexes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can read lookup_indexes" ON public.lookup_indexes
  FOR SELECT TO authenticated USING (true);
CREATE INDEX lookup_indexes_lookup ON public.lookup_indexes (concept_type, concept_key);

-- App-level admin role (uses existing user_roles + has_role pattern from Phase 1)
-- (No-op if app_role already includes 'admin' — Phase 1 created it.)
