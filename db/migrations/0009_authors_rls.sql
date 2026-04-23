-- Enable RLS
ALTER TABLE public.authors        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.authors        FORCE  ROW LEVEL SECURITY;
ALTER TABLE public.author_aliases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.author_aliases FORCE  ROW LEVEL SECURITY;

-- authors: any authenticated user can read and create
-- (global table — not per-library; writes scoped by application logic)
CREATE POLICY authors_select ON public.authors
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY authors_insert ON public.authors
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- author_aliases: read-only from app code
-- (writes reserved for future author management page via service role)
CREATE POLICY aliases_select ON public.author_aliases
  FOR SELECT USING (auth.uid() IS NOT NULL);
