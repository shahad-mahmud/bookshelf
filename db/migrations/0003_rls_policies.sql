-- Helper functions (SECURITY DEFINER to avoid policy recursion)
CREATE OR REPLACE FUNCTION public.fn_library_access(p_library_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.library_members
    WHERE library_id = p_library_id AND user_id = auth.uid()
  )
$$;

CREATE OR REPLACE FUNCTION public.fn_library_role(p_library_id uuid)
RETURNS library_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.library_members
   WHERE library_id = p_library_id AND user_id = auth.uid()
$$;

REVOKE EXECUTE ON FUNCTION public.fn_library_access(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_library_role(uuid)  FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_library_access(uuid) TO authenticated;
GRANT  EXECUTE ON FUNCTION public.fn_library_role(uuid)  TO authenticated;

-- profiles
CREATE POLICY profiles_select_self ON public.profiles FOR SELECT USING (id = auth.uid());
CREATE POLICY profiles_select_co ON public.profiles FOR SELECT USING (EXISTS (
  SELECT 1 FROM public.library_members lm_self
  JOIN public.library_members lm_other USING (library_id)
  WHERE lm_self.user_id = auth.uid() AND lm_other.user_id = profiles.id
));
CREATE POLICY profiles_update_self ON public.profiles FOR UPDATE USING (id = auth.uid()) WITH CHECK (id = auth.uid());

-- libraries
CREATE POLICY libraries_select ON public.libraries FOR SELECT USING (public.fn_library_access(id));
CREATE POLICY libraries_insert ON public.libraries FOR INSERT WITH CHECK (created_by = auth.uid());
CREATE POLICY libraries_update ON public.libraries FOR UPDATE USING (public.fn_library_role(id) IN ('owner','admin')) WITH CHECK (public.fn_library_role(id) IN ('owner','admin'));
CREATE POLICY libraries_delete ON public.libraries FOR DELETE USING (public.fn_library_role(id) = 'owner');

-- library_members
CREATE POLICY members_select_self ON public.library_members FOR SELECT USING (user_id = auth.uid());
CREATE POLICY members_select_co ON public.library_members FOR SELECT USING (public.fn_library_access(library_id));

CREATE POLICY members_insert_initial_owner ON public.library_members FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    AND role = 'owner'
    AND EXISTS (
      SELECT 1 FROM public.libraries l
      WHERE l.id = library_members.library_id AND l.created_by = auth.uid()
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.library_members existing
      WHERE existing.library_id = library_members.library_id
    )
  );

CREATE POLICY members_update_self_demote ON public.library_members FOR UPDATE USING (user_id = auth.uid() AND role = 'owner') WITH CHECK (user_id = auth.uid());
CREATE POLICY members_update_admin_or_owner ON public.library_members FOR UPDATE USING (public.fn_library_role(library_id) IN ('owner','admin')) WITH CHECK (public.fn_library_role(library_id) IN ('owner','admin'));

CREATE POLICY members_delete_self ON public.library_members FOR DELETE USING (user_id = auth.uid() AND role = 'admin');
CREATE POLICY members_delete_admin ON public.library_members FOR DELETE USING (
  role = 'admin'
  AND public.fn_library_role(library_id) = 'owner'
  AND user_id <> auth.uid()
);

-- library_invites — read only from policy; writes go through SECURITY DEFINER fns
CREATE POLICY invites_select ON public.library_invites FOR SELECT USING (public.fn_library_role(library_id) IN ('owner','admin'));

-- currencies — public read
CREATE POLICY currencies_read ON public.currencies FOR SELECT USING (true);

-- Tenant tables
CREATE POLICY books_select ON public.books FOR SELECT USING (public.fn_library_access(library_id));
CREATE POLICY books_insert ON public.books FOR INSERT WITH CHECK (public.fn_library_access(library_id));
CREATE POLICY books_update ON public.books FOR UPDATE USING (public.fn_library_access(library_id)) WITH CHECK (public.fn_library_access(library_id));
CREATE POLICY books_delete ON public.books FOR DELETE USING (public.fn_library_access(library_id));

CREATE POLICY borrowers_select ON public.borrowers FOR SELECT USING (public.fn_library_access(library_id));
CREATE POLICY borrowers_insert ON public.borrowers FOR INSERT WITH CHECK (public.fn_library_access(library_id));
CREATE POLICY borrowers_update ON public.borrowers FOR UPDATE USING (public.fn_library_access(library_id)) WITH CHECK (public.fn_library_access(library_id));
CREATE POLICY borrowers_delete ON public.borrowers FOR DELETE USING (public.fn_library_access(library_id));

CREATE POLICY loans_select ON public.loans FOR SELECT USING (public.fn_library_access(library_id));
CREATE POLICY loans_insert ON public.loans FOR INSERT WITH CHECK (public.fn_library_access(library_id));
CREATE POLICY loans_update ON public.loans FOR UPDATE USING (public.fn_library_access(library_id)) WITH CHECK (public.fn_library_access(library_id));
CREATE POLICY loans_delete ON public.loans FOR DELETE USING (public.fn_library_access(library_id));
