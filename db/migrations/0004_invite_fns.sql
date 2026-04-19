-- fn_send_invite: caller must be owner/admin. App generates the plaintext token
-- and passes SHA-256 hash only.
CREATE OR REPLACE FUNCTION public.fn_send_invite(
  p_library_id uuid,
  p_role library_role,
  p_invited_email text,
  p_invited_phone text,
  p_token_hash bytea
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invite_id uuid;
  v_caller_role library_role;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  v_caller_role := public.fn_library_role(p_library_id);
  IF v_caller_role IS NULL OR v_caller_role NOT IN ('owner','admin') THEN
    RAISE EXCEPTION 'Not authorized to invite to this library';
  END IF;

  IF p_invited_email IS NULL AND p_invited_phone IS NULL THEN
    RAISE EXCEPTION 'Invite requires email or phone';
  END IF;

  INSERT INTO public.library_invites
    (library_id, role, invited_email, invited_phone, token_hash, invited_by)
  VALUES
    (p_library_id, p_role, p_invited_email, p_invited_phone, p_token_hash, auth.uid())
  RETURNING id INTO v_invite_id;

  RETURN v_invite_id;
END;
$$;

-- fn_accept_invite: caller passes plaintext token; function hashes and validates.
CREATE OR REPLACE FUNCTION public.fn_accept_invite(p_token_plaintext text)
RETURNS uuid  -- library_id
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_hash bytea;
  v_invite public.library_invites%ROWTYPE;
  v_profile public.profiles%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  v_hash := extensions.digest(p_token_plaintext, 'sha256');

  SELECT * INTO v_invite
    FROM public.library_invites
   WHERE token_hash = v_hash
     AND accepted_at IS NULL
     AND revoked_at IS NULL
     AND expires_at > now()
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invalid or expired invite';
  END IF;

  SELECT * INTO v_profile FROM public.profiles WHERE id = auth.uid();
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profile missing';
  END IF;

  IF NOT (
    (v_invite.invited_email IS NOT NULL AND lower(v_invite.invited_email) = lower(v_profile.email))
    OR
    (v_invite.invited_phone IS NOT NULL AND v_invite.invited_phone = v_profile.phone)
  ) THEN
    RAISE EXCEPTION 'Invite does not match your account';
  END IF;

  INSERT INTO public.library_members (library_id, user_id, role)
  VALUES (v_invite.library_id, auth.uid(), v_invite.role)
  ON CONFLICT (library_id, user_id) DO NOTHING;

  UPDATE public.library_invites
     SET accepted_at = now(), accepted_by = auth.uid()
   WHERE id = v_invite.id;

  RETURN v_invite.library_id;
END;
$$;

-- fn_revoke_invite
CREATE OR REPLACE FUNCTION public.fn_revoke_invite(p_invite_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_library_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT library_id INTO v_library_id FROM public.library_invites WHERE id = p_invite_id;
  IF v_library_id IS NULL THEN RAISE EXCEPTION 'Invite not found'; END IF;

  IF public.fn_library_role(v_library_id) NOT IN ('owner','admin') THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  UPDATE public.library_invites
     SET revoked_at = now()
   WHERE id = p_invite_id AND accepted_at IS NULL AND revoked_at IS NULL;
END;
$$;

-- fn_transfer_ownership
CREATE OR REPLACE FUNCTION public.fn_transfer_ownership(
  p_library_id uuid,
  p_new_owner_user_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF public.fn_library_role(p_library_id) <> 'owner' THEN
    RAISE EXCEPTION 'Only the current owner can transfer ownership';
  END IF;
  IF p_new_owner_user_id = auth.uid() THEN
    RAISE EXCEPTION 'Cannot transfer ownership to yourself';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.library_members
    WHERE library_id = p_library_id AND user_id = p_new_owner_user_id AND role = 'admin'
  ) THEN
    RAISE EXCEPTION 'New owner must already be an admin of the library';
  END IF;

  -- Swap atomically. Demote current owner first, then promote new owner,
  -- to avoid a transient state with two owners (which would violate the partial unique index).
  UPDATE public.library_members SET role = 'admin'
    WHERE library_id = p_library_id AND user_id = auth.uid();
  UPDATE public.library_members SET role = 'owner'
    WHERE library_id = p_library_id AND user_id = p_new_owner_user_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_send_invite(uuid, library_role, text, text, bytea) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_accept_invite(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_revoke_invite(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_transfer_ownership(uuid, uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.fn_send_invite(uuid, library_role, text, text, bytea) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_accept_invite(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_revoke_invite(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_transfer_ownership(uuid, uuid) TO authenticated;
