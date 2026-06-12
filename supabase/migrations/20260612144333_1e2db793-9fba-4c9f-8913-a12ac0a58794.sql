-- Lock down ingestion_jobs to service role only (managed via admin client in server functions)
DROP POLICY IF EXISTS "Authenticated can read ingestion_jobs" ON public.ingestion_jobs;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.ingestion_jobs FROM authenticated, anon;

-- Lock down kb-source storage bucket: deny all client access; only service role can touch it
CREATE POLICY "kb-source service role only - select"
ON storage.objects FOR SELECT TO authenticated, anon
USING (bucket_id = 'kb-source' AND false);

CREATE POLICY "kb-source service role only - insert"
ON storage.objects FOR INSERT TO authenticated, anon
WITH CHECK (bucket_id = 'kb-source' AND false);

CREATE POLICY "kb-source service role only - update"
ON storage.objects FOR UPDATE TO authenticated, anon
USING (bucket_id = 'kb-source' AND false)
WITH CHECK (bucket_id = 'kb-source' AND false);

CREATE POLICY "kb-source service role only - delete"
ON storage.objects FOR DELETE TO authenticated, anon
USING (bucket_id = 'kb-source' AND false);