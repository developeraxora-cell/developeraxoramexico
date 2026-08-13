begin;

update public.inventory_transactions
set notes = null
where branch_id = 2
  and business_unit = 'materiales'
  and (
    notes ~* '^Venta origen:\s*'
    or notes ~* '^Entrada origen:\s*'
  )
  and notes ~* '\|\s*(Usuario|Total|Liquidado|Credito abonado|Status) origen:';

update public.credit_notes
set notes = null
where branch_id = 2
  and business_unit = 'materiales'
  and notes ~* '^Venta origen:\s*'
  and notes ~* '\|\s*(Usuario|Credito abonado|Status) origen:';

update public.credit_payments
set notes = null
where note_id in (
    select id
    from public.credit_notes
    where branch_id = 2
      and business_unit = 'materiales'
  )
  and notes ~* '^Abono origen:\s*'
  and notes ~* '\|\s*(Venta|Usuario|Status) origen:';

select
  'inventory_transactions_generated_notes' as target,
  count(*) as remaining
from public.inventory_transactions
where branch_id = 2
  and business_unit = 'materiales'
  and (
    notes ~* '^Venta origen:\s*'
    or notes ~* '^Entrada origen:\s*'
  )
union all
select
  'credit_notes_generated_notes' as target,
  count(*) as remaining
from public.credit_notes
where branch_id = 2
  and business_unit = 'materiales'
  and notes ~* '^Venta origen:\s*'
union all
select
  'credit_payments_generated_notes' as target,
  count(*) as remaining
from public.credit_payments payment
join public.credit_notes note on note.id = payment.note_id
where note.branch_id = 2
  and note.business_unit = 'materiales'
  and payment.notes ~* '^Abono origen:\s*';

commit;
