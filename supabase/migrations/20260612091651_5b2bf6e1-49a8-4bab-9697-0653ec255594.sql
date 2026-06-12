CREATE TABLE public.sense_check_audits (
  audit_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES public.patient_cases(case_id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  model text NOT NULL,
  status text NOT NULL,
  input_summary jsonb,
  raw_response jsonb,
  applied_changes jsonb,
  rejected_changes jsonb,
  error_message text,
  latency_ms integer,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.sense_check_audits TO authenticated;
GRANT ALL ON public.sense_check_audits TO service_role;

ALTER TABLE public.sense_check_audits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users read own audits" ON public.sense_check_audits
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "users insert own audits" ON public.sense_check_audits
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_sense_check_audits_case ON public.sense_check_audits(case_id);