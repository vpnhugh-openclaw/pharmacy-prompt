
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS clinical_use_tags text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS avoid_if_tags text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS medicine_interaction_flags text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS counselling_flags text[] NOT NULL DEFAULT '{}';

ALTER TABLE public.recommendations
  ADD COLUMN IF NOT EXISTS severity_tier text,
  ADD COLUMN IF NOT EXISTS confidence_score numeric,
  ADD COLUMN IF NOT EXISTS matched_factors jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS mechanism text,
  ADD COLUMN IF NOT EXISTS advice text,
  ADD COLUMN IF NOT EXISTS safety_net text,
  ADD COLUMN IF NOT EXISTS alternatives jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS onset text;
