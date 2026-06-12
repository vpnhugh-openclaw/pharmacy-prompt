// Phase 5 — pharmacist feedback + queue + export.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type FeedbackStatus = "accepted" | "modified" | "declined" | "escalated";

export const submitFeedbackFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (d: { case_id: string; recommendation_id: string; status: FeedbackStatus; notes?: string }) => d,
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("pharmacist_feedback").insert({
      case_id: data.case_id,
      recommendation_id: data.recommendation_id,
      user_id: context.userId,
      status: data.status,
      notes: data.notes ?? null,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const undoFeedbackFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { recommendation_id: string }) => d)
  .handler(async ({ data, context }) => {
    // Delete only the latest feedback for this rec by this user.
    const { data: latest, error: selErr } = await context.supabase
      .from("pharmacist_feedback")
      .select("feedback_id")
      .eq("recommendation_id", data.recommendation_id)
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (selErr) throw new Error(selErr.message);
    if (!latest) return { ok: true };
    const { error: delErr } = await context.supabase
      .from("pharmacist_feedback")
      .delete()
      .eq("feedback_id", latest.feedback_id);
    if (delErr) throw new Error(delErr.message);
    return { ok: true };
  });

export const listQueueFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    // A case enters the queue if it has any recommendation flagged for review,
    // OR if any feedback marked it as 'escalated' and there's no later resolution.
    const { data: recs, error: recsErr } = await context.supabase
      .from("recommendations")
      .select("case_id, recommendation_id, title, recommendation_type, confidence")
      .in("recommendation_type", ["review_required", "safety_caution"])
      .order("rank", { ascending: true })
      .limit(500);
    if (recsErr) throw new Error(recsErr.message);

    const caseIds = Array.from(new Set((recs ?? []).map((r) => r.case_id)));
    if (caseIds.length === 0) return { groups: [] as Array<{ patientCase: unknown; items: unknown[] }> };

    const [casesRes, feedbackRes] = await Promise.all([
      context.supabase
        .from("patient_cases")
        .select("case_id, case_label, age, sex, symptoms, created_at")
        .in("case_id", caseIds)
        .order("created_at", { ascending: false }),
      context.supabase
        .from("pharmacist_feedback")
        .select("recommendation_id, status, created_at")
        .in("case_id", caseIds)
        .order("created_at", { ascending: false }),
    ]);
    if (casesRes.error) throw new Error(casesRes.error.message);
    if (feedbackRes.error) throw new Error(feedbackRes.error.message);

    const latestByRec = new Map<string, string>();
    for (const f of feedbackRes.data ?? []) {
      if (f.recommendation_id && !latestByRec.has(f.recommendation_id)) {
        latestByRec.set(f.recommendation_id, f.status);
      }
    }

    const groups = (casesRes.data ?? []).map((c) => ({
      patientCase: c,
      items: (recs ?? [])
        .filter((r) => r.case_id === c.case_id)
        .map((r) => ({ ...r, latest_status: latestByRec.get(r.recommendation_id) ?? null })),
    }));

    // Hide cases where every flagged rec is already accepted or declined.
    const filtered = groups.filter((g) =>
      g.items.some((i) => i.latest_status === null || i.latest_status === "escalated" || i.latest_status === "modified"),
    );
    return { groups: filtered };
  });

export const getCaseFeedbackFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { caseId: string }) => d)
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("pharmacist_feedback")
      .select("feedback_id, recommendation_id, status, notes, created_at")
      .eq("case_id", data.caseId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const exportCaseFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { caseId: string }) => d)
  .handler(async ({ data, context }) => {
    const [caseRes, recsRes, feedbackRes] = await Promise.all([
      context.supabase.from("patient_cases").select("*").eq("case_id", data.caseId).maybeSingle(),
      context.supabase
        .from("recommendations")
        .select("*")
        .eq("case_id", data.caseId)
        .order("rank", { ascending: true }),
      context.supabase
        .from("pharmacist_feedback")
        .select("recommendation_id, status, notes, created_at")
        .eq("case_id", data.caseId),
    ]);
    if (caseRes.error) throw new Error(caseRes.error.message);
    if (recsRes.error) throw new Error(recsRes.error.message);
    if (!caseRes.data) throw new Error("Case not found");

    const json = {
      generated_at: new Date().toISOString(),
      patient_case: caseRes.data,
      recommendations: recsRes.data ?? [],
      feedback: feedbackRes.data ?? [],
      disclaimer:
        "PharmaPrompt OS — decision support, not medical advice. Pharmacist judgement required.",
    };

    const esc = (v: unknown) => {
      const s = v == null ? "" : Array.isArray(v) ? v.join(" | ") : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const header = [
      "rank",
      "type",
      "title",
      "confidence",
      "why_triggered",
      "talking_points",
      "pharmacist_checks",
      "safety_cautions",
      "matched_medicines",
      "matched_patient_factors",
    ];
    const lines = [header.join(",")];
    for (const r of recsRes.data ?? []) {
      lines.push(
        [
          r.rank,
          r.recommendation_type,
          r.title,
          r.confidence,
          r.why_triggered,
          r.talking_points,
          r.pharmacist_checks,
          r.safety_cautions,
          r.matched_medicines,
          r.matched_patient_factors,
        ]
          .map(esc)
          .join(","),
      );
    }
    return { json, csv: lines.join("\n") };
  });
