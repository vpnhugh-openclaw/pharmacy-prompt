
# PharmaPrompt OS — Build Plan

Your spec is extremely detailed and self-contained, so I'll treat it as the source of truth and execute it in the 6 phases you defined. This is a multi-session build — far too large for one response — so I'll propose to **start now with Phase 1 end-to-end**, then return for each subsequent phase after you verify acceptance.

## Phase order & what each delivers

**Phase 1 — Core flow, no AI, no RAG** (this session)
- Enable Lovable Cloud (Supabase + Auth + RLS).
- Auth (email/password sign-in only, no public signup on landing).
- App shell: sidebar (Home, New review, Past reviews, References, Products, Needs review, Safety rules, Set-up), sticky footer disclaimer, ingestion-status pill.
- Design system in `src/styles.css`: Raleway/Inter, the locked palette (#F7F5EF bg, #151715 text, #7D927B accent, signal red reserved for safety), soft clinical glass surfaces, no purple.
- Schema (minimum for Phase 1): `patient_cases`, `recommendations`, `safety_rules`, `medication_dictionary`, `pharmacist_feedback` + RLS + grants. Seed `medication_dictionary` with ~150 top AU meds + brand aliases. Seed `safety_rules` with every guardrail in the spec.
- Deterministic medication parser (dictionary + fuzzy match, AU brand → generic map).
- 3-step wizard (`/app/review`): Patient → Confirm chips (recognised / did you mean / unknown) → Run.
- Deterministic guardrail engine (client-side for Phase 1, ported to edge fn in Phase 3): bleeding risk on anticoagulants, mineral timing (thyroxine/quinolones/tetracyclines/bisphosphonates), renal cautions, pregnancy/breastfeeding suppression, age/sex suppression, duplication, allergy line.
- Results page with the card hierarchy: safety → admin/timing → review required → counselling → product discussions (cap 3), feedback row with Undo toast, print/export stubs.
- Home dashboard, Past reviews list, Safety rules read-only inspector. References / Products / Setup / Queue rendered as honest "Ready — not yet ingested" empty states.
- **Acceptance:** sample patient (Mrs M, 68F, Metformin/Pantoprazole/Atorvastatin/Aspirin/Coversyl Plus, cramps) runs end-to-end → produces aspirin bleeding caution, PPI duplication awareness, magnesium timing prompt — from rules alone.

**Phase 2 — Data layer** (next session)
Full `kb_chunks` (pgvector), `lookup_indexes`, `products`, `ingestion_jobs`. `/app/setup` with resumable batched ingestion edge function reading your uploaded `pharma_kb_unified.zip` from Storage. `/app/references` real search, `/app/products` browser + drawer + "Mark reviewed".

**Phase 3 — Retrieval-powered engine**
Move engine to `run_recommendation` edge function. Lookup-first → vector via `match_kb_chunks` RPC → source-tier-aware ranking → "Show sources & details" on cards with tier labels in words.

**Phase 4 — AI sense-check**
`runAiSenseCheck` via Lovable AI Gateway, zod-validated, code-enforced safer-only transitions (reject any AI output that raises confidence or removes a safety caution), `sense_check_audits` table, fallback banner.

**Phase 5 — Workflow extras**
`/app/queue` groups, full feedback flow, JSON/CSV export, A4 print stylesheet.

**Phase 6 — Landing page + polish**
Cinematic `/` per spec (hero with floating clinical interface, workflow, preview with Sarah M. card, safety pillars, closing CTA), motion with reduced-motion support, perf pass.

## Technical notes for Phase 1

- Stack already matches: TanStack Start + React + TS + Tailwind v4 + shadcn. I'll use TanStack file-routes under `_authenticated/` for `/app/*`.
- Auth gate is the integration-managed `_authenticated/route.tsx`.
- Phase 1 has zero AI calls and zero vector ops — engine runs in a `createServerFn` using only seeded `safety_rules` + `medication_dictionary`. No fake data anywhere; References/Products/Setup pages render honest empty states.
- Medication dictionary seeded via SQL migration; brand→generic map covers Coversyl, Lipitor, Somac/Nexium, Diabex, Eutroxsig, Eliquis, Xarelto, Plavix, Astrix/Cartia, Panadol Osteo, etc.
- Footer disclaimer + tone rules enforced in shared components.

## What I need from you before I start

1. **Confirm Phase 1 scope is right** and I should start now (Cloud will be enabled, real schema + RLS written, deterministic engine working end-to-end with the sample patient).
2. **Sign-in only** — confirm you want the landing page to gate `/app/*` behind sign-in with no public signup form (admin-provisioned accounts only)? Or allow signup for now and lock down later?
3. The uploaded `pharma_kb_unified.zip` will be parked until Phase 2 — confirm that's fine.

Reply "go" (with answers to 2 & 3) and I'll execute Phase 1 in full.
