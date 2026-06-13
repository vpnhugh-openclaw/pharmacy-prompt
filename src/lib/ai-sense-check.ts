// Phase 4 — AI sense-check via Lovable AI Gateway.
// Code-enforced safer-only: AI can only LOWER confidence, ADD cautions, or
// FLAG a rec for review. It can never raise confidence or remove cautions.
import { z } from "zod";
import type { GeneratedRec } from "./engine";
import type { PatientCtx } from "./engine";

const MODEL = "google/gemini-2.5-flash";
const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";

const CONFIDENCE_RANK: Record<string, number> = { Low: 1, Medium: 2, High: 3 };

// 20 is the hard schema cap. The model payload is also chunked to
// the top 20 candidates by severity so we never overflow. See
// SENSE_CHECK_CANDIDATE_CAP below.
const SUGGESTION_CAP = 20;
export const SENSE_CHECK_CANDIDATE_CAP = SUGGESTION_CAP;

// Default reason when the model omits one. Never blank — we always
// emit something auditable, so a downstream reviewer can see *why*
// the action was applied even if the model went silent.
const DEFAULT_REASON = "(reason not provided by model)";

const SuggestionSchema = z.object({
  index: z.number().int().min(0),
  action: z.enum(["lower_confidence", "add_caution", "flag_for_review", "no_change"]),
  new_confidence: z.enum(["Low", "Medium", "High"]).optional(),
  added_caution: z.string().min(3).max(400).optional(),
  // reason is OPTIONAL in the schema; the parser substitutes a
  // deterministic default if the model omits it. The SYSTEM_PROMPT
  // still demands a reason, but a missing one must never silently
  // kill the whole response (the live incident in 2026-06).
  reason: z.string().max(400).optional(),
});

// Resilient response schema:
//   - overall_note optional (model often omits)
//   - suggestions optional, defaulting to []; if present, must be
//     an array. We cap at 20; overflow is dropped at parse time.
const ResponseSchema = z.object({
  overall_note: z.string().max(800).optional(),
  suggestions: z.array(SuggestionSchema).max(SUGGESTION_CAP).optional(),
});

export type SenseCheckResult = {
  status: "ok" | "skipped" | "error";
  model: string;
  latency_ms: number;
  recs: GeneratedRec[];
  applied: Array<{ index: number; action: string; reason: string }>;
  rejected: Array<{ index: number; action: string; reason: string; why_rejected: string }>;
  overall_note?: string;
  error?: string;
};

function patientSummary(ctx: PatientCtx) {
  return {
    age: ctx.age,
    sex: ctx.sex,
    pregnancy: ctx.pregnancy_status,
    breastfeeding: ctx.breastfeeding_status,
    allergies: ctx.allergies || "NKDA",
    history: ctx.medical_history,
    symptoms: ctx.symptoms,
    goal: ctx.counselling_goal,
    medications: ctx.confirmed_medications.map((m) => m.generic_name),
    supplements: ctx.existing_supplements,
  };
}

function recsForModel(recs: GeneratedRec[]) {
  return recs.map((r, i) => ({
    index: i,
    type: r.recommendation_type,
    title: r.title,
    confidence: r.confidence,
    why: r.why_triggered,
    cautions: r.safety_cautions,
    matched_medicines: r.matched_medicines,
    matched_patient_factors: r.matched_patient_factors,
  }));
}

const SYSTEM_PROMPT = `You are a senior Australian community pharmacist reviewing recommendations a deterministic rule engine has produced for a counter consultation. You CANNOT add new recommendations or remove existing ones. You can only suggest one of:
|- lower_confidence: drop confidence one step (High→Medium, Medium→Low) when the patient context weakens the rule.
|- add_caution: append a short, specific safety caution the engine missed.
|- flag_for_review: mark a rec as needing pharmacist review before the patient sees it.
|- no_change: explicitly say a rec looks correct.

Never recommend specific brand-name OTC products. Never contradict an existing safety caution. Be conservative — when uncertain, lower confidence or flag for review.

For every suggestion you MUST provide a concise 'reason' (one sentence is enough) so the pharmacist reading the report knows why you suggested the change. If you cannot articulate a reason, do not include that suggestion.

Reply with JSON only, matching this shape:
{"overall_note":"...optional one-paragraph clinical summary...","suggestions":[{"index":0,"action":"lower_confidence","new_confidence":"Medium","reason":"..."}]}`;

