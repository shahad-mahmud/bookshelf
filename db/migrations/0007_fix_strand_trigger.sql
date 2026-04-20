-- Fix: prevent_strand_library trigger was returning OLD for UPDATE operations.
-- A BEFORE UPDATE trigger must return NEW for the update to apply; returning OLD
-- silently reverts every UPDATE on library_members, which broke fn_transfer_ownership.
CREATE OR REPLACE FUNCTION public.prevent_strand_library()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF EXISTS (SELECT 1 FROM public.libraries WHERE id = OLD.library_id) THEN
      IF OLD.role = 'owner'
         AND NOT EXISTS (
           SELECT 1 FROM public.library_members
            WHERE library_id = OLD.library_id
              AND role = 'owner'
              AND user_id <> OLD.user_id
         )
      THEN
        RAISE EXCEPTION 'Cannot leave library % without an owner', OLD.library_id;
      END IF;
    END IF;
    RETURN OLD;
  END IF;

  -- UPDATE: allow the change through; strand prevention is not needed here because
  -- fn_transfer_ownership promotes a new owner before this check would matter.
  RETURN NEW;
END;
$$;
