alter table public.empleados
add column if not exists receipt_print_config jsonb not null default '{}'::jsonb;
