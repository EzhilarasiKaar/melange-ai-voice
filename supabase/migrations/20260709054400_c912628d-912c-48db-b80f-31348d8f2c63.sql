
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO service_role;
-- has_role is called from RLS policies, which run as the row owner - keep policies calling it via SECURITY DEFINER

-- Re-grant for RLS policy usage (RLS re-checks via SECURITY DEFINER wrapper). Since policies USE has_role, authenticated needs execute.
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

-- Storage policies for interview-recordings bucket
CREATE POLICY "Editors read recordings storage"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'interview-recordings' AND public.has_role(auth.uid(), 'editor'));

CREATE POLICY "Editors delete recordings storage"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'interview-recordings' AND public.has_role(auth.uid(), 'editor'));
