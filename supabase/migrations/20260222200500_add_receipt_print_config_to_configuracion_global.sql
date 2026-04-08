alter table public.configuracion_global
add column if not exists receipt_print_config jsonb not null default '{}'::jsonb;
