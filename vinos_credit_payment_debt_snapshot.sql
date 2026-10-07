-- Casa Tahona: guardar snapshot de deuda antes/despues en cada abono.
-- Ejecutar en la base de datos VINOS / Casa Tahona antes de desplegar la app.

alter table public.credit_payments
  add column if not exists debt_before numeric(12,2),
  add column if not exists debt_after numeric(12,2);

comment on column public.credit_payments.debt_before is
  'Saldo pendiente de la venta justo antes de aplicar este abono.';

comment on column public.credit_payments.debt_after is
  'Saldo pendiente de la venta justo despues de aplicar este abono.';

-- Backfill para abonos existentes con venta vinculada.
-- Usa el orden created_at, id para reconstruir el saldo por venta.
with ordered_payments as (
  select
    p.id,
    greatest(
      0,
      coalesce(s.credit_used, s.total, 0)
      - coalesce(
        sum(coalesce(p.amount, 0)) over (
          partition by p.sale_id
          order by p.created_at, p.id
          rows between unbounded preceding and 1 preceding
        ),
        0
      )
    ) as computed_debt_before,
    greatest(
      0,
      coalesce(s.credit_used, s.total, 0)
      - coalesce(
        sum(coalesce(p.amount, 0)) over (
          partition by p.sale_id
          order by p.created_at, p.id
          rows between unbounded preceding and current row
        ),
        0
      )
    ) as computed_debt_after
  from public.credit_payments p
  join public.sales s on s.id = p.sale_id
  where p.sale_id is not null
    and p.deleted_at is null
)
update public.credit_payments p
set
  debt_before = coalesce(p.debt_before, ordered_payments.computed_debt_before),
  debt_after = coalesce(p.debt_after, ordered_payments.computed_debt_after)
from ordered_payments
where ordered_payments.id = p.id;
