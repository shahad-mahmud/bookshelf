-- Supabase's `anon` / `authenticated` / `service_role` roles need table-level
-- privileges for RLS to be reached at all — a table with RLS enabled but no
-- GRANT errors with 42501 (permission denied) before policies are evaluated.
--
-- Supabase normally sets ALTER DEFAULT PRIVILEGES on the public schema so
-- new tables inherit these grants automatically, but our db-reset dropped
-- and recreated the schema, which also dropped the default privileges.
-- This migration restores them for existing tables AND sets defaults for
-- any future tables/sequences/functions.

-- Re-establish default privileges in `public` so future objects inherit.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL ON TABLES    TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL ON FUNCTIONS TO anon, authenticated, service_role;

-- Grant on every table we've already created. RLS still restricts row visibility.
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.profiles        TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.libraries       TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.library_members TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.library_invites TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.currencies      TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.borrowers       TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.books           TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.loans           TO anon, authenticated, service_role;

-- Grant USAGE on the schema itself (role can't see objects without it).
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
