
-- Lock down has_role: revoke EXECUTE from PUBLIC and anon. Authenticated keeps EXECUTE because RLS policies call it.
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, service_role;

-- ingestion_jobs has RLS enabled but no policy. It is admin-only; add explicit admin policy
-- so signed-in admins can use it via RLS (the app currently uses supabaseAdmin which bypasses RLS,
-- but this provides defense-in-depth and resolves the linter warning).
CREATE POLICY "Admins manage ingestion jobs"
ON public.ingestion_jobs
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));
