// Phase 4 — AI sense-check via Lovable AI Gateway.
// Code-enforced safer-only: AI can only LOWER confidence, ADD cautions, or
// FLAG a rec for review. It can never raise confidence or remove cautions.
import { z } from "zod";
import type { GeneratedRec } from "./engine";
import type { PatientCtx } from "./engine";

const MODEL = "google/gemini-2.5-flash";
const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";

const CONFIDENCE_RANK: Record<string, number> = { Low: 1, Medium: 2, High: 3 };

const SuggestionSchema = z.object({
  index: z.number().int().min(0),
  action: z.enum(["lower_confidence", "add_caution", "flag_for_review", "no_change"]),
  new_confidence: z.enum(["Low", "Medium", "High"]).optional(),
  added_caution: z.string().min(3).max(400).optional(),
  reason: z.string().min(3).max(400),
});

const ResponseSchema = z.object({
  overall_note: z.string().max(800).optional(),
  suggestions: z.array(SuggestionSchema).max(20),
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
- lower_confidence: drop confidence one step (High→Medium, Medium→Low) when the patient context weakens the rule.
- add_caution: append a short, specific safety caution the engine missed.
- flag_for_review: mark a rec as needing pharmacist review before the patient sees it.
- no_change: explicitly say a rec looks correct.

Never recommend specific brand-name OTC products. Never contradict an existing safety caution. Be conservative — when uncertain, lower confidence or flag for review.

Reply with JSON only, matching this shape:
{"overall_note":"...optional one-paragraph clinical summary...","suggestions":[{"index":0,"action":"lower_confidence","new_confidence":"Medium","reason":"..."}]}`;

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

  const userPayload = JSON.stringify({ patient: patientSummary(ctx), recommendations: recsForModel(recs) });

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
    let parsed: z.infer<typeof ResponseSchema>;
    try {
      parsed = ResponseSchema.parse(JSON.parse(content));
    } catch (e) {
      return {
        status: "error",
        model: MODEL,
        latency_ms: Date.now() - started,
        recs,
        applied: [],
        rejected: [],
        error: `Invalid AI response: ${e instanceof Error ? e.message : String(e)}`,
      };
    }

    const next = recs.map((r) => ({ ...r, safety_cautions: [...r.safety_cautions] }));
    const applied: SenseCheckResult["applied"] = [];
    const rejected: SenseCheckResult["rejected"] = [];

    for (const s of parsed.suggestions) {
      if (s.index < 0 || s.index >= next.length) {
        rejected.push({ index: s.index, action: s.action, reason: s.reason, why_rejected: "Index out of range" });
        continue;
      }
      const rec = next[s.index];

      if (s.action === "no_change") {
        applied.push({ index: s.index, action: s.action, reason: s.reason });
        continue;
      }

      if (s.action === "lower_confidence") {
        if (!s.new_confidence) {
          rejected.push({ index: s.index, action: s.action, reason: s.reason, why_rejected: "Missing new_confidence" });
          continue;
        }
        if (CONFIDENCE_RANK[s.new_confidence] >= CONFIDENCE_RANK[rec.confidence]) {
          rejected.push({
            index: s.index,
            action: s.action,
            reason: s.reason,
            why_rejected: `Would not lower confidence (${rec.confidence} → ${s.new_confidence})`,
          });
          continue;
        }
        // Never lower confidence on a safety_caution — that's less safe.
        if (rec.recommendation_type === "safety_caution") {
          rejected.push({
            index: s.index,
            action: s.action,
            reason: s.reason,
            why_rejected: "Cannot lower confidence on a safety_caution",
          });
          continue;
        }
        rec.confidence = s.new_confidence;
        rec.why_triggered = `${rec.why_triggered} · AI sense-check: ${s.reason}`;
        applied.push({ index: s.index, action: s.action, reason: s.reason });
        continue;
      }

      if (s.action === "add_caution") {
        if (!s.added_caution) {
          rejected.push({ index: s.index, action: s.action, reason: s.reason, why_rejected: "Missing added_caution" });
          continue;
        }
        rec.safety_cautions.push(`AI: ${s.added_caution}`);
        applied.push({ index: s.index, action: s.action, reason: s.reason });
        continue;
      }

      if (s.action === "flag_for_review") {
        rec.confidence = "Low";
        rec.why_triggered = `${rec.why_triggered} · Flagged for review by AI sense-check: ${s.reason}`;
        applied.push({ index: s.index, action: s.action, reason: s.reason });
        continue;
      }
    }

    return {
      status: "ok",
      model: MODEL,
      latency_ms: Date.now() - started,
      recs: next,
      applied,
      rejected,
      overall_note: parsed.overall_note,
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
