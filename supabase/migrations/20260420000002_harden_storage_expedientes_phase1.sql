-- F1.11 Endurecer policies del bucket 'expedientes'
-- Problema: 4 policies SELECT amplias permitían LIST del contenido del bucket.
-- Los INSERT/UPDATE no validaban que el usuario fuera admin (solo bucket_id).
-- Solución: consolidar en 4 policies admin-only. El bucket sigue público,
-- por lo que las URLs directas siguen funcionando para mostrar fotos/logos en la UI
-- sin necesidad de policy SELECT en storage.objects.

DROP POLICY IF EXISTS "Admins pueden gestionar expedientes" ON storage.objects;
DROP POLICY IF EXISTS "Admins pueden subir expedientes" ON storage.objects;
DROP POLICY IF EXISTS "Admins pueden subir logos" ON storage.objects;
DROP POLICY IF EXISTS "Admins pueden ver expedientes" ON storage.objects;
DROP POLICY IF EXISTS "Lectura pública de logos" ON storage.objects;
DROP POLICY IF EXISTS "Logos acceso público" ON storage.objects;
DROP POLICY IF EXISTS "Permitir actualización de logos" ON storage.objects;
DROP POLICY IF EXISTS "Permitir carga de logos en folder logos" ON storage.objects;

CREATE POLICY "expedientes_admin_select"
  ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'expedientes'
    AND EXISTS (
      SELECT 1 FROM public.perfiles_admin p
      WHERE p.id = auth.uid() AND p.role = 'admin'
    )
  );

CREATE POLICY "expedientes_admin_insert"
  ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'expedientes'
    AND EXISTS (
      SELECT 1 FROM public.perfiles_admin p
      WHERE p.id = auth.uid() AND p.role = 'admin'
    )
  );

CREATE POLICY "expedientes_admin_update"
  ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'expedientes'
    AND EXISTS (
      SELECT 1 FROM public.perfiles_admin p
      WHERE p.id = auth.uid() AND p.role = 'admin'
    )
  )
  WITH CHECK (
    bucket_id = 'expedientes'
    AND EXISTS (
      SELECT 1 FROM public.perfiles_admin p
      WHERE p.id = auth.uid() AND p.role = 'admin'
    )
  );

CREATE POLICY "expedientes_admin_delete"
  ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'expedientes'
    AND EXISTS (
      SELECT 1 FROM public.perfiles_admin p
      WHERE p.id = auth.uid() AND p.role = 'admin'
    )
  );