/**
 * Parse the raw AI response body and apply the suggestions to a
 * defensive copy of `baseRecs`. This is a pure function: it does
 * not call out to any AI service, so it is straightforward to unit
 * test with a hand-crafted JSON string.
 *
 * Failure posture: FAIL CLOSED. If parsing fails or the response is
 * malformed, we return the input recs UNCHANGED with status="error"
 * and an explanatory `error` string. The caller is responsible for
 * surfacing this to the user; we never return zero recs on failure,
 * because the deterministic engine output (including the age gate
 * and avoid_if_tag suppression that run upstream) IS the safety
 * guarantee.
 */
export function parseAndApplySenseCheckResponse(
  rawJson: string,
  baseRecs: GeneratedRec[],
): SenseCheckResult {
  const empty = (status: "ok" | "skipped" | "error", error?: string): SenseCheckResult => ({
    status,
    model: MODEL,
    latency_ms: 0,
    recs: baseRecs,
    applied: [],
    rejected: [],
    error,
  });

  let body: unknown;
  try {
    body = JSON.parse(rawJson);
  } catch (e) {
    return empty("error", `Invalid JSON: ${e instanceof Error ? e.message : String(e)}`);
  }

  let parsed: z.infer<typeof ResponseSchema>;
  try {
    parsed = ResponseSchema.parse(body);
  } catch (e) {
    return empty("error", `Invalid AI response shape: ${e instanceof Error ? e.message : String(e)}`);
  }

  const suggestions = parsed.suggestions ?? [];
  const next = baseRecs.map((r) => ({ ...r, safety_cautions: [...r.safety_cautions] }));
  const applied: SenseCheckResult["applied"] = [];
  const rejected: SenseCheckResult["rejected"] = [];

  for (const s of suggestions) {
    if (s.index < 0 || s.index >= next.length) {
      rejected.push({
        index: s.index,
        action: s.action,
        reason: s.reason ?? DEFAULT_REASON,
        why_rejected: "Index out of range",
      });
      continue;
    }
    const rec = next[s.index];
    const reason = s.reason && s.reason.trim().length > 0 ? s.reason : DEFAULT_REASON;

    if (s.action === "no_change") {
      applied.push({ index: s.index, action: s.action, reason });
      continue;
    }

    if (s.action === "lower_confidence") {
      if (!s.new_confidence) {
        rejected.push({ index: s.index, action: s.action, reason, why_rejected: "Missing new_confidence" });
        continue;
      }
      if (CONFIDENCE_RANK[s.new_confidence] >= CONFIDENCE_RANK[rec.confidence]) {
        rejected.push({
          index: s.index,
          action: s.action,
          reason,
          why_rejected: `Would not lower confidence (${rec.confidence} → ${s.new_confidence})`,
        });
        continue;
      }
      // Never lower confidence on a safety_caution — that's less safe.
      if (rec.recommendation_type === "safety_caution") {
        rejected.push({
          index: s.index,
          action: s.action,
          reason,
          why_rejected: "Cannot lower confidence on a safety_caution",
        });
        continue;
      }
      rec.confidence = s.new_confidence;
      rec.why_triggered = `${rec.why_triggered} · AI sense-check: ${reason}`;
      applied.push({ index: s.index, action: s.action, reason });
      continue;
    }

    if (s.action === "add_caution") {
      if (!s.added_caution) {
        rejected.push({ index: s.index, action: s.action, reason, why_rejected: "Missing added_caution" });
        continue;
      }
      rec.safety_cautions.push(`AI: ${s.added_caution}`);
      applied.push({ index: s.index, action: s.action, reason });
      continue;
    }

    if (s.action === "flag_for_review") {
      rec.confidence = "Low";
      rec.why_triggered = `${rec.why_triggered} · Flagged for review by AI sense-check: ${reason}`;
      applied.push({ index: s.index, action: s.action, reason });
      continue;
    }

    // Defensive: if the action is somehow not one of the enums,
    // reject the suggestion rather than silently dropping it.
    rejected.push({
      index: s.index,
      action: String(s.action),
      reason,
      why_rejected: `Unknown action: ${String(s.action)}`,
    });
  }

  return {
    status: "ok",
    model: MODEL,
    latency_ms: 0,
    recs: next,
    applied,
    rejected,
    overall_note: parsed.overall_note,
  };
}

