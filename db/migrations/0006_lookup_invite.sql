-- Read-only lookup for the accept-invite preview page. Returns zero rows
-- if the token is invalid, revoked, accepted, or expired. SECURITY DEFINER
-- bypasses RLS on library_invites (which is invite-admin-only for reads).
CREATE OR REPLACE FUNCTION public.fn_lookup_invite(p_token_plaintext text)
RETURNS TABLE(
  library_id uuid,
  library_name text,
  role library_role,
  inviter_display_name text,
  inviter_email text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_hash bytea;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN;
  END IF;

  v_hash := extensions.digest(p_token_plaintext, 'sha256');

  RETURN QUERY
  SELECT
    li.library_id,
    l.name AS library_name,
    li.role,
    p.display_name AS inviter_display_name,
    p.email AS inviter_email
  FROM public.library_invites li
  JOIN public.libraries l ON l.id = li.library_id
  LEFT JOIN public.profiles p ON p.id = li.invited_by
  WHERE li.token_hash = v_hash
    AND li.accepted_at IS NULL
    AND li.revoked_at IS NULL
    AND li.expires_at > now();
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_lookup_invite(text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_lookup_invite(text) TO authenticated;
