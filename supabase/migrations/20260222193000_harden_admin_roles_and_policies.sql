-- Ensure role catalog exists and is complete
INSERT INTO public.roles (name)
VALUES ('admin'), ('manager'), ('employee')
ON CONFLICT (name) DO NOTHING;

-- Keep profile role values normalized
UPDATE public.perfiles_admin
SET role = 'employee'
WHERE role IS NULL OR role NOT IN ('admin', 'manager', 'employee');

-- New users should not become admin by default
ALTER TABLE public.perfiles_admin
ALTER COLUMN role SET DEFAULT 'employee';

-- Backfill user_roles from perfiles_admin
INSERT INTO public.user_roles (user_id, role_id)
SELECT p.id, r.id
FROM public.perfiles_admin p
JOIN public.roles r
  ON r.name = p.role
ON CONFLICT (user_id, role_id) DO NOTHING;

DO $$
DECLARE
  admin_check TEXT := 'EXISTS (SELECT 1 FROM public.perfiles_admin p WHERE p.id = auth.uid() AND p.role = ''admin'')';
BEGIN
  BEGIN
    EXECUTE format('ALTER POLICY %I ON public.empleados USING (%s) WITH CHECK (%s)', 'Admin manage employees', admin_check, admin_check);
  EXCEPTION WHEN undefined_object THEN NULL;
  END;

  BEGIN
    EXECUTE format('ALTER POLICY %I ON public.asistencias USING (%s) WITH CHECK (%s)', 'Admin manage attendance', admin_check, admin_check);
  EXCEPTION WHEN undefined_object THEN NULL;
  END;

  BEGIN
    EXECUTE format('ALTER POLICY %I ON public.nominas_mensuales USING (%s) WITH CHECK (%s)', 'Admin manage payroll', admin_check, admin_check);
  EXCEPTION WHEN undefined_object THEN NULL;
  END;

  BEGIN
    EXECUTE format('ALTER POLICY %I ON public.cargas_familiares USING (%s) WITH CHECK (%s)', 'Admin manage family', admin_check, admin_check);
  EXCEPTION WHEN undefined_object THEN NULL;
  END;

  BEGIN
    EXECUTE format('ALTER POLICY %I ON public.sucursales USING (%s) WITH CHECK (%s)', 'Admins pueden gestionar sucursales', admin_check, admin_check);
  EXCEPTION WHEN undefined_object THEN NULL;
  END;

  BEGIN
    EXECUTE format('ALTER POLICY %I ON public.configuracion_global USING (%s) WITH CHECK (%s)', 'Admin update config', admin_check, admin_check);
  EXCEPTION WHEN undefined_object THEN NULL;
  END;

  BEGIN
    EXECUTE format('ALTER POLICY %I ON public.adelantos USING (%s) WITH CHECK (%s)', 'Permitir actualizar a administradores', admin_check, admin_check);
  EXCEPTION WHEN undefined_object THEN NULL;
  END;

  BEGIN
    EXECUTE format('ALTER POLICY %I ON public.adelantos WITH CHECK (%s)', 'Permitir insertar a administradores', admin_check);
  EXCEPTION WHEN undefined_object THEN NULL;
  END;
END $$;