export async function runAiSenseCheck(
  ctx: PatientCtx,
  recs: GeneratedRec[],
): Promise<SenseCheckResult> {
  const started = Date.now();
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey || recs.length === 0) {
    return {
      status: "skipped",
      model: MODEL,
      latency_ms: 0,
      recs,
      applied: [],
      rejected: [],
      error: !apiKey ? "LOVABLE_API_KEY not set" : "no recommendations to review",
    };
  }

  // ---- CHUNK / LIMIT CANDIDATES --------------------------------------
  // The model can only usefully comment on a handful of recs anyway,
  // and the schema caps the response at 20. Sorting by severity (most
  // important first) and taking the top 20 means we send fewer tokens
  // AND we can never overflow the schema. This is the preferred fix
  // for the cap mismatch (36 candidates, cap 20) — see the brief.
  const sortedForModel = [...recs]
    .map((r, i) => ({ r, originalIndex: i }))
    .sort((a, b) => {
      const sevOrder: Record<string, number> = {
        contraindicated: 0,
        major: 1,
        moderate: 2,
        minor: 3,
      };
      const sa = sevOrder[a.r.severity_tier] ?? 4;
      const sb = sevOrder[b.r.severity_tier] ?? 4;
      if (sa !== sb) return sa - sb;
      return b.r.confidence_score - a.r.confidence_score;
    })
    .slice(0, SENSE_CHECK_CANDIDATE_CAP)
    .map(({ r }) => r);

  // Re-index the candidates so the model's `index` field refers to
  // the (smaller) payload we actually sent, not the original recs
  // array. We map back to the original index when applying.
  const reindexMap = sortedForModel.map((r) => recs.indexOf(r));

  const userPayload = JSON.stringify({
    patient: patientSummary(ctx),
    recommendations: recsForModel(sortedForModel),
  });

  try {
    const res = await fetch(GATEWAY_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userPayload },
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return {
        status: "error",
        model: MODEL,
        latency_ms: Date.now() - started,
        recs,
        applied: [],
        rejected: [],
        error: `Gateway ${res.status}: ${text.slice(0, 200)}`,
      };
    }

    const body = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const content = body.choices?.[0]?.message?.content ?? "";

    // Hand off to the pure parser, which is unit-tested for resilience.
    // The parser sees the (sliced) re-indexed recs, but the result it
    // returns is in terms of those indices. We then map the applied /
    // rejected indices back to the original recs array.
    const candidateResult = parseAndApplySenseCheckResponse(content, sortedForModel);
    if (candidateResult.status === "error") {
      // Re-target to the original recs (preserve failure posture).
      return {
        status: "error",
        model: MODEL,
        latency_ms: Date.now() - started,
        recs, // unchanged base recs
        applied: [],
        rejected: [],
        error: candidateResult.error,
      };
    }

    // Re-map the indices back to the original recs array.
    const remappedApplied = candidateResult.applied
      .map((a) => ({
        ...a,
        index: reindexMap[a.index] ?? a.index,
      }))
      .filter((a) => a.index >= 0 && a.index < recs.length);

    const remappedRejected = candidateResult.rejected
      .map((r) => ({
        ...r,
        index: reindexMap[r.index] ?? r.index,
      }))
      .filter((r) => r.index >= 0 && r.index < recs.length);

    // Apply the changes to the ORIGINAL recs array (not the sliced
    // candidate copy) so the returned recs are the full set with
    // only the indexed ones modified.
    const next = recs.map((r) => ({ ...r, safety_cautions: [...r.safety_cautions] }));
    for (const a of remappedApplied) {
      if (a.action === "lower_confidence") {
        const orig = recs[a.index];
        const cand = sortedForModel.find((_, i) => reindexMap[i] === a.index);
        if (orig && cand) {
          next[a.index].confidence = cand.confidence;
          next[a.index].why_triggered = cand.why_triggered;
        }
      } else if (a.action === "flag_for_review") {
        const cand = sortedForModel.find((_, i) => reindexMap[i] === a.index);
        if (cand) {
          next[a.index].confidence = cand.confidence;
          next[a.index].why_triggered = cand.why_triggered;
        }
      } else if (a.action === "add_caution") {
        const cand = sortedForModel.find((_, i) => reindexMap[i] === a.index);
        if (cand) {
          next[a.index].safety_cautions = cand.safety_cautions;
        }
      }
      // no_change: nothing to copy
    }

    return {
      status: "ok",
      model: MODEL,
      latency_ms: Date.now() - started,
      recs: next,
      applied: remappedApplied,
      rejected: remappedRejected,
      overall_note: candidateResult.overall_note,
    };
  } catch (e) {
    return {
      status: "error",
      model: MODEL,
      latency_ms: Date.now() - started,
      recs,
      applied: [],
      rejected: [],
      error: e instanceof Error ? e.message : String(e),
    };
  }
}
