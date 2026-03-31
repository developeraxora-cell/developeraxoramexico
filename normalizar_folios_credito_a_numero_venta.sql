begin;

alter table public.credit_notes
add column if not exists sale_reference text;

alter table public.concrete_credit_notes
add column if not exists sale_reference text;

-- Materiales:
-- si la nota está vinculada a una venta, usar el número de venta real.
update public.credit_notes cn
set
  folio = it.id::text,
  sale_reference = it.id::text,
  updated_at = now()
from public.inventory_transactions it
where cn.inventory_transaction_id = it.id
  and cn.folio is distinct from it.id::text;

-- Materiales:
-- si no tiene vínculo directo pero ya tiene un sale_reference numérico, usarlo como folio.
update public.credit_notes
set
  folio = trim(sale_reference),
  updated_at = now()
where nullif(trim(sale_reference), '') is not null
  and trim(sale_reference) ~ '^[0-9]+$'
  and folio is distinct from trim(sale_reference);

-- Concretera:
-- si la nota está vinculada a una venta, usar el número de venta real.
update public.concrete_credit_notes cn
set
  folio = it.id::text,
  sale_reference = it.id::text,
  updated_at = now()
from public.concrete_inventory_transactions it
where cn.inventory_transaction_id = it.id
  and cn.folio is distinct from it.id::text;

-- Concretera:
-- si no tiene vínculo directo pero ya tiene un sale_reference numérico, usarlo como folio.
update public.concrete_credit_notes
set
  folio = trim(sale_reference),
  updated_at = now()
where nullif(trim(sale_reference), '') is not null
  and trim(sale_reference) ~ '^[0-9]+$'
  and folio is distinct from trim(sale_reference);

commit;
