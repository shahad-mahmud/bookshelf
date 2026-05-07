-- Public bucket for book covers. Reads are public (any URL hits the CDN);
-- writes/updates/deletes are gated by library membership via fn_library_access.
INSERT INTO storage.buckets (id, name, public)
VALUES ('book-covers', 'book-covers', true)
ON CONFLICT (id) DO NOTHING;

-- Path layout: <library_id>/<book_id>.webp
-- The first segment is the library UUID, which the policies extract for the access check.

CREATE POLICY book_covers_insert ON storage.objects FOR INSERT
  TO authenticated WITH CHECK (
    bucket_id = 'book-covers'
    AND public.fn_library_access((string_to_array(name, '/'))[1]::uuid)
  );

CREATE POLICY book_covers_update ON storage.objects FOR UPDATE
  TO authenticated USING (
    bucket_id = 'book-covers'
    AND public.fn_library_access((string_to_array(name, '/'))[1]::uuid)
  ) WITH CHECK (
    bucket_id = 'book-covers'
    AND public.fn_library_access((string_to_array(name, '/'))[1]::uuid)
  );

CREATE POLICY book_covers_delete ON storage.objects FOR DELETE
  TO authenticated USING (
    bucket_id = 'book-covers'
    AND public.fn_library_access((string_to_array(name, '/'))[1]::uuid)
  );
