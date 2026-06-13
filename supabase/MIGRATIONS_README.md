# PharmaPrompt OS — Supabase / Lovable Cloud Migrations

## Important: how migrations get applied

This project uses **Lovable Cloud** (Supabase under the hood) as its
backend. Lovable Cloud has a strict rule that limits which migrations
auto-deploy:

> Migrations are only auto-applied if they were authored through the
> Lovable agent (e.g. by asking the in-app agent to create a migration).
> Migrations committed to the connected GitHub repo are **pushed to the
> repo but NOT applied to the live database**.

This is the root cause of the 2026-06-14 live-sync incident:
- Phase 5 (`20260614010000_seed_products_herbsofgold.sql`),
  Phase 5.1 (`20260614020000_extend_medication_dictionary.sql`) and
  Phase 6 (`20260614030000_phase6_rationale_extension.sql`) were all
  committed and pushed to GitHub.
- Lovable Cloud received the GitHub push but did not run any of them
  against the live database.
- Result: live DB still had 0 products, 145 medication_dictionary rows,
  and no Phase 6 columns on `safety_rules` or `recommendations` —
  the `recommend-products` engine was returning empty lists because
  the products table was empty.

## The remediation file

`scripts/bring_live_db_current.sql` (top-level `scripts/`, **not** a
new entry in `supabase/migrations/`) consolidates the three pending
migrations into a single, fully idempotent SQL file in dependency-safe
order. It is the one-time remediation that catches the live DB up to
the state GitHub thinks it is in.

It is intentionally **not** a 4th migration file: the three originals
already exist in `supabase/migrations/`. A 4th migration that redoes
them would be redundant on a clean run and would diverge from the
audit trail.

To apply it:

1. Open the Lovable editor for this project.
2. Open the **Cloud** panel → **Database** → **SQL editor**.
3. Paste the entire contents of
   `scripts/bring_live_db_current.sql`.
4. Click **Run**.
5. Run the verification queries listed in the file (also at the bottom
   of this README) and confirm the row counts and column lists match
   the expected results.

The file is safe to re-run — all `ALTER ... ADD COLUMN` and
`CREATE INDEX` statements use `IF NOT EXISTS`, the `medication_dictionary`
INSERT uses `ON CONFLICT DO NOTHING`, and the `products` INSERT is
preceded by `DELETE FROM public.products WHERE brand = 'Herbs of Gold'`
so it is a clean reseed of the 103 HOG products.

## Rule for future migrations

**Author new schema changes through the Lovable agent, not by hand.**

- ✅ Ask the Lovable agent: "Add a `last_reviewed_at` column to
  `products` and backfill it from `notes`." The agent will produce
  a migration in the editor and Lovable will apply it to the live DB
  on save.
- ❌ Don't write the SQL yourself, commit it to GitHub and push. It
  will not run. (This is exactly the failure mode that produced the
  2026-06-14 incident.)

If you must hand-author a migration (for a one-off data fix or a
schema change the agent can't express cleanly), do both:
1. Commit the file under `supabase/migrations/`.
2. Open the Lovable SQL editor and paste+run the same content so the
   live DB is updated. The committed file then becomes the audit
   record; the SQL editor run is what actually mutates the DB.

Always record any hand-applied migration in `migrations/APPLIED.md`
with a timestamp, the live row counts before/after, and a link to
the verification queries that were run.

## Verification queries (run after applying the remediation)

```sql
-- Row counts
SELECT count(*) AS products_count
  FROM public.products;
-- expect 103

SELECT count(*) AS medication_dictionary_count
  FROM public.medication_dictionary;
-- expect 166

-- Phase 6 safety_rules columns (expect 8 rows)
SELECT column_name
  FROM information_schema.columns
 WHERE table_name = 'safety_rules'
   AND column_name IN
       ('severity_tier', 'evidence_level', 'rule_source', 'mechanism',
        'mechanism_detail', 'advice', 'safety_net', 'onset');

-- Phase 6 recommendations columns (expect 8 rows)
SELECT column_name
  FROM information_schema.columns
 WHERE table_name = 'recommendations'
   AND column_name IN
       ('severity_tier', 'confidence_score', 'matched_factors', 'mechanism',
        'advice', 'safety_net', 'alternatives', 'onset');

-- Sample: how many safety_rules have a populated severity_tier?
-- expect 13 (all 13 existing rules)
SELECT count(*) FILTER (WHERE severity_tier IS NOT NULL) AS with_tier,
       count(*) AS total
  FROM public.safety_rules;

-- Sample: a couple of seeded products so you can eyeball the data
SELECT brand, name, category,
       array_length(clinical_use_tags, 1) AS tag_count
  FROM public.products
 WHERE brand = 'Herbs of Gold'
 ORDER BY name
 LIMIT 5;
```

## Smoke test (post-apply)

After the live DB is updated, run a sample patient case through the
app to confirm the `recommend-products` pass now returns seeded HOG
products with populated Phase 6 fields. The test case is deliberately
simple so it's easy to eyeball:

1. Go to `https://pharmrecv2.lovable.app` and sign in.
2. Create a new case with:
   - `age`: 55
   - `sex`: Female
   - `pregnancy_status`: not_pregnant
   - `breastfeeding_status`: not_breastfeeding
   - `medical_history`: "Type 2 diabetes"
   - `medication_text`: "metformin 1g BD"
   - `symptoms`: "tired all the time, low energy"
   - `counselling_goal`: "general energy support"
   - `existing_supplements`: "" (empty)
   - `pathology_notes`: "" (empty)
   - `confirmed_medications`: [{ generic_name: "metformin", drug_class: "diabetes" }]
3. Submit. Wait for the engine to finish.
4. Open the saved case. In the recommendations list, expect to see at
   least one `product_recommendation` row referencing a Herbs of Gold
   product — most likely `B Sustained Release` (HOG-0008) which
   carries `b12_support`, `magnesium_support`, `energy_support`,
   matching both the `diabetes` drug class and the `fatigue` /
   `low energy` symptom.
5. Click into the recommendation and confirm the rationale panel
   shows populated `severity_tier`, `advice`, `safety_net`, and
   `alternatives` fields (not all-null).

If the recommendations list is still empty after the migration
applies, the most likely cause is an RLS (Row Level Security) policy
on the `products` table filtering out the seeded rows for the
authenticated user. Diagnose with:

```sql
-- Confirm the rows are visible to the current role
SET ROLE authenticated;
SELECT count(*) FROM public.products;
-- expect 103
RESET ROLE;
```

## Postmortem

The 2026-06-14 incident was caused by a single failure mode: writing
SQL migrations as files and pushing them via GitHub, on the
assumption that Lovable would apply them. It does not. Future schema
work goes through the Lovable agent. This README is the durable
record of that rule.
