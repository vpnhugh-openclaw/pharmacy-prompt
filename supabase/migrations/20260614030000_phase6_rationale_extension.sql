-- ============================================================
-- Phase 6 — Structured rationale + 4-tier severity + GRADE
-- evidence on the safety_rules and recommendations tables.
--
-- Adds:
--   safety_rules:    severity_tier, evidence_level, rule_source,
--                    mechanism, mechanism_detail, advice,
--                    safety_net, onset
--   recommendations: severity_tier, confidence_score,
--                    matched_factors, mechanism, source_references
--
-- All new columns are nullable or have safe defaults so this is
-- backwards-compatible with the 14 rules already seeded.
-- ============================================================

-- ---------- safety_rules ----------
ALTER TABLE public.safety_rules
  ADD COLUMN IF NOT EXISTS severity_tier    TEXT
    CHECK (severity_tier IN ('contraindicated','major','moderate','minor')),
  ADD COLUMN IF NOT EXISTS evidence_level   TEXT
    CHECK (evidence_level IN ('high','moderate','low','very_low')),
  ADD COLUMN IF NOT EXISTS rule_source      TEXT,
  ADD COLUMN IF NOT EXISTS mechanism        TEXT,
  ADD COLUMN IF NOT EXISTS mechanism_detail TEXT,
  ADD COLUMN IF NOT EXISTS advice           TEXT,
  ADD COLUMN IF NOT EXISTS safety_net       TEXT,
  ADD COLUMN IF NOT EXISTS onset            TEXT
    CHECK (onset IS NULL OR onset IN ('immediate','hours','days','weeks'));

CREATE INDEX IF NOT EXISTS safety_rules_severity_tier_idx
  ON public.safety_rules(severity_tier);

-- Backfill severity_tier for the 14 existing rules from the legacy
-- 3-tier severity column. Mapping: High -> major, Medium -> moderate,
-- Low -> minor. (contraindicated rows will be added via a later
-- curated update.)
UPDATE public.safety_rules
SET severity_tier = CASE severity
  WHEN 'High'   THEN 'major'
  WHEN 'Medium' THEN 'moderate'
  WHEN 'Low'    THEN 'minor'
  ELSE 'moderate'
END
WHERE severity_tier IS NULL;

-- Backfill evidence_level + rule_source with conservative defaults
-- so the rationale object is never missing these fields.
UPDATE public.safety_rules
SET evidence_level = COALESCE(evidence_level, 'moderate'),
    rule_source    = COALESCE(rule_source, 'curated'),
    advice         = COALESCE(advice, pharmacist_message),
    safety_net     = COALESCE(safety_net, 'Stop and seek pharmacist or GP review if symptoms worsen or no improvement in 7 days.');

-- ---------- recommendations ----------
ALTER TABLE public.recommendations
  ADD COLUMN IF NOT EXISTS severity_tier    TEXT
    CHECK (severity_tier IN ('contraindicated','major','moderate','minor')),
  ADD COLUMN IF NOT EXISTS confidence_score INT
    CHECK (confidence_score IS NULL OR (confidence_score >= 0 AND confidence_score <= 100)),
  ADD COLUMN IF NOT EXISTS matched_factors  JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS mechanism        TEXT,
  ADD COLUMN IF NOT EXISTS advice           TEXT,
  ADD COLUMN IF NOT EXISTS safety_net       TEXT,
  ADD COLUMN IF NOT EXISTS alternatives     JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS onset            TEXT
    CHECK (onset IS NULL OR onset IN ('immediate','hours','days','weeks'));

CREATE INDEX IF NOT EXISTS recommendations_severity_tier_idx
  ON public.recommendations(severity_tier, rank);
