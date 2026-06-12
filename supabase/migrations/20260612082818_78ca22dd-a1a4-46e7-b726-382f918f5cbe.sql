
-- ============================================================
-- PHARMAPROMPT OS — PHASE 1 SCHEMA
-- ============================================================

-- ---------- patient_cases ----------
CREATE TABLE public.patient_cases (
  case_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  case_label TEXT,
  age INT,
  sex TEXT,
  pregnancy_status TEXT,
  breastfeeding_status TEXT,
  medication_text TEXT,
  confirmed_medications JSONB DEFAULT '[]'::jsonb,
  medical_history TEXT,
  allergies TEXT,
  existing_supplements TEXT,
  symptoms TEXT,
  pathology_notes TEXT,
  counselling_goal TEXT,
  pharmacist_notes TEXT,
  parsed_medications JSONB DEFAULT '[]'::jsonb,
  detected_patient_factors JSONB DEFAULT '[]'::jsonb,
  detected_drug_classes JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.patient_cases TO authenticated;
GRANT ALL ON public.patient_cases TO service_role;
ALTER TABLE public.patient_cases ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own cases" ON public.patient_cases
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX patient_cases_user_id_idx ON public.patient_cases(user_id, created_at DESC);

-- ---------- recommendations ----------
CREATE TABLE public.recommendations (
  recommendation_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID NOT NULL REFERENCES public.patient_cases(case_id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  recommendation_type TEXT NOT NULL,
  title TEXT NOT NULL,
  product_id TEXT,
  product_name TEXT,
  brand TEXT,
  confidence TEXT NOT NULL DEFAULT 'Medium',
  score INT NOT NULL DEFAULT 0,
  rank INT NOT NULL DEFAULT 0,
  why_triggered TEXT,
  matched_medicines JSONB DEFAULT '[]'::jsonb,
  matched_patient_factors JSONB DEFAULT '[]'::jsonb,
  matched_product_tags JSONB DEFAULT '[]'::jsonb,
  pharmacist_checks JSONB DEFAULT '[]'::jsonb,
  talking_points JSONB DEFAULT '[]'::jsonb,
  safety_cautions JSONB DEFAULT '[]'::jsonb,
  interaction_notes JSONB DEFAULT '[]'::jsonb,
  source_references JSONB DEFAULT '[]'::jsonb,
  review_status TEXT DEFAULT 'pending',
  sense_check_status TEXT DEFAULT 'not_run',
  ai_reviewer_notes JSONB DEFAULT '[]'::jsonb,
  feedback_status TEXT,
  deferred BOOLEAN NOT NULL DEFAULT false,
  hidden BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.recommendations TO authenticated;
GRANT ALL ON public.recommendations TO service_role;
ALTER TABLE public.recommendations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own recommendations" ON public.recommendations
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX recommendations_case_idx ON public.recommendations(case_id, rank);

-- ---------- pharmacist_feedback ----------
CREATE TABLE public.pharmacist_feedback (
  feedback_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID NOT NULL REFERENCES public.patient_cases(case_id) ON DELETE CASCADE,
  recommendation_id UUID REFERENCES public.recommendations(recommendation_id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pharmacist_feedback TO authenticated;
GRANT ALL ON public.pharmacist_feedback TO service_role;
ALTER TABLE public.pharmacist_feedback ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own feedback" ON public.pharmacist_feedback
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ---------- safety_rules ----------
CREATE TABLE public.safety_rules (
  rule_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  trigger_keywords TEXT[] DEFAULT '{}',
  trigger_drug_classes TEXT[] DEFAULT '{}',
  trigger_patient_factors TEXT[] DEFAULT '{}',
  match_product_tags TEXT[] DEFAULT '{}',
  avoid_product_keywords TEXT[] DEFAULT '{}',
  severity TEXT NOT NULL,
  recommendation_type TEXT NOT NULL,
  pharmacist_message TEXT NOT NULL,
  pharmacist_checks JSONB DEFAULT '[]'::jsonb,
  review_required BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.safety_rules TO authenticated;
GRANT ALL ON public.safety_rules TO service_role;
ALTER TABLE public.safety_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated read safety rules" ON public.safety_rules
  FOR SELECT TO authenticated USING (true);

-- ---------- medication_dictionary ----------
CREATE TABLE public.medication_dictionary (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  generic_name TEXT NOT NULL UNIQUE,
  brand_names TEXT[] DEFAULT '{}',
  drug_class TEXT,
  atc_hint TEXT,
  aliases TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.medication_dictionary TO authenticated;
GRANT ALL ON public.medication_dictionary TO service_role;
ALTER TABLE public.medication_dictionary ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated read medication dictionary" ON public.medication_dictionary
  FOR SELECT TO authenticated USING (true);

-- Update trigger
CREATE OR REPLACE FUNCTION public.set_updated_at() RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql SET search_path = public;
CREATE TRIGGER patient_cases_updated_at BEFORE UPDATE ON public.patient_cases
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================
-- SEED: safety_rules
-- ============================================================
INSERT INTO public.safety_rules (rule_id, name, description, trigger_drug_classes, trigger_patient_factors, avoid_product_keywords, severity, recommendation_type, pharmacist_message, pharmacist_checks, review_required) VALUES
('bleeding_risk_anticoagulant', 'Bleeding risk with anticoagulants/antiplatelets',
 'Supplements with antiplatelet or anticoagulant activity (fish oil, omega-3, turmeric/curcumin, ginkgo, garlic, high-dose vitamin E, cranberry) may increase bleeding risk when combined with anticoagulants or antiplatelets.',
 ARRAY['anticoagulant','antiplatelet'], ARRAY['bleeding_risk'],
 ARRAY['fish oil','omega','omega-3','omega 3','turmeric','curcumin','ginkgo','garlic','vitamin e','cranberry'],
 'High','safety_caution',
 'Patient is on an anticoagulant or antiplatelet. Avoid suggesting supplements that may increase bleeding risk without prescriber input.',
 '["Confirm current anticoagulant/antiplatelet and dose","Ask about recent bleeding, bruising or upcoming procedures","Consider referral to GP before any new supplement"]'::jsonb, true),

('mineral_timing_thyroxine', 'Mineral timing — thyroxine',
 'Calcium, magnesium, iron and zinc reduce levothyroxine absorption if taken at the same time.',
 ARRAY['thyroid'], ARRAY['mineral_timing_risk'], ARRAY[]::text[],
 'Medium','administration',
 'If a mineral is being considered or taken, separate from levothyroxine by at least 4 hours — verify the exact interval for this combination.',
 '["Confirm levothyroxine dose timing (usually morning, fasted)","Ask which minerals/supplements are taken and when","Counsel: levothyroxine first, mineral several hours later"]'::jsonb, true),

('mineral_timing_quinolone', 'Mineral timing — quinolones',
 'Calcium, magnesium, iron, zinc and antacids chelate quinolones and reduce absorption.',
 ARRAY['quinolone'], ARRAY['mineral_timing_risk'], ARRAY[]::text[],
 'Medium','administration',
 'Separate any mineral or mineral-containing supplement from the quinolone by 2 hours before or 6 hours after — verify for the specific agent.',
 '["Confirm quinolone, dose and duration","List all mineral-containing products (including multivitamins, antacids)","Counsel timing"]'::jsonb, true),

('mineral_timing_tetracycline', 'Mineral timing — tetracyclines',
 'Calcium, magnesium, iron, zinc and dairy reduce absorption of tetracyclines.',
 ARRAY['tetracycline'], ARRAY['mineral_timing_risk'], ARRAY[]::text[],
 'Medium','administration',
 'Separate any mineral or dairy from the tetracycline by 2–4 hours — verify the exact interval for the specific agent.',
 '["Confirm tetracycline and dose","List mineral supplements and dairy intake","Counsel timing"]'::jsonb, true),

('mineral_timing_bisphosphonate', 'Mineral timing — bisphosphonates',
 'Bisphosphonates require an empty stomach with plain water; minerals and food markedly reduce absorption.',
 ARRAY['bisphosphonate'], ARRAY['mineral_timing_risk'], ARRAY[]::text[],
 'High','administration',
 'Bisphosphonate must be taken first thing in the morning with plain water only, sitting upright for 30–60 minutes; minerals taken at least 30–60 minutes later.',
 '["Confirm bisphosphonate dosing routine","Confirm minerals are taken at a different time","Reinforce upright posture and plain water"]'::jsonb, true),

('pregnancy_caution', 'Pregnancy — pharmacist review required',
 'Most general supplements are not routinely recommended in pregnancy without prescriber input.',
 ARRAY[]::text[], ARRAY['pregnancy'], ARRAY[]::text[],
 'High','review_required',
 'Patient is pregnant or pregnancy status is unsure. Defer product suggestions; confirm clinical suitability with the prescriber.',
 '["Confirm pregnancy status and trimester","Check current antenatal regimen","Refer to GP/obstetrician where appropriate"]'::jsonb, true),

('breastfeeding_caution', 'Breastfeeding — pharmacist review required',
 'Many supplements lack adequate breastfeeding safety data.',
 ARRAY[]::text[], ARRAY['breastfeeding'], ARRAY[]::text[],
 'Medium','review_required',
 'Patient is breastfeeding or status is unsure. Defer routine product suggestions; check suitability per source.',
 '["Confirm breastfeeding status and infant age","Check each item against a breastfeeding reference","Counsel maternal observation"]'::jsonb, true),

('renal_mineral_caution', 'Renal disease — minerals require review',
 'Magnesium, potassium, calcium and high-dose vitamin D may accumulate or interact in renal impairment.',
 ARRAY[]::text[], ARRAY['renal_disease'], ARRAY[]::text[],
 'High','review_required',
 'Patient has renal impairment. Defer mineral or vitamin D suggestions until renal function and electrolytes are reviewed.',
 '["Confirm eGFR / recent renal function","Check current electrolytes","Refer to GP if uncertain"]'::jsonb, true),

('duplication_caution', 'Duplicate ingredient',
 'Patient already takes the same ingredient — duplication risk.',
 ARRAY[]::text[], ARRAY['existing_supplement_duplication'], ARRAY[]::text[],
 'Medium','safety_caution',
 'This ingredient appears to already be in the patient''s current supplements. Confirm before suggesting another product.',
 '["Confirm current supplement regimen","Check total daily dose across products","Discuss whether to consolidate"]'::jsonb, true),

('allergy_check', 'Allergy check',
 'Always cross-check product ingredients against patient-reported allergies.',
 ARRAY[]::text[], ARRAY['allergy_risk'], ARRAY[]::text[],
 'Medium','administration',
 'Cross-check ingredients against the patient''s allergy list before recommending.',
 '["Confirm specific allergens and reaction history","Check excipients as well as actives"]'::jsonb, false),

('polypharmacy_awareness', 'Polypharmacy awareness',
 'Patient is on 5 or more medicines — interaction and adherence risk is elevated.',
 ARRAY[]::text[], ARRAY['polypharmacy'], ARRAY[]::text[],
 'Low','counselling_prompt',
 'Polypharmacy detected. Consider whether adding a product is clinically appropriate; consider a Home Medicines Review.',
 '["Review whether each existing medicine is still needed","Consider HMR/MedsCheck referral","Reinforce adherence routine"]'::jsonb, false),

('elderly_falls_awareness', 'Elderly — falls and adverse-event awareness',
 'Patients 65+ are more susceptible to falls, postural hypotension and adverse drug effects.',
 ARRAY[]::text[], ARRAY['elderly'], ARRAY[]::text[],
 'Low','counselling_prompt',
 'Elderly patient — be cautious with sedating, hypotensive or anticholinergic products and reinforce falls/hydration counselling.',
 '["Ask about recent falls or dizziness","Review sedating and anticholinergic load","Confirm adequate hydration"]'::jsonb, false),

('crushing_administration', 'Administration — crushing / enteral / dysphagia',
 'Some medicines should not be crushed or given via enteral tube.',
 ARRAY[]::text[], ARRAY['swallowing_difficulty'], ARRAY[]::text[],
 'Medium','administration',
 'Swallowing difficulty or enteral feeding noted. Verify each medicine against an administration reference before crushing or splitting.',
 '["Check each medicine for crushability","Consider alternative formulations","Liaise with prescriber if formulation change is needed"]'::jsonb, true);

-- ============================================================
-- SEED: medication_dictionary (top AU community-pharmacy medicines)
-- ============================================================
INSERT INTO public.medication_dictionary (generic_name, brand_names, drug_class, aliases) VALUES
('metformin', ARRAY['Diabex','Diaformin','Glucophage','Metex XR'], 'diabetes', ARRAY['metformin xr','metformin hcl']),
('gliclazide', ARRAY['Diamicron','Glyade'], 'diabetes', ARRAY[]::text[]),
('empagliflozin', ARRAY['Jardiance'], 'diabetes', ARRAY[]::text[]),
('dapagliflozin', ARRAY['Forxiga'], 'diabetes', ARRAY[]::text[]),
('sitagliptin', ARRAY['Januvia'], 'diabetes', ARRAY[]::text[]),
('linagliptin', ARRAY['Trajenta'], 'diabetes', ARRAY[]::text[]),
('insulin glargine', ARRAY['Lantus','Optisulin','Toujeo'], 'diabetes', ARRAY[]::text[]),
('atorvastatin', ARRAY['Lipitor','Atorvastatin'], 'statin', ARRAY['atorvastain']),
('rosuvastatin', ARRAY['Crestor'], 'statin', ARRAY[]::text[]),
('simvastatin', ARRAY['Zocor','Lipex'], 'statin', ARRAY[]::text[]),
('pravastatin', ARRAY['Pravachol'], 'statin', ARRAY[]::text[]),
('ezetimibe', ARRAY['Ezetrol'], 'lipid', ARRAY[]::text[]),
('perindopril', ARRAY['Coversyl'], 'ace_inhibitor', ARRAY[]::text[]),
('perindopril/indapamide', ARRAY['Coversyl Plus'], 'ace_inhibitor+diuretic', ARRAY[]::text[]),
('ramipril', ARRAY['Tritace'], 'ace_inhibitor', ARRAY[]::text[]),
('enalapril', ARRAY['Renitec'], 'ace_inhibitor', ARRAY[]::text[]),
('lisinopril', ARRAY['Zestril','Prinivil'], 'ace_inhibitor', ARRAY[]::text[]),
('candesartan', ARRAY['Atacand'], 'arb', ARRAY[]::text[]),
('irbesartan', ARRAY['Avapro','Karvea'], 'arb', ARRAY[]::text[]),
('telmisartan', ARRAY['Micardis'], 'arb', ARRAY[]::text[]),
('valsartan', ARRAY['Diovan'], 'arb', ARRAY[]::text[]),
('losartan', ARRAY['Cozaar'], 'arb', ARRAY[]::text[]),
('amlodipine', ARRAY['Norvasc','Amlo'], 'ccb', ARRAY[]::text[]),
('felodipine', ARRAY['Plendil','Felodur'], 'ccb', ARRAY[]::text[]),
('lercanidipine', ARRAY['Zanidip'], 'ccb', ARRAY[]::text[]),
('diltiazem', ARRAY['Cardizem','Vasocardol'], 'ccb', ARRAY[]::text[]),
('verapamil', ARRAY['Isoptin'], 'ccb', ARRAY[]::text[]),
('metoprolol', ARRAY['Betaloc','Lopresor'], 'beta_blocker', ARRAY[]::text[]),
('atenolol', ARRAY['Tenormin','Noten'], 'beta_blocker', ARRAY[]::text[]),
('bisoprolol', ARRAY['Bicor'], 'beta_blocker', ARRAY[]::text[]),
('carvedilol', ARRAY['Dilatrend'], 'beta_blocker', ARRAY[]::text[]),
('hydrochlorothiazide', ARRAY['Dithiazide'], 'diuretic', ARRAY[]::text[]),
('indapamide', ARRAY['Natrilix','Dapa-Tabs'], 'diuretic', ARRAY[]::text[]),
('frusemide', ARRAY['Lasix','Uremide'], 'diuretic', ARRAY['furosemide']),
('spironolactone', ARRAY['Aldactone','Spiractin'], 'diuretic', ARRAY[]::text[]),
('warfarin', ARRAY['Coumadin','Marevan'], 'anticoagulant', ARRAY[]::text[]),
('apixaban', ARRAY['Eliquis'], 'anticoagulant', ARRAY[]::text[]),
('rivaroxaban', ARRAY['Xarelto'], 'anticoagulant', ARRAY[]::text[]),
('dabigatran', ARRAY['Pradaxa'], 'anticoagulant', ARRAY[]::text[]),
('aspirin', ARRAY['Astrix','Cartia','Cardiprin','Disprin'], 'antiplatelet', ARRAY['low dose aspirin','asa']),
('clopidogrel', ARRAY['Plavix','Iscover'], 'antiplatelet', ARRAY[]::text[]),
('ticagrelor', ARRAY['Brilinta'], 'antiplatelet', ARRAY[]::text[]),
('dipyridamole', ARRAY['Persantin','Asasantin'], 'antiplatelet', ARRAY[]::text[]),
('pantoprazole', ARRAY['Somac','Salpraz'], 'ppi', ARRAY[]::text[]),
('esomeprazole', ARRAY['Nexium'], 'ppi', ARRAY[]::text[]),
('omeprazole', ARRAY['Losec','Acimax'], 'ppi', ARRAY[]::text[]),
('rabeprazole', ARRAY['Pariet'], 'ppi', ARRAY[]::text[]),
('ranitidine', ARRAY['Zantac'], 'h2_antagonist', ARRAY[]::text[]),
('famotidine', ARRAY['Pepcidine'], 'h2_antagonist', ARRAY[]::text[]),
('levothyroxine', ARRAY['Eutroxsig','Oroxine'], 'thyroid', ARRAY['thyroxine','t4']),
('liothyronine', ARRAY['Tertroxin'], 'thyroid', ARRAY['t3']),
('alendronate', ARRAY['Fosamax'], 'bisphosphonate', ARRAY[]::text[]),
('risedronate', ARRAY['Actonel'], 'bisphosphonate', ARRAY[]::text[]),
('zoledronic acid', ARRAY['Aclasta'], 'bisphosphonate', ARRAY[]::text[]),
('denosumab', ARRAY['Prolia','Xgeva'], 'bone', ARRAY[]::text[]),
('calcium carbonate', ARRAY['Caltrate','Cal-Sup'], 'mineral', ARRAY['calcium']),
('cholecalciferol', ARRAY['Ostelin','Bio-Vit D'], 'vitamin', ARRAY['vitamin d','vitamin d3']),
('amoxicillin', ARRAY['Amoxil','Alphamox'], 'antibiotic_penicillin', ARRAY[]::text[]),
('amoxicillin/clavulanate', ARRAY['Augmentin','Curam'], 'antibiotic_penicillin', ARRAY[]::text[]),
('cephalexin', ARRAY['Keflex','Ialex'], 'antibiotic_cephalosporin', ARRAY[]::text[]),
('doxycycline', ARRAY['Doryx','Vibramycin'], 'tetracycline', ARRAY[]::text[]),
('minocycline', ARRAY['Minomycin'], 'tetracycline', ARRAY[]::text[]),
('ciprofloxacin', ARRAY['Ciproxin'], 'quinolone', ARRAY[]::text[]),
('norfloxacin', ARRAY['Noroxin'], 'quinolone', ARRAY[]::text[]),
('roxithromycin', ARRAY['Rulide'], 'antibiotic_macrolide', ARRAY[]::text[]),
('azithromycin', ARRAY['Zithromax'], 'antibiotic_macrolide', ARRAY[]::text[]),
('clarithromycin', ARRAY['Klacid'], 'antibiotic_macrolide', ARRAY[]::text[]),
('trimethoprim', ARRAY['Triprim','Alprim'], 'antibiotic', ARRAY[]::text[]),
('nitrofurantoin', ARRAY['Macrodantin'], 'antibiotic', ARRAY[]::text[]),
('paracetamol', ARRAY['Panadol','Panadol Osteo','Panamax','Dymadon'], 'analgesic', ARRAY['acetaminophen']),
('ibuprofen', ARRAY['Nurofen','Advil','Brufen'], 'nsaid', ARRAY[]::text[]),
('naproxen', ARRAY['Naprosyn','Anaprox'], 'nsaid', ARRAY[]::text[]),
('diclofenac', ARRAY['Voltaren'], 'nsaid', ARRAY[]::text[]),
('celecoxib', ARRAY['Celebrex'], 'nsaid', ARRAY[]::text[]),
('meloxicam', ARRAY['Mobic'], 'nsaid', ARRAY[]::text[]),
('codeine/paracetamol', ARRAY['Panadeine Forte','Panadeine'], 'opioid', ARRAY[]::text[]),
('oxycodone', ARRAY['Endone','OxyContin','Targin'], 'opioid', ARRAY[]::text[]),
('tramadol', ARRAY['Tramal','Zydol'], 'opioid', ARRAY[]::text[]),
('tapentadol', ARRAY['Palexia'], 'opioid', ARRAY[]::text[]),
('buprenorphine', ARRAY['Norspan'], 'opioid', ARRAY[]::text[]),
('sertraline', ARRAY['Zoloft'], 'ssri', ARRAY[]::text[]),
('escitalopram', ARRAY['Lexapro'], 'ssri', ARRAY[]::text[]),
('citalopram', ARRAY['Cipramil'], 'ssri', ARRAY[]::text[]),
('fluoxetine', ARRAY['Lovan','Prozac'], 'ssri', ARRAY[]::text[]),
('paroxetine', ARRAY['Aropax'], 'ssri', ARRAY[]::text[]),
('venlafaxine', ARRAY['Efexor'], 'snri', ARRAY[]::text[]),
('desvenlafaxine', ARRAY['Pristiq'], 'snri', ARRAY[]::text[]),
('duloxetine', ARRAY['Cymbalta'], 'snri', ARRAY[]::text[]),
('mirtazapine', ARRAY['Avanza','Remeron'], 'antidepressant', ARRAY[]::text[]),
('amitriptyline', ARRAY['Endep'], 'tca', ARRAY[]::text[]),
('diazepam', ARRAY['Valium','Antenex'], 'sedative', ARRAY[]::text[]),
('temazepam', ARRAY['Temaze','Normison'], 'sedative', ARRAY[]::text[]),
('oxazepam', ARRAY['Serepax','Murelax'], 'sedative', ARRAY[]::text[]),
('zolpidem', ARRAY['Stilnox'], 'sedative', ARRAY[]::text[]),
('zopiclone', ARRAY['Imovane','Imrest'], 'sedative', ARRAY[]::text[]),
('prednisolone', ARRAY['Panafcortelone','Solone'], 'corticosteroid', ARRAY[]::text[]),
('prednisone', ARRAY['Panafcort'], 'corticosteroid', ARRAY[]::text[]),
('hydrocortisone', ARRAY['Hysone','Cortate'], 'corticosteroid', ARRAY[]::text[]),
('budesonide', ARRAY['Pulmicort','Symbicort'], 'inhaled_corticosteroid', ARRAY[]::text[]),
('fluticasone', ARRAY['Flixotide','Seretide'], 'inhaled_corticosteroid', ARRAY[]::text[]),
('salbutamol', ARRAY['Ventolin','Asmol','Airomir'], 'sabA', ARRAY[]::text[]),
('tiotropium', ARRAY['Spiriva'], 'lama', ARRAY[]::text[]),
('montelukast', ARRAY['Singulair'], 'asthma', ARRAY[]::text[]),
('cetirizine', ARRAY['Zyrtec','Zilarex'], 'antihistamine', ARRAY[]::text[]),
('loratadine', ARRAY['Claratyne'], 'antihistamine', ARRAY[]::text[]),
('fexofenadine', ARRAY['Telfast'], 'antihistamine', ARRAY[]::text[]),
('desloratadine', ARRAY['Aerius'], 'antihistamine', ARRAY[]::text[]),
('promethazine', ARRAY['Phenergan'], 'antihistamine_sedating', ARRAY[]::text[]),
('metoclopramide', ARRAY['Maxolon','Pramin'], 'antiemetic', ARRAY[]::text[]),
('ondansetron', ARRAY['Zofran','Ondaz'], 'antiemetic', ARRAY[]::text[]),
('domperidone', ARRAY['Motilium'], 'antiemetic', ARRAY[]::text[]),
('macrogol 3350', ARRAY['Movicol','OsmoLax'], 'laxative', ARRAY['macrogol']),
('docusate/senna', ARRAY['Coloxyl with Senna'], 'laxative', ARRAY[]::text[]),
('lactulose', ARRAY['Duphalac','Actilax'], 'laxative', ARRAY[]::text[]),
('loperamide', ARRAY['Imodium','Gastro-Stop'], 'antidiarrhoeal', ARRAY[]::text[]),
('hyoscine butylbromide', ARRAY['Buscopan'], 'antispasmodic', ARRAY[]::text[]),
('mebeverine', ARRAY['Colofac'], 'antispasmodic', ARRAY[]::text[]),
('sumatriptan', ARRAY['Imigran','Imitrex'], 'triptan', ARRAY[]::text[]),
('rizatriptan', ARRAY['Maxalt'], 'triptan', ARRAY[]::text[]),
('gabapentin', ARRAY['Neurontin'], 'antiepileptic', ARRAY[]::text[]),
('pregabalin', ARRAY['Lyrica'], 'antiepileptic', ARRAY[]::text[]),
('valproate', ARRAY['Epilim'], 'antiepileptic', ARRAY['sodium valproate']),
('lamotrigine', ARRAY['Lamictal'], 'antiepileptic', ARRAY[]::text[]),
('carbamazepine', ARRAY['Tegretol'], 'antiepileptic', ARRAY[]::text[]),
('levetiracetam', ARRAY['Keppra'], 'antiepileptic', ARRAY[]::text[]),
('methotrexate', ARRAY['Methoblastin','Trexject'], 'immunosuppressant', ARRAY[]::text[]),
('azathioprine', ARRAY['Imuran'], 'immunosuppressant', ARRAY[]::text[]),
('mycophenolate', ARRAY['Cellcept','Myfortic'], 'immunosuppressant', ARRAY[]::text[]),
('hydroxychloroquine', ARRAY['Plaquenil'], 'immunosuppressant', ARRAY[]::text[]),
('allopurinol', ARRAY['Zyloprim','Progout'], 'gout', ARRAY[]::text[]),
('colchicine', ARRAY['Colgout'], 'gout', ARRAY[]::text[]),
('finasteride', ARRAY['Proscar','Propecia'], 'urology', ARRAY[]::text[]),
('tamsulosin', ARRAY['Flomaxtra'], 'urology', ARRAY[]::text[]),
('sildenafil', ARRAY['Viagra'], 'ed', ARRAY[]::text[]),
('tadalafil', ARRAY['Cialis'], 'ed', ARRAY[]::text[]),
('levonorgestrel', ARRAY['Postinor','Microlut'], 'contraceptive', ARRAY[]::text[]),
('ethinylestradiol/levonorgestrel', ARRAY['Microgynon','Levlen'], 'contraceptive', ARRAY[]::text[]),
('estradiol', ARRAY['Estrofem','Climara'], 'hrt', ARRAY[]::text[]),
('tibolone', ARRAY['Livial'], 'hrt', ARRAY[]::text[]),
('alendronate/cholecalciferol', ARRAY['Fosamax Plus'], 'bisphosphonate', ARRAY[]::text[]),
('candesartan/hydrochlorothiazide', ARRAY['Atacand Plus'], 'arb+diuretic', ARRAY[]::text[]),
('irbesartan/hydrochlorothiazide', ARRAY['Avapro HCT','Karvezide'], 'arb+diuretic', ARRAY[]::text[]),
('amlodipine/atorvastatin', ARRAY['Caduet'], 'ccb+statin', ARRAY[]::text[]),
('amlodipine/perindopril', ARRAY['Coveram'], 'ccb+ace_inhibitor', ARRAY[]::text[]),
('perindopril/amlodipine/indapamide', ARRAY['Triplixam'], 'ace_inhibitor+ccb+diuretic', ARRAY[]::text[]);
