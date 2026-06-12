-- ============================================================
-- PHARMAPROMPT OS — DICTIONARY EXTENSION
-- Adds missing drugs to medication_dictionary (Phase 1 seed):
--   - Atypical antipsychotics (olanzapine, risperidone, quetiapine, etc.)
--   - Typical antipsychotics (haloperidol, chlorpromazine, etc.)
--   - Mood stabilisers (lithium)
--   - DMARDs (sulfasalazine, leflunomide)
--   - Benzodiazepines (nitrazepam, flunitrazepam)
--   - Parkinson's (levodopa/carbidopa, pramipexole)
-- ============================================================

INSERT INTO public.medication_dictionary (generic_name, brand_names, drug_class, aliases) VALUES
('olanzapine', ARRAY['Zyprexa','Olanzapine ODT GH'], 'antipsychotic_atypical', ARRAY['ola']::text[]),
('risperidone', ARRAY['Risperdal','Rixadone'], 'antipsychotic_atypical', ARRAY[]::text[]),
('quetiapine', ARRAY['Seroquel','Quetia'], 'antipsychotic_atypical', ARRAY[]::text[]),
('aripiprazole', ARRAY['Abilify','Abyraz'], 'antipsychotic_atypical', ARRAY[]::text[]),
('clozapine', ARRAY['Clozaril','Clopine'], 'antipsychotic_atypical', ARRAY[]::text[]),
('amisulpride', ARRAY['Solian'], 'antipsychotic_atypical', ARRAY[]::text[]),
('paliperidone', ARRAY['Invega','Invega Sustenna'], 'antipsychotic_atypical', ARRAY[]::text[]),
('asenapine', ARRAY['Saphris'], 'antipsychotic_atypical', ARRAY[]::text[]),
('lurasidone', ARRAY['Latuda'], 'antipsychotic_atypical', ARRAY[]::text[]),
('haloperidol', ARRAY['Serenace'], 'antipsychotic_typical', ARRAY[]::text[]),
('chlorpromazine', ARRAY['Largactil'], 'antipsychotic_typical', ARRAY[]::text[]),
('fluphenazine', ARRAY['Modecate'], 'antipsychotic_typical', ARRAY[]::text[]),
('zuclopenthixol', ARRAY['Clopixol'], 'antipsychotic_typical', ARRAY[]::text[]),
('trifluoperazine', ARRAY['Stelazine'], 'antipsychotic_typical', ARRAY[]::text[]),
('lithium carbonate', ARRAY['Lithicarb','Priadel'], 'mood_stabiliser', ARRAY['lithium']::text[]),
('sulfasalazine', ARRAY['Salazopyrin','Pyralin'], 'dmard', ARRAY[]::text[]),
('leflunomide', ARRAY['Arava'], 'dmard', ARRAY[]::text[]),
('nitrazepam', ARRAY['Mogadon'], 'sedative', ARRAY[]::text[]),
('flunitrazepam', ARRAY['Rohypnol'], 'sedative', ARRAY[]::text[]),
('levodopa/carbidopa', ARRAY['Sinemet','Kinson'], 'parkinsons', ARRAY['carbidopa/levodopa']::text[]),
('pramipexole', ARRAY['Sifrol'], 'parkinsons', ARRAY[]::text[])
ON CONFLICT (generic_name) DO NOTHING;
