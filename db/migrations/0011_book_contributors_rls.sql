ALTER TABLE public.book_contributors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.book_contributors FORCE  ROW LEVEL SECURITY;

CREATE POLICY book_contributors_select ON public.book_contributors
  FOR SELECT USING (
    public.fn_library_access((SELECT library_id FROM public.books WHERE id = book_id))
  );

CREATE POLICY book_contributors_insert ON public.book_contributors
  FOR INSERT WITH CHECK (
    public.fn_library_access((SELECT library_id FROM public.books WHERE id = book_id))
  );

CREATE POLICY book_contributors_delete ON public.book_contributors
  FOR DELETE USING (
    public.fn_library_access((SELECT library_id FROM public.books WHERE id = book_id))
  );
