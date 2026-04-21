-- Fase 1 de endurecimiento: cierra filtraciones de datos y bypass de RLS
-- F1.7 adelantos: SELECT permisivo ("USING (true)") → solo admin
DROP POLICY IF EXISTS "Permitir lectura a todos los autenticados" ON public.adelantos;
CREATE POLICY "adelantos_admin_select"
  ON public.adelantos
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.perfiles_admin p
      WHERE p.id = auth.uid() AND p.role = 'admin'
    )
  );

-- F1.8 historial_prestaciones: SELECT permisivo → solo admin
DROP POLICY IF EXISTS "Permitir lectura de prestaciones a todos los autenticados" ON public.historial_prestaciones;
CREATE POLICY "historial_prestaciones_admin_select"
  ON public.historial_prestaciones
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.perfiles_admin p
      WHERE p.id = auth.uid() AND p.role = 'admin'
    )
  );

-- F1.9 empleado_sucursales: policy "Allow authenticated" bypaseaba RLS total (USING true WITH CHECK true)
-- Reemplazamos por:
--   * SELECT abierto a admin y asistencia (ambos roles lo necesitan para la UI de asistencia)
--   * INSERT/UPDATE/DELETE solo admin
DROP POLICY IF EXISTS "Allow authenticated" ON public.empleado_sucursales;

CREATE POLICY "empleado_sucursales_read"
  ON public.empleado_sucursales
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.perfiles_admin p
      WHERE p.id = auth.uid() AND p.role IN ('admin', 'asistencia')
    )
  );

CREATE POLICY "empleado_sucursales_admin_insert"
  ON public.empleado_sucursales
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.perfiles_admin p
      WHERE p.id = auth.uid() AND p.role = 'admin'
    )
  );

CREATE POLICY "empleado_sucursales_admin_update"
  ON public.empleado_sucursales
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.perfiles_admin p
      WHERE p.id = auth.uid() AND p.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.perfiles_admin p
      WHERE p.id = auth.uid() AND p.role = 'admin'
    )
  );

CREATE POLICY "empleado_sucursales_admin_delete"
  ON public.empleado_sucursales
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.perfiles_admin p
      WHERE p.id = auth.uid() AND p.role = 'admin'
    )
  );

-- F1.10 Fijar search_path de la función para evitar hijacking por search_path mutable
ALTER FUNCTION public.marcar_inasistencias_del_dia() SET search_path = public, pg_catalog;
