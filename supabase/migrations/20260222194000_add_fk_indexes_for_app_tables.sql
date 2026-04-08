CREATE INDEX IF NOT EXISTS idx_adelantos_empleado_id
  ON public.adelantos (empleado_id);

CREATE INDEX IF NOT EXISTS idx_nominas_mensuales_empleado_id
  ON public.nominas_mensuales (empleado_id);

CREATE INDEX IF NOT EXISTS idx_user_roles_role_id
  ON public.user_roles (role_id);
