// Server functions for PharmaPrompt OS.
// Phase 1: deterministic rule engine. Phase 3: KB evidence attachment.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { runEngine, type PatientCtx, type SafetyRuleRow } from "./engine";
import { attachEvidence } from "./retrieval";
import { runAiSenseCheck } from "./ai-sense-check";

const TXT = (max = 10_000) => z.string().max(max).default("");
const ConfirmedMedSchema = z.object({
  generic_name: z.string().min(1).max(255),
  brand_name: z.string().max(255).optional(),
  drug_class: z.string().max(255).nullable().optional(),
});
const CaseInputSchema = z.object({
  case_label: z.string().max(255).nullable().optional(),
  age: z.number().int().min(0).max(130).nullable(),
  sex: z.string().max(50).nullable(),
  pregnancy_status: z.string().max(50).nullable(),
  breastfeeding_status: z.string().max(50).nullable(),
  allergies: TXT(),
  medical_history: TXT(),
  medication_text: TXT(),
  symptoms: TXT(),
  counselling_goal: TXT(2_000),
  existing_supplements: TXT(),
  pathology_notes: TXT(),
  pharmacist_notes: TXT(),
  confirmed_medications: z.array(ConfirmedMedSchema).max(100),
});
const CaseIdSchema = z.object({ caseId: z.string().uuid() });

export type ConfirmedMed = { generic_name: string; brand_name?: string; drug_class?: string | null };

export type CaseInput = {
  case_label?: string | null;
  age: number | null;
  sex: string | null;
  pregnancy_status: string | null;
  breastfeeding_status: string | null;
  allergies: string;
  medical_history: string;
  medication_text: string;
  symptoms: string;
  counselling_goal: string;
  existing_supplements: string;
  pathology_notes: string;
  pharmacist_notes: string;
  confirmed_medications: ConfirmedMed[];
};

export const getDictionaryFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("medication_dictionary")
      .select("generic_name, brand_names, drug_class, aliases");
    if (error) throw new Error(error.message);
    return (data ?? []).map((d) => ({
      generic_name: d.generic_name,
      brand_names: d.brand_names ?? [],
      drug_class: d.drug_class ?? null,
      aliases: d.aliases ?? [],
    }));
  });

export const listSafetyRulesFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.from("safety_rules").select("*");
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const listCasesFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("patient_cases")
      .select("case_id, case_label, age, sex, symptoms, created_at")
      .order("created_at", { ascending: false })
      .limit(30);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const getCaseFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => CaseIdSchema.parse(d))
  .handler(async ({ data, context }) => {
    const [caseRes, recsRes, auditRes] = await Promise.all([
      context.supabase.from("patient_cases").select("*").eq("case_id", data.caseId).maybeSingle(),
      context.supabase
        .from("recommendations")
        .select("*")
        .eq("case_id", data.caseId)
        .order("rank", { ascending: true }),
      context.supabase
        .from("sense_check_audits")
        .select("status, model, applied_changes, rejected_changes, error_message, latency_ms, raw_response, created_at")
        .eq("case_id", data.caseId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);
    if (caseRes.error) throw new Error(caseRes.error.message);
    if (recsRes.error) throw new Error(recsRes.error.message);
    if (!caseRes.data) throw new Error("Case not found");
    return {
      patientCase: caseRes.data,
      recommendations: recsRes.data ?? [],
      senseCheck: auditRes.data ?? null,
    };
  });

export const createCaseFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => CaseInputSchema.parse(d) as CaseInput)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: rulesData, error: rulesErr } = await supabase.from("safety_rules").select("*");
    if (rulesErr) throw new Error(rulesErr.message);
    const rules: SafetyRuleRow[] = (rulesData ?? []).map((r) => ({
      rule_id: r.rule_id,
      name: r.name,
      description: r.description ?? "",
      trigger_drug_classes: r.trigger_drug_classes ?? [],
      trigger_patient_factors: r.trigger_patient_factors ?? [],
      avoid_product_keywords: r.avoid_product_keywords ?? [],
      severity: r.severity ?? "Medium",
      recommendation_type: r.recommendation_type ?? "review_required",
      pharmacist_message: r.pharmacist_message ?? "",
      pharmacist_checks: Array.isArray(r.pharmacist_checks) ? (r.pharmacist_checks as string[]) : [],
      review_required: !!r.review_required,
    }));

    const ctx: PatientCtx = {
      age: data.age,
      sex: data.sex,
      pregnancy_status: data.pregnancy_status,
      breastfeeding_status: data.breastfeeding_status,
      allergies: data.allergies ?? "",
      medical_history: data.medical_history ?? "",
      symptoms: data.symptoms ?? "",
      counselling_goal: data.counselling_goal ?? "",
      existing_supplements: data.existing_supplements ?? "",
      pathology_notes: data.pathology_notes ?? "",
      confirmed_medications: data.confirmed_medications,
    };

    const baseRecs = await attachEvidence(supabase, runEngine(ctx, rules));
    const sense = await runAiSenseCheck(ctx, baseRecs);
    const recs = sense.recs;

    const { data: caseRow, error: caseErr } = await supabase
      .from("patient_cases")
      .insert({
        user_id: userId,
        case_label: data.case_label ?? null,
        age: data.age,
        sex: data.sex,
        pregnancy_status: data.pregnancy_status,
        breastfeeding_status: data.breastfeeding_status,
        allergies: data.allergies,
        medical_history: data.medical_history,
        medication_text: data.medication_text,
        symptoms: data.symptoms,
        counselling_goal: data.counselling_goal,
        existing_supplements: data.existing_supplements,
        pathology_notes: data.pathology_notes,
        pharmacist_notes: data.pharmacist_notes,
        confirmed_medications: data.confirmed_medications as never,
        detected_drug_classes: Array.from(
          new Set(data.confirmed_medications.map((m) => m.drug_class).filter(Boolean)),
        ) as never,
        detected_patient_factors: Array.from(new Set(recs.flatMap((r) => r.matched_patient_factors))) as never,
      })
      .select("case_id")
      .single();
    if (caseErr) throw new Error(caseErr.message);

    if (recs.length) {
      const rows = recs.map((r) => ({
        case_id: caseRow.case_id,
        user_id: userId,
        recommendation_type: r.recommendation_type,
        title: r.title,
        product_name: r.product_name ?? null,
        brand: r.brand ?? null,
        confidence: r.confidence,
        score: r.score,
        rank: r.rank,
        why_triggered: r.why_triggered,
        pharmacist_checks: r.pharmacist_checks as never,
        talking_points: r.talking_points as never,
        safety_cautions: r.safety_cautions as never,
        interaction_notes: r.interaction_notes as never,
        matched_medicines: r.matched_medicines as never,
        matched_patient_factors: r.matched_patient_factors as never,
        source_references: r.source_references as never,
      }));
      const { error: recErr } = await supabase.from("recommendations").insert(rows);
      if (recErr) throw new Error(recErr.message);
    }

    await supabase.from("sense_check_audits").insert({
      case_id: caseRow.case_id,
      user_id: userId,
      model: sense.model,
      status: sense.status,
      input_summary: {
        age: ctx.age,
        sex: ctx.sex,
        medication_count: ctx.confirmed_medications.length,
        rec_count: baseRecs.length,
      } as never,
      raw_response: (sense.overall_note ? { overall_note: sense.overall_note } : null) as never,
      applied_changes: sense.applied as never,
      rejected_changes: sense.rejected as never,
      error_message: sense.error ?? null,
      latency_ms: sense.latency_ms,
    });

    return { case_id: caseRow.case_id };
  });
