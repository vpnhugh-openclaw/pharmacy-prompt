// Phase 6 — OTC × prescribed-medication interaction table.
//
// Curated by clinical importance × community-pharmacy frequency.
// Each entry describes an OTC product category that interacts with a
// prescribed drug class. Returns a list of hits for a given patient
// context; the engine turns each hit into an `otc_interaction` rec.
//
// Sources cited inline on each entry:
//   - BNF, NICE, AMH, MIMS, Stockley (pharmacological mechanism)
//   - iatroX Pharmacy First 2026 (community frequency + Pharmacy First
//     eligibility for some entries)
//
// The table is intentionally explicit (not learned): every row is a
// pharmacist-reviewed clinical fact, not an inference.

import type { PatientCtx } from "./engine-types";
import type { SeverityTier, EvidenceLevel, RuleSource, Alternative } from "./rationale";

export type OtcInteractionHit = {
  id: string;
  title: string;
  otc_name: string; // e.g. "NSAIDs (ibuprofen, naproxen, diclofenac)"
  trigger_drug_class: string; // e.g. "anticoagulant"
  mechanism: "pharmacodynamic" | "pharmacokinetic" | "clinical" | "regulatory";
  mechanism_detail: string;
  severity: SeverityTier;
  evidence: EvidenceLevel;
  source: RuleSource;
  onset: "immediate" | "hours" | "days" | "weeks";
  advice: string;
  safety_net: string;
  pharmacist_checks: string[];
  avoid_ingredients: string[];
  alternatives: Alternative[];
};

type OtcRow = {
  id: string;
  title: string;
  matchOtc: string;
  trigger_drug_class_label: string;
  matchDrugClasses: string[];
  mechanism: "pharmacodynamic" | "pharmacokinetic" | "clinical" | "regulatory";
  mechanism_detail: string;
  severity: SeverityTier;
  evidence: EvidenceLevel;
  source: RuleSource;
  onset: OtcInteractionHit["onset"];
  advice: string;
  safety_net: string;
  pharmacist_checks: string[];
  avoid_ingredients: string[];
  alternatives: Alternative[];
};

