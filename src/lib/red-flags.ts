// Phase 6 — REDS / WWHAM red-flag symptom screening.
//
// Red flags are patterns in patient context that warrant a same-day
// referral (to GP, ED, or Pharmacy First POM) rather than OTC
// recommendation. They sit at the top of the recommendation stack —
// above all product suggestions — and force the pharmacist to address
// the safety concern before proceeding.
//
// Frameworks encoded:
//   - REDS: Referral, Evidence, Duration, Self-care
//   - WWHAM: Who is it for, What are the symptoms, How long,
//            Action taken already, Medication being taken
//   - iatroX Pharmacy First (2026) red-flag summary
//   - NPA 2021 red-flag symptom summary
//
// The screen is intentionally conservative: a low-confidence red-flag
// match still surfaces, with low severity + low evidence, so the
// pharmacist can dismiss it with a single click rather than missing
// a real one.

import type { PatientCtx } from "./engine-types";
import type { SeverityTier, RuleSource } from "./rationale";

export type { PatientCtx };

export type RedFlagHit = {
  id: string;
  title: string;
  trigger_matched: string;
  trigger_reason: string;
  severity: SeverityTier;
  advice: string;
  safety_net: string;
  pharmacist_checks: string[];
  source: RuleSource;
};

type RedFlag = {
  id: string;
  title: string;
  // Function that decides whether this red flag applies to the patient.
  match: (ctx: PatientCtx, factors: string[], lower: { symptoms: string; goal: string; history: string }) => string | null;
  severity: SeverityTier;
  advice: string;
  safety_net: string;
  pharmacist_checks: string[];
  source: RuleSource;
};

