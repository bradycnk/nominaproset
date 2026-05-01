-- Ensure realtime events are published for every table the UI reads, so that
-- inserts/updates/deletes propagate to connected clients without reload.

DO $$
DECLARE
  t text;
  target_tables text[] := ARRAY[
    'empleados',
    'sucursales',
    'empleado_sucursales',
    'asistencias',
    'adelantos',
    'nominas_mensuales',
    'configuracion_global',
    'historial_prestaciones',
    'cargas_familiares'
  ];
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    CREATE PUBLICATION supabase_realtime;
  END IF;

  FOREACH t IN ARRAY target_tables LOOP
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = t)
       AND NOT EXISTS (
         SELECT 1
         FROM pg_publication_tables
         WHERE pubname = 'supabase_realtime'
           AND schemaname = 'public'
           AND tablename = t
       )
    THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;
  END LOOP;
END $$;