const OTC_INTERACTIONS: OtcRow[] = [
  // ---- NSAID interactions -------------------------------------------------
  {
    id: "nsaid_anticoagulant",
    title: "NSAIDs + oral anticoagulant — major bleeding risk",
    matchOtc: "NSAIDs (ibuprofen, naproxen, diclofenac, aspirin >100mg)",
    trigger_drug_class_label: "anticoagulant (warfarin, apixaban, rivaroxaban, dabigatran)",
    matchDrugClasses: ["anticoagulant"],
    mechanism: "pharmacodynamic",
    mechanism_detail:
      "Additive antiplatelet + gastric mucosal injury. Bleeding risk ~2-3x baseline, especially GI and intracranial.",
    severity: "major",
    evidence: "high",
    source: "BNF",
    onset: "days",
    advice:
      "Avoid all systemic NSAIDs. Suggest paracetamol 500mg-1g q6h PRN (max 4g/day) as first-line analgesic.",
    safety_net:
      "Stop NSAID immediately and seek medical review if black stools, haematemesis, easy bruising, or severe headache.",
    pharmacist_checks: [
      "Confirm anticoagulant name and dose",
      "Ask about any recent bleeding or bruising",
      "Screen for additional bleeding risks (other antiplatelets, SSRIs)",
    ],
    avoid_ingredients: ["ibuprofen", "naproxen", "diclofenac", "aspirin", "ketoprofen", "mefenamic acid"],
    alternatives: [
      {
        product_name: "Paracetamol 500mg-1g",
        rationale: "No anticoagulant interaction. First-line for mild-moderate pain in anticoagulated patients.",
      },
      {
        product_name: "Topical ibuprofen gel (low systemic absorption)",
        rationale: "Topical NSAIDs have minimal systemic absorption; consider for localised joint/muscle pain.",
      },
    ],
  },
  {
    id: "nsaid_antiplatelet",
    title: "NSAIDs + antiplatelet (aspirin/clopidogrel) — bleeding risk",
    matchOtc: "NSAIDs (ibuprofen, naproxen, diclofenac)",
    trigger_drug_class_label: "antiplatelet (aspirin, clopidogrel, ticagrelor)",
    matchDrugClasses: ["antiplatelet"],
    mechanism: "pharmacodynamic",
    mechanism_detail:
      "Additive antiplatelet effect + gastric mucosal damage. Increased GI bleeding risk; ibuprofen can also interfere with the antiplatelet effect of low-dose aspirin.",
    severity: "moderate",
    evidence: "high",
    source: "BNF",
    onset: "days",
    advice:
      "Avoid if possible. If short-term NSAID needed, use lowest effective dose for shortest time; separate from low-dose aspirin by ≥2 hours.",
    safety_net: "Stop NSAID and seek review if black stools, haematemesis, or new bruising.",
    pharmacist_checks: [
      "Confirm antiplatelet name and indication",
      "Ask about GI symptoms",
      "Consider PPI cover if NSAID unavoidable",
    ],
    avoid_ingredients: ["ibuprofen", "naproxen", "diclofenac"],
    alternatives: [
      { product_name: "Paracetamol 500mg-1g q6h", rationale: "No antiplatelet interaction." },
    ],
  },
  {
    id: "nsaid_ace_diuretic",
    title: "Triple whammy — ACEi/ARB + diuretic + NSAID (AKI risk)",
    matchOtc: "NSAIDs (ibuprofen, naproxen, diclofenac)",
    trigger_drug_class_label: "concurrent ACEi/ARB + diuretic",
    matchDrugClasses: ["ace_inhibitor", "arb", "diuretic"],
    mechanism: "pharmacodynamic",
    mechanism_detail:
      "NSAIDs inhibit afferent arteriolar vasodilation (prostaglandin-mediated), reducing GFR. Combined with RAAS inhibition and diuretic-induced volume depletion, this precipitates AKI. Risk highest in elderly, CKD, dehydration.",
    severity: "major",
    evidence: "high",
    source: "NICE_Guideline",
    onset: "days",
    advice:
      "Avoid systemic NSAIDs. Suggest paracetamol first-line. If NSAID unavoidable, ensure adequate hydration and limit to ≤3 days; flag to GP.",
    safety_net:
      "Stop NSAID and seek GP review if reduced urine output, new peripheral oedema, fatigue, or nausea.",
    pharmacist_checks: [
      "Confirm all three drug classes present (ACEi/ARB, diuretic, considering NSAID)",
      "Ask about renal function if known",
      "Screen for dehydration risk (vomiting, diarrhoea, hot weather)",
    ],
    avoid_ingredients: ["ibuprofen", "naproxen", "diclofenac"],
    alternatives: [
      { product_name: "Paracetamol 500mg-1g q6h", rationale: "No renal interaction. First-line for this combination." },
      { product_name: "Topical diclofenac gel", rationale: "Low systemic absorption; safer than oral NSAID for short-term use." },
    ],
  },
  {
    id: "nsaid_ssri",
    title: "NSAID + SSRI/SNRI — bleeding risk",
    matchOtc: "NSAIDs (ibuprofen, naproxen, diclofenac)",
    trigger_drug_class_label: "SSRI/SNRI (sertraline, escitalopram, venlafaxine, etc.)",
    matchDrugClasses: ["ssri", "snri"],
    mechanism: "pharmacodynamic",
    mechanism_detail:
      "SSRIs/SNRIs impair platelet serotonin uptake → mild platelet dysfunction. Combined with NSAID antiplatelet effect → additive GI bleeding risk (~60% increased upper GI bleed).",
    severity: "moderate",
    evidence: "high",
    source: "Stockley",
    onset: "days",
    advice:
      "Use paracetamol first-line. If NSAID required, use lowest dose for shortest time; consider PPI cover for >3 days use.",
    safety_net: "Stop NSAID if black stools, haematemesis, or unusual bruising.",
    pharmacist_checks: [
      "Confirm SSRI/SNRI name and duration",
      "Ask about GI history (ulcer, reflux)",
      "Screen for additional bleeding risks (anticoagulants, alcohol)",
    ],
    avoid_ingredients: ["ibuprofen", "naproxen", "diclofenac"],
    alternatives: [
      { product_name: "Paracetamol 500mg-1g q6h", rationale: "No SSRI/SNRI interaction." },
    ],
  },
  {
    id: "nsaid_lithium",
    title: "NSAID + lithium — lithium toxicity risk",
    matchOtc: "NSAIDs (ibuprofen, naproxen, diclofenac)",
    trigger_drug_class_label: "lithium",
    matchDrugClasses: ["mood_stabiliser"],
    mechanism: "pharmacokinetic",
    mechanism_detail:
      "NSAIDs reduce renal prostaglandin synthesis → decreased renal lithium clearance → lithium levels rise 25-60% within 3-7 days. Toxicity (tremor, confusion, renal impairment) can be severe.",
    severity: "major",
    evidence: "high",
    source: "BNF",
    onset: "days",
    advice:
      "Avoid if possible. If NSAID unavoidable, suggest patient contact GP for lithium level check within 1 week. Paracetamol preferred.",
    safety_net: "Stop NSAID and seek urgent review if tremor, confusion, nausea/vomiting, or unsteady gait.",
    pharmacist_checks: [
      "Confirm lithium dose and last level",
      "Advise GP review of lithium level within 1 week if NSAID used",
    ],
    avoid_ingredients: ["ibuprofen", "naproxen", "diclofenac"],
    alternatives: [
      { product_name: "Paracetamol 500mg-1g q6h", rationale: "No interaction with lithium." },
    ],
  },
  {
    id: "nsaid_methotrexate_high",
    title: "NSAID + high-dose methotrexate — toxicity risk",
    matchOtc: "NSAIDs (ibuprofen, naproxen, diclofenac)",
    trigger_drug_class_label: "methotrexate (oncology dose)",
    matchDrugClasses: ["immunosuppressant"],
    mechanism: "pharmacokinetic",
    mechanism_detail:
      "NSAIDs reduce renal MTX clearance → accumulation. At low (rheumatology) doses this is usually clinically insignificant; at high (oncology) doses, can be life-threatening pancytopenia.",
    severity: "major",
    evidence: "high",
    source: "Stockley",
    onset: "days",
    advice: "Avoid. Refer to treating team. Paracetamol for symptomatic relief.",
    safety_net: "Stop NSAID and seek urgent review if mouth ulcers, fever, bruising, or new fatigue.",
    pharmacist_checks: [
      "Confirm methotrexate dose and indication (rheumatology vs oncology)",
      "Refer any uncertainty to prescriber",
    ],
    avoid_ingredients: ["ibuprofen", "naproxen", "diclofenac"],
    alternatives: [
      { product_name: "Paracetamol 500mg-1g q6h", rationale: "Safe in MTX-treated patients at any dose." },
    ],
  },
  // ---- St John's Wort (catalogue product; important) --------------------
  {
    id: "sjw_ssri",
    title: "St John's Wort + SSRI/SNRI — serotonin syndrome risk",
    matchOtc: "St John's Wort (Hypericum perforatum)",
    trigger_drug_class_label: "SSRI/SNRI/MAOI",
    matchDrugClasses: ["ssri", "snri", "tca", "maoi"],
    mechanism: "pharmacodynamic",
    mechanism_detail:
      "St John's Wort is a serotonin reuptake inhibitor + MAOI. Combined with serotonergic antidepressants → serotonin syndrome (agitation, tremor, hyperthermia, neuromuscular hyperactivity).",
    severity: "contraindicated",
    evidence: "high",
    source: "Stockley",
    onset: "days",
    advice:
      "Do NOT recommend. Refer to GP. If patient self-selecting St John's Wort for low mood, flag interaction and advise review of antidepressant therapy with prescriber.",
    safety_net: "Stop St John's Wort and seek urgent review if agitation, tremor, hyperthermia, or confusion.",
    pharmacist_checks: [
      "Screen for ALL serotonergic medications (SSRIs, SNRIs, TCAs, MAOIs, tramadol, linezolid)",
    ],
    avoid_ingredients: ["st john's wort", "hypericum perforatum", "hypericin"],
    alternatives: [
      { product_name: "Refer to GP for non-pharmacological or alternative management", rationale: "No safe OTC alternative for moderate-severe depression." },
    ],
  },
  {
    id: "sjw_ocp",
    title: "St John's Wort reduces OCP efficacy",
    matchOtc: "St John's Wort (Hypericum perforatum)",
    trigger_drug_class_label: "combined oral contraceptive (ethinylestradiol-containing)",
    matchDrugClasses: ["contraceptive"],
    mechanism: "pharmacokinetic",
    mechanism_detail:
      "St John's Wort is a potent CYP3A4 inducer. Reduces ethinylestradiol and progestogen levels → contraceptive failure, unwanted pregnancy, breakthrough bleeding.",
    severity: "major",
    evidence: "high",
    source: "Stockley",
    onset: "weeks",
    advice:
      "Do NOT recommend. If patient is taking OCP and wants St John's Wort, advise alternative therapy and barrier contraception during the transition (4 weeks washout).",
    safety_net: "Use barrier contraception; consider emergency contraception if breakthrough sex during overlap.",
    pharmacist_checks: [
      "Confirm type of contraception (combined OCP most at risk; POP, implant, IUD less so)",
      "Advise GP review",
    ],
    avoid_ingredients: ["st john's wort", "hypericum perforatum"],
    alternatives: [
      { product_name: "Refer to GP for alternative mood support", rationale: "No safe interaction with hormonal contraception." },
    ],
  },
  {
    id: "sjw_anticoagulant",
    title: "St John's Wort reduces anticoagulant/antiplatelet efficacy",
    matchOtc: "St John's Wort (Hypericum perforatum)",
    trigger_drug_class_label: "anticoagulant, antiplatelet, statin, digoxin, immunosuppressant, anticonvulsant",
    matchDrugClasses: ["anticoagulant", "antiplatelet", "statin", "digoxin", "immunosuppressant", "antiepileptic"],
    mechanism: "pharmacokinetic",
    mechanism_detail:
      "Potent CYP3A4 and P-gp induction reduces plasma levels of many critical drugs: warfarin (INR falls), apixaban/rivaroxaban, clopidogrel, statins, digoxin, tacrolimus, cyclosporin, phenytoin, carbamazepine.",
    severity: "major",
    evidence: "high",
    source: "BNF",
    onset: "weeks",
    advice:
      "Do NOT recommend. If patient self-selecting, flag to GP — these are drugs where sub-therapeutic levels cause life-threatening events (clot rejection, transplant rejection, arrhythmia).",
    safety_net: "Stop St John's Wort; INR or drug level check within 1-2 weeks as directed by GP.",
    pharmacist_checks: [
      "Screen for ALL narrow-therapeutic-index drugs",
    ],
    avoid_ingredients: ["st john's wort", "hypericum perforatum"],
    alternatives: [
      { product_name: "Refer to GP for non-inducing alternatives", rationale: "Avoids the interaction entirely." },
    ],
  },
  // ---- Decongestants ------------------------------------------------------
  {
    id: "decongestant_maoi",
    title: "Decongestant (pseudoephedrine/phenylephrine) + MAOI — hypertensive crisis",
    matchOtc: "Oral decongestants (pseudoephedrine, phenylephrine)",
    trigger_drug_class_label: "MAOI antidepressant",
    matchDrugClasses: ["maoi"],
    mechanism: "pharmacodynamic",
    mechanism_detail:
      "Indirect sympathomimetics release stored noradrenaline. MAOIs prevent noradrenaline breakdown → massive pressor response → severe hypertension, stroke, death.",
    severity: "contraindicated",
    evidence: "high",
    source: "Stockley",
    onset: "immediate",
    advice:
      "Do NOT recommend. Also contraindicated for 14 days after stopping MAOI. Suggest saline nasal spray, steam inhalation, or referral.",
    safety_net: "Severe headache, palpitations, sweating, or BP elevation — ED immediately.",
    pharmacist_checks: [
      "Confirm no MAOI use in last 14 days",
      "Screen for MAOI in other products (selegiline patches)",
    ],
    avoid_ingredients: ["pseudoephedrine", "phenylephrine"],
    alternatives: [
      { product_name: "Saline nasal spray", rationale: "No systemic sympathomimetic effect." },
      { product_name: "Menthol steam inhalation", rationale: "Symptomatic relief without drug interaction." },
    ],
  },
  {
    id: "decongestant_bph",
    title: "Decongestant in benign prostatic hyperplasia — urinary retention",
    matchOtc: "Oral decongestants (pseudoephedrine, phenylephrine)",
    trigger_drug_class_label: "BPH (or other bladder outflow obstruction)",
    matchDrugClasses: ["urology", "anticholinergic"],
    mechanism: "pharmacodynamic",
    mechanism_detail:
      "α-adrenergic stimulation of the bladder neck → contraction → worsening outflow obstruction → acute urinary retention, especially in elderly men with BPH.",
    severity: "moderate",
    evidence: "high",
    source: "Beers_2023",
    onset: "hours",
    advice:
      "Avoid in men with known BPH. Saline nasal spray or topical decongestant (xylometazoline) preferred for short courses (≤3 days).",
    safety_net: "Stop decongestant and seek urgent review if unable to pass urine, bladder pain, or abdominal distension.",
    pharmacist_checks: [
      "Ask about prostate symptoms in men >50",
      "Screen for concurrent anticholinergics (additive retention risk)",
    ],
    avoid_ingredients: ["pseudoephedrine", "phenylephrine"],
    alternatives: [
      { product_name: "Saline nasal spray", rationale: "Topical, no systemic effect." },
      { product_name: "Xylometazoline nasal spray (≤3 days)", rationale: "Topical, low systemic absorption." },
    ],
  },
  // ---- Minerals / supplements ---------------------------------------------
  {
    id: "calcium_levothyroxine",
    title: "Calcium/iron supplementation + levothyroxine — reduced absorption",
    matchOtc: "Calcium, iron, magnesium, zinc supplements",
    trigger_drug_class_label: "levothyroxine",
    matchDrugClasses: ["thyroid"],
    mechanism: "pharmacokinetic",
    mechanism_detail:
      "Divalent/trivalent cations chelate levothyroxine in the gut → reduced absorption (up to 30%). Sub-therapeutic TSH if taken together.",
    severity: "moderate",
    evidence: "high",
    source: "BNF",
    onset: "hours",
    advice:
      "Separate by ≥4 hours. Take levothyroxine first thing morning, fasted, with plain water; minerals mid-afternoon or evening.",
    safety_net:
      "If patient has been combining, recommend GP check TSH in 6-8 weeks to ensure euthyroid.",
    pharmacist_checks: [
      "Confirm timing of levothyroxine and supplement doses",
      "Check if taking other PPIs/calcium-containing antacids",
    ],
    avoid_ingredients: ["calcium", "iron", "magnesium", "zinc"],
    alternatives: [
      { product_name: "Take supplement at lunch or evening (≥4h after levothyroxine)", rationale: "Preserves both therapies." },
    ],
  },
  {
    id: "calcium_quinolone",
    title: "Calcium/magnesium/iron + quinolone — reduced antibiotic absorption",
    matchOtc: "Calcium, magnesium, iron, zinc, antacids",
    trigger_drug_class_label: "quinolone antibiotic (ciprofloxacin, norfloxacin)",
    matchDrugClasses: ["quinolone"],
    mechanism: "pharmacokinetic",
    mechanism_detail:
      "Cations form insoluble chelates with quinolones in the gut → absorption reduced by up to 90%. Treatment failure.",
    severity: "major",
    evidence: "high",
    source: "BNF",
    onset: "hours",
    advice:
      "Separate by 2 hours before or 6 hours after the quinolone. Pause the mineral supplement for the antibiotic course if clinically appropriate.",
    safety_net: "Re-consult if infection is not improving after 48 hours of antibiotics.",
    pharmacist_checks: [
      "Confirm quinolone name, dose, and timing",
      "List all mineral supplements and antacids the patient takes",
    ],
    avoid_ingredients: ["calcium", "magnesium", "iron", "zinc", "aluminium", "magnesium hydroxide"],
    alternatives: [
      { product_name: "Resume mineral supplement after antibiotic course ends", rationale: "Eliminates the interaction window." },
    ],
  },
  {
    id: "calcium_tetracycline",
    title: "Calcium/iron + tetracycline — reduced antibiotic absorption",
    matchOtc: "Calcium, magnesium, iron, zinc, antacids, dairy",
    trigger_drug_class_label: "tetracycline (doxycycline, minocycline)",
    matchDrugClasses: ["tetracycline"],
    mechanism: "pharmacokinetic",
    mechanism_detail:
      "Same chelation mechanism as quinolones. Calcium in particular (including from dairy) reduces doxycycline absorption significantly.",
    severity: "moderate",
    evidence: "high",
    source: "BNF",
    onset: "hours",
    advice:
      "Separate by 2-4 hours. Pause the supplement during the antibiotic course.",
    safety_net: "Re-consult if infection not improving after 48 hours.",
    pharmacist_checks: [
      "Confirm tetracycline and timing",
      "Screen for dairy and antacid use near dose",
    ],
    avoid_ingredients: ["calcium", "magnesium", "iron", "zinc", "dairy"],
    alternatives: [
      { product_name: "Take tetracycline 1 hour before or 2 hours after any dairy/supplement", rationale: "Preserves efficacy." },
    ],
  },
  {
    id: "calcium_bisphosphonate",
    title: "Calcium/iron + bisphosphonate — reduced absorption",
    matchOtc: "Calcium, iron, magnesium, antacids",
    trigger_drug_class_label: "bisphosphonate (alendronate, risedronate)",
    matchDrugClasses: ["bisphosphonate"],
    mechanism: "pharmacokinetic",
    mechanism_detail:
      "Cations bind bisphosphonate in the gut → absorption reduced by 60-90% if taken within 30 min.",
    severity: "moderate",
    evidence: "high",
    source: "AMH",
    onset: "hours",
    advice:
      "Bisphosphonate must be taken first thing morning, upright, with plain water, ≥30 min before food/drink/supplements. Schedule minerals for evening.",
    safety_net: "If patient has been combining, recommend GP review; DEXA may need repeating.",
    pharmacist_checks: [
      "Confirm bisphosphonate dosing routine",
      "Screen for any calcium-containing antacids taken in morning",
    ],
    avoid_ingredients: ["calcium", "iron", "magnesium", "aluminium"],
    alternatives: [
      { product_name: "Move mineral supplement to evening (>2h after bisphosphonate)", rationale: "Preserves both therapies." },
    ],
  },
  // ---- Antacids / PPIs ----------------------------------------------------
  {
    id: "antacid_iron",
    title: "Antacid + iron — reduced iron absorption",
    matchOtc: "Antacids (aluminium, magnesium, calcium carbonate)",
    trigger_drug_class_label: "iron supplementation",
    matchDrugClasses: ["mineral"],
    mechanism: "pharmacokinetic",
    mechanism_detail:
      "Antacids raise gastric pH and chelate iron → iron absorption reduced by 30-50%.",
    severity: "moderate",
    evidence: "high",
    source: "BNF",
    onset: "hours",
    advice:
      "Separate antacid and iron by ≥2 hours. Take iron on empty stomach with vitamin C if tolerated.",
    safety_net: "If iron deficiency anaemia not improving, review timing of doses.",
    pharmacist_checks: [
      "Screen for OTC antacids and prescribed PPIs/H2 antagonists",
    ],
    avoid_ingredients: ["aluminium hydroxide", "magnesium hydroxide", "calcium carbonate"],
    alternatives: [
      { product_name: "Iron taken morning fasted, antacids at bedtime", rationale: "Maximises absorption." },
    ],
  },
  // ---- CNS / anticholinergic ---------------------------------------------
  {
    id: "antihistamine_elderly",
    title: "Sedating antihistamine in elderly — falls/cognition risk",
    matchOtc: "First-generation sedating antihistamines (diphenhydramine, doxylamine, promethazine)",
    trigger_drug_class_label: "elderly patient (≥65) or on other anticholinergics",
    matchDrugClasses: ["anticholinergic"],
    mechanism: "pharmacodynamic",
    mechanism_detail:
      "Sedating antihistamines have significant anticholinergic burden (ACB 3 for diphenhydramine). Contribute to falls, confusion, urinary retention, dry mouth. Listed on Beers 2023 PIM list.",
    severity: "moderate",
    evidence: "high",
    source: "Beers_2023",
    onset: "hours",
    advice:
      "Avoid in elderly. Use a non-sedating antihistamine (loratadine, cetirizine, fexofenadine) instead.",
    safety_net: "Stop and seek review if daytime sedation, confusion, falls, or urinary retention.",
    pharmacist_checks: [
      "Age and falls history",
      "Other anticholinergic burden (TCAs, oxybutynin, etc.)",
    ],
    avoid_ingredients: ["diphenhydramine", "doxylamine", "promethazine", "chlorpheniramine"],
    alternatives: [
      { product_name: "Loratadine 10mg daily", rationale: "Non-sedating, no anticholinergic burden." },
      { product_name: "Cetirizine 10mg daily", rationale: "Non-sedating; mild sedation possible but ACB 0." },
    ],
  },
];