const RED_FLAGS: RedFlag[] = [
  // ---- Chest pain / cardiovascular ---------------------------------------
  {
    id: "chest_pain_cardiac",
    title: "Possible cardiac chest pain — refer immediately",
    match: (_c, _f, l) =>
      /chest pain|chest tight|crushing.{0,15}chest|pressure.{0,15}chest|chest heav/.test(l.symptoms)
        ? "Chest pain or pressure described"
        : null,
    severity: "contraindicated",
    advice: "Refer to ED immediately (999 if acute). Do NOT recommend OTC. Aspirin 300mg only if not allergic and only on EMS advice.",
    safety_net: "If patient has chest pain at rest, radiating to arm/jaw, with sweating or breathlessness — call 999.",
    pharmacist_checks: [
      "Confirm duration, character, radiation",
      "Ask about associated breathlessness, sweating, nausea",
      "Screen for red flags: sudden onset, pain > 15 min, syncope",
    ],
    source: "NICE_CKS",
  },
  {
    id: "stroke_fast",
    title: "Possible stroke (FAST criteria) — call 999",
    match: (_c, _f, l) => {
      const has =
        /(face droop|facial droop|slurred speech|arm weak|one.{0,5}side.{0,5}(weak|numb))/i.test(
          l.symptoms,
        );
      return has ? "FAST-positive symptoms described" : null;
    },
    severity: "contraindicated",
    advice: "Call 999 immediately. Time of onset is critical for thrombolysis window.",
    safety_net: "Stroke is a medical emergency. Do not delay.",
    pharmacist_checks: [
      "Note exact time of symptom onset",
      "FAST: Face, Arms, Speech, Time",
      "Do not give food or drink",
    ],
    source: "NICE_Guideline",
  },
  {
    id: "dyspnoea_severe",
    title: "Severe breathlessness — refer urgently",
    match: (_c, _f, l) =>
      /(can'?t breath|severe breathlessness|gasping|choking)/i.test(l.symptoms)
        ? "Severe breathlessness described"
        : null,
    severity: "contraindicated",
    advice: "Call 999 if acute. Consider PE, pneumothorax, severe asthma, MI.",
    safety_net: "If patient is talking in single words, colour change, or distressed — 999.",
    pharmacist_checks: [
      "Onset (sudden vs gradual)",
      "Associated chest pain, cough, fever",
      "History of asthma, COPD, DVT risk",
    ],
    source: "NICE_CKS",
  },
  // ---- Anaphylaxis / severe allergy ---------------------------------------
  {
    id: "anaphylaxis",
    title: "Possible anaphylaxis — call 999",
    match: (_c, _f, l) => {
      const has =
        /(throat (swollen|tight)|tongue (swollen|swelling)|lip (swollen|swelling)|wheez)/i.test(
          l.symptoms,
        );
      return has ? "Airway involvement (lip/tongue/throat swelling, wheeze)" : null;
    },
    severity: "contraindicated",
    advice: "Call 999. Lay patient flat, raise legs. Adrenaline 0.5mg IM if available and trained.",
    safety_net: "Anaphylaxis is a medical emergency. Even if symptoms improve, hospital assessment is required.",
    pharmacist_checks: [
      "Known allergen exposure?",
      "Airway, breathing, circulation",
      "Time of onset",
    ],
    source: "TGA",
  },
  // ---- GI / surgical -----------------------------------------------------
  {
    id: "gi_bleeding",
    title: "Possible GI bleeding — refer urgently",
    match: (_c, _f, l) =>
      /(black stool|melaena|coffee.{0,5}ground.{0,5}vomit|haematemesis|vomit.{0,5}blood|blood.{0,5}(stool|poo|bowel))/i.test(
        l.symptoms,
      )
        ? "Signs of GI bleeding"
        : null,
    severity: "major",
    advice: "Refer to GP urgent or ED. If actively vomiting blood or large melaena, call 999.",
    safety_net: "Any further bleeding, dizziness, or syncope — call 999.",
    pharmacist_checks: [
      "Quantity and frequency of blood",
      "Associated abdominal pain, dizziness",
      "Anticoagulant/NSAID use",
    ],
    source: "NICE_CKS",
  },
  {
    id: "dysphagia",
    title: "Dysphagia — refer to GP",
    match: (_c, _f, l) =>
      /difficulty swallow|can'?t swallow|food (stuck|sticking)|food (hang|stuck) in (throat|chest)/i.test(
        l.symptoms,
      )
        ? "Difficulty swallowing described"
        : null,
    severity: "major",
    advice: "Refer to GP for investigation. Red flag for oesophageal pathology in adults.",
    safety_net: "If unable to swallow saliva, drooling, or breathing difficulty — ED immediately.",
    pharmacist_checks: [
      "Onset and progression",
      "Solids only vs liquids too",
      "Weight loss, regurgitation, hoarseness",
    ],
    source: "NICE_Guideline",
  },
  // ---- Neuro -------------------------------------------------------------
  {
    id: "sudden_severe_headache",
    title: "Thunderclap headache — call 999",
    match: (_c, _f, l) =>
      /(worst headache|thunderclap|sudden severe headache|headache.{0,20}(worst|worst ever))/i.test(
        l.symptoms,
      )
        ? "Sudden severe / worst-ever headache"
        : null,
    severity: "contraindicated",
    advice: "Call 999. Consider subarachnoid haemorrhage.",
    safety_net: "Any new neurological symptom (weakness, speech change, vision loss) — 999.",
    pharmacist_checks: [
      "Onset (seconds vs minutes vs hours)",
      "Worst headache of life?",
      "Neck stiffness, photophobia, rash",
    ],
    source: "NICE_Guideline",
  },
  {
    id: "headache_neck_stiff",
    title: "Meningism — refer immediately",
    match: (_c, _f, l) =>
      /(stiff neck|neck stiffness|photophobia|light hurts.{0,10}eyes)/i.test(l.symptoms) &&
      /(headache|fever)/i.test(l.symptoms)
        ? "Meningism features (neck stiffness + headache or fever)"
        : null,
    severity: "contraindicated",
    advice: "Same-day ED assessment. Consider bacterial meningitis.",
    safety_net: "If rash + fever + unwell — 999.",
    pharmacist_checks: [
      "Fever",
      "Rash (non-blanching = meningococcal)",
      "Level of consciousness",
    ],
    source: "NICE_Guideline",
  },
  // ---- Pregnancy ---------------------------------------------------------
  {
    id: "pregnancy_bleeding",
    title: "Bleeding in pregnancy — refer to maternity unit",
    match: (c, _f, l) =>
      c.pregnancy_status === "yes" && /(bleeding|spotting)/i.test(l.symptoms)
        ? "Vaginal bleeding in confirmed pregnancy"
        : null,
    severity: "major",
    advice: "Refer to early pregnancy unit or maternity assessment unit same day.",
    safety_net: "Heavy bleeding, pain, or feeling faint — ED immediately.",
    pharmacist_checks: [
      "Gestational age",
      "Quantity of bleeding",
      "Associated pain, dizziness",
    ],
    source: "NICE_Guideline",
  },
  {
    id: "pregnancy_pre_eclampsia",
    title: "Possible pre-eclampsia — refer urgently",
    match: (c, _f, l) =>
      c.pregnancy_status === "yes" &&
      /(severe headache|visual disturbance|epigastric pain|swelling.{0,15}(face|hand)|high blood pressure)/i.test(
        l.symptoms,
      )
        ? "Pregnancy with severe headache / visual change / epigastric pain"
        : null,
    severity: "major",
    advice: "Same-day obstetric assessment. Check BP and urine protein if possible.",
    safety_net: "Seizure = eclampsia = 999.",
    pharmacist_checks: [
      "Gestational age (>20 weeks)",
      "BP if measurable",
      "Visual symptoms, RUQ pain",
    ],
    source: "NICE_Guideline",
  },
  // ---- Children ---------------------------------------------------------
  {
    id: "child_fever_under3m",
    title: "Fever in infant <3 months — refer urgently",
    match: (c, _f, l) => {
      const isChild = c.age !== null && c.age < 0.25;
      return isChild && /fever|hot|temperature|38/.test(l.symptoms) ? "Infant <3 months with fever" : null;
    },
    severity: "major",
    advice: "Same-day paediatric assessment. Febrile infant <3 months = serious until proven otherwise.",
    safety_net: "If lethargic, not feeding, or rash — 999.",
    pharmacist_checks: [
      "Temperature reading",
      "Feeding, wet nappies",
      "Lethargy, irritability",
    ],
    source: "NICE_Guideline",
  },
  {
    id: "child_signs_meningitis",
    title: "Possible meningitis in child — 999",
    match: (c, _f, l) => {
      const isChild = c.age !== null && c.age < 16;
      return isChild && /(rash.{0,30}(non[- ]blanch|doesn't fade|glass test)|neck stiff|photophobia|bulging fontanelle)/i.test(l.symptoms)
        ? "Child with non-blanching rash / meningism"
        : null;
    },
    severity: "contraindicated",
    advice: "Call 999. Give IM benzylpenicillin if available and trained (NICE NG240).",
    safety_net: "Do not wait for the rash to appear if other features present.",
    pharmacist_checks: [
      "Glass test: non-blanching = 999",
      "Fever, neck stiffness, photophobia",
      "Level of consciousness",
    ],
    source: "NICE_Guideline",
  },
  // ---- Mental health ----------------------------------------------------
  {
    id: "suicidal_ideation",
    title: "Suicidal ideation disclosed — risk-assess and refer",
    match: (_c, _f, l) =>
      /(suicid|kill myself|end my life|don'?t want to (live|be alive)|self[- ]harm)/i.test(
        l.symptoms + " " + l.history,
      )
        ? "Suicidal ideation disclosed"
        : null,
    severity: "major",
    advice: "Stay with the patient. Risk-assess calmly. Refer urgently to GP / crisis team (Lifeline 13 11 14 in AU). If immediate risk, call 000.",
    safety_net: "Any plan, means, or timeline = emergency services.",
    pharmacist_checks: [
      "Risk assessment: plan, means, timeframe",
      "Previous attempts",
      "Social supports, isolation",
    ],
    source: "local_guidance",
  },
  // ---- Pharmacology red flags from medical history ----------------------
  {
    id: "anticoag_bleeding_history",
    title: "Anticoagulant + active bleeding history — refer",
    match: (c, f, l) => {
      const onAnticoag = f.includes("bleeding_risk");
      const bleeding = /(bleed|bruis|haemat|black stool|blood in)/i.test(l.history + " " + l.symptoms);
      return onAnticoag && bleeding ? "Anticoagulated patient with bleeding symptoms" : null;
    },
    severity: "major",
    advice: "Refer to GP same day. Consider INR check if warfarin. Avoid all OTCs that affect bleeding.",
    safety_net: "Major bleeding, syncope, or visible blood — 999.",
    pharmacist_checks: [
      "Last INR if warfarin",
      "Time and site of bleeding",
      "Any new medications, antibiotics, herbal",
    ],
    source: "Stockley",
  },
  {
    id: "ace_nsaid_diuretic",
    title: "Triple whammy (ACEi/ARB + diuretic + NSAID) — AKI risk",
    match: (c, f, l) => {
      const onRAAS = c.confirmed_medications.some((m) => /ace_inhibitor|arb/.test((m.drug_class ?? "").toLowerCase()));
      const onDiuretic = c.confirmed_medications.some((m) => /diuretic/.test((m.drug_class ?? "").toLowerCase()));
      const onNsaid =
        c.confirmed_medications.some((m) => /nsaid/.test((m.drug_class ?? "").toLowerCase())) ||
        f.includes("on_nsaid") ||
        /(ibuprofen|naproxen|diclofenac|anti[- ]?inflam|nsaid|aspirin)/i.test(l.symptoms);
      return onRAAS && onDiuretic && onNsaid
        ? "Concurrent ACEi/ARB + diuretic + NSAID"
        : null;
    },
    severity: "major",
    advice: "Pharmacist should recommend paracetamol first-line. Flag to GP for AKI risk and NSAID review.",
    safety_net: "Stop NSAID and seek GP review if reduced urine output, oedema, or new fatigue.",
    pharmacist_checks: [
      "Confirm all three drug classes present",
      "Renal function if known",
      "Duration of triple therapy",
    ],
    source: "NICE_Guideline",
  },
];

export function screenRedFlags(ctx: PatientCtx, factors: string[]): RedFlagHit[] {
  const lower = {
    symptoms: (ctx.symptoms ?? "").toLowerCase(),
    goal: (ctx.counselling_goal ?? "").toLowerCase(),
    history: (ctx.medical_history ?? "").toLowerCase(),
  };
  const hits: RedFlagHit[] = [];
  for (const rf of RED_FLAGS) {
    const trigger = rf.match(ctx, factors, lower);
    if (trigger !== null) {
      hits.push({
        id: rf.id,
        title: rf.title,
        trigger_matched: trigger,
        trigger_reason: trigger,
        severity: rf.severity,
        advice: rf.advice,
        safety_net: rf.safety_net,
        pharmacist_checks: rf.pharmacist_checks,
        source: rf.source,
      });
    }
  }
  return hits;
}
