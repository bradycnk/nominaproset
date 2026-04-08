alter table public.adelantos
add column if not exists tipo text not null default 'adelanto_nomina',
add column if not exists cuota_quincenal numeric,
add column if not exists saldo_pendiente numeric,
add column if not exists ultimo_periodo_descuento text;

update public.adelantos
set
  tipo = coalesce(tipo, 'adelanto_nomina'),
  saldo_pendiente = coalesce(saldo_pendiente, monto),
  cuota_quincenal = coalesce(cuota_quincenal, monto);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'adelantos_tipo_check'
  ) then
    alter table public.adelantos
    add constraint adelantos_tipo_check
    check (tipo in ('adelanto_nomina', 'prestamo_credito'));
  end if;
end $$;