export function checkOtcInteractions(
  ctx: PatientCtx,
  factors: string[],
): OtcInteractionHit[] {
  // drug_class can be a comma/plus separated list, e.g. "anticoagulant+antiplatelet"
  const classesArr = ctx.confirmed_medications
    .flatMap((m) => (m.drug_class ?? "").toLowerCase().split(/[+,/]/))
    .map((s) => s.trim())
    .filter(Boolean);
  const classes = new Set(classesArr);

  const hits: OtcInteractionHit[] = [];
  for (const row of OTC_INTERACTIONS) {
    let matched = false;
    for (const dc of row.matchDrugClasses) {
      if (
        classes.has(dc) ||
        Array.from(classes).some((c) => c.includes(dc) || dc.includes(c))
      ) {
        matched = true;
        break;
      }
    }
    if (!matched) continue;
    hits.push({
      id: row.id,
      title: row.title,
      otc_name: row.matchOtc,
      trigger_drug_class: row.trigger_drug_class_label,
      mechanism: row.mechanism,
      mechanism_detail: row.mechanism_detail,
      severity: row.severity,
      evidence: row.evidence,
      source: row.source,
      onset: row.onset,
      advice: row.advice,
      safety_net: row.safety_net,
      pharmacist_checks: row.pharmacist_checks,
      avoid_ingredients: row.avoid_ingredients,
      alternatives: row.alternatives,
    });
  }
  // Triple-whammy special case: ACEi/ARB + diuretic + NSAID-considering.
  // The main-loop match is too broad (matches on ACEi+diuretic alone), so we
  // remove any incidental hit and only re-add it when pain symptoms (or
  // an explicit "considering NSAID" signal) is present.
  const onRAAS = Array.from(classes).some(
    (c) => c.includes("ace_inhibitor") || c.includes("arb"),
  );
  const onDiuretic = classes.has("diuretic");
  const symptomsSuggestNsaid =
    /(pain|back|joint|headache|ache|ibuprofen|naproxen|diclofenac|anti[- ]?inflam|nsaid|aspirin)/i.test(
      ctx.symptoms + " " + ctx.counselling_goal,
    );
  if (onRAAS && onDiuretic) {
    // Drop any incidental match from the main loop.
    const incidentalIdx = hits.findIndex((h) => h.id === "nsaid_ace_diuretic");
    if (incidentalIdx >= 0) hits.splice(incidentalIdx, 1);
    if (symptomsSuggestNsaid) {
      const row = OTC_INTERACTIONS.find((r) => r.id === "nsaid_ace_diuretic");
      if (row) {
        hits.push({
          id: row.id,
          title: row.title,
          otc_name: row.matchOtc,
          trigger_drug_class: row.trigger_drug_class_label,
          mechanism: row.mechanism,
          mechanism_detail: row.mechanism_detail,
          severity: row.severity,
          evidence: row.evidence,
          source: row.source,
          onset: row.onset,
          advice: row.advice,
          safety_net: row.safety_net,
          pharmacist_checks: row.pharmacist_checks,
          avoid_ingredients: row.avoid_ingredients,
          alternatives: row.alternatives,
        });
      }
    }
  }

  // Antihistamine_elderly: also fire when patient is elderly (factor
  // "elderly" or age >= 65) even with no concurrent anticholinergic
  // medication — this is a Beers 2023 PIM list screening.
  const isElderly = factors.includes("elderly") || (ctx.age ?? 0) >= 65;
  if (isElderly && !hits.some((h) => h.id === "antihistamine_elderly")) {
    const row = OTC_INTERACTIONS.find((r) => r.id === "antihistamine_elderly");
    if (row) {
      hits.push({
        id: row.id,
        title: row.title,
        otc_name: row.matchOtc,
        trigger_drug_class: row.trigger_drug_class_label,
        mechanism: row.mechanism,
        mechanism_detail: row.mechanism_detail,
        severity: row.severity,
        evidence: row.evidence,
        source: row.source,
        onset: row.onset,
        advice: row.advice,
        safety_net: row.safety_net,
        pharmacist_checks: row.pharmacist_checks,
        avoid_ingredients: row.avoid_ingredients,
        alternatives: row.alternatives,
      });
    }
  }
  return hits;
}
