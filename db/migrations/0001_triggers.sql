-- Generic updated_at trigger function (single source of truth)
CREATE OR REPLACE FUNCTION public.trigger_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Attach to every mutable table
CREATE TRIGGER set_updated_at_profiles  BEFORE UPDATE ON public.profiles  FOR EACH ROW EXECUTE FUNCTION public.trigger_set_updated_at();
CREATE TRIGGER set_updated_at_libraries BEFORE UPDATE ON public.libraries FOR EACH ROW EXECUTE FUNCTION public.trigger_set_updated_at();
CREATE TRIGGER set_updated_at_borrowers BEFORE UPDATE ON public.borrowers FOR EACH ROW EXECUTE FUNCTION public.trigger_set_updated_at();
CREATE TRIGGER set_updated_at_books     BEFORE UPDATE ON public.books     FOR EACH ROW EXECUTE FUNCTION public.trigger_set_updated_at();

-- On new auth.users row: create profile + personal library + owner membership, atomically.
CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_display_name text;
  v_library_id uuid;
  v_library_name text;
BEGIN
  v_display_name := coalesce(
    NEW.raw_user_meta_data ->> 'display_name',
    NEW.raw_user_meta_data ->> 'full_name',
    NEW.raw_user_meta_data ->> 'name',
    split_part(NEW.email, '@', 1)
  );

  INSERT INTO public.profiles (id, display_name, email, phone)
  VALUES (NEW.id, v_display_name, NEW.email, NEW.phone);

  v_library_name := v_display_name || '''s Library';
  INSERT INTO public.libraries (name, created_by)
  VALUES (v_library_name, NEW.id)
  RETURNING id INTO v_library_id;

  INSERT INTO public.library_members (library_id, user_id, role)
  VALUES (v_library_id, NEW.id, 'owner');

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_auth_user();

-- Keep profiles.email/phone synced with auth.users
CREATE OR REPLACE FUNCTION public.handle_auth_user_updated()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.profiles
     SET email = NEW.email, phone = NEW.phone
   WHERE id = NEW.id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_updated ON auth.users;
CREATE TRIGGER on_auth_user_updated
  AFTER UPDATE OF email, phone ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_auth_user_updated();

-- Prevent stranding a library without an owner.
CREATE OR REPLACE FUNCTION public.prevent_strand_library()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.libraries WHERE id = OLD.library_id) THEN
    IF OLD.role = 'owner'
       AND NOT EXISTS (
         SELECT 1 FROM public.library_members
          WHERE library_id = OLD.library_id
            AND role = 'owner'
            AND (user_id <> OLD.user_id OR TG_OP = 'UPDATE' AND NEW.role = 'owner')
       )
    THEN
      RAISE EXCEPTION 'Cannot leave library % without an owner', OLD.library_id;
    END IF;
  END IF;
  RETURN OLD;
END;
$$;

CREATE TRIGGER prevent_strand_library_on_delete
  BEFORE DELETE ON public.library_members
  FOR EACH ROW EXECUTE FUNCTION public.prevent_strand_library();

CREATE TRIGGER prevent_strand_library_on_update
  BEFORE UPDATE ON public.library_members
  FOR EACH ROW EXECUTE FUNCTION public.prevent_strand_library();
