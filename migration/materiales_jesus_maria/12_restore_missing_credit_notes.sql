-- Reconstruct the 15 credit notes for Jesus Maria sales 4310..4326 that were
-- left without a note when their folios conflicted with recovered sales.
-- Customer IDs are taken from the original sale audit, not name matching.
-- The user confirmed these 15 sales received no payments. Each note starts
-- with its full recorded credit amount as the outstanding balance.

begin;

do $$
begin
  if to_regclass('public.inventory_transactions') is null
     or to_regclass('public.inventory_transaction_items') is null
     or to_regclass('public.credit_notes') is null
     or to_regclass('public.credit_customers') is null then
    raise exception 'Proyecto incorrecto: faltan tablas de Materiales. No se hizo ningun cambio.';
  end if;
end $$;

lock table public.inventory_transactions, public.credit_notes,
           public.credit_customers in share row exclusive mode;

create temporary table jm_missing_credit_notes_to_restore on commit drop as
select * from (values
  (9650::bigint, '4310'::text, '61f4cef1-4716-4cce-9e2f-a886ed0f1a34'::uuid, 16400.00::numeric),
  (9658, '4311', '994194cf-3631-4e55-81f3-5e7472eed4a3'::uuid, 1230.00),
  (9659, '4312', 'd6a9ac78-a081-4491-aaa1-0c1a6bc0e4c0'::uuid, 270.00),
  (9664, '4313', '90d88362-42de-486f-9399-18ab61fd2b4e'::uuid, 115.00),
  (9665, '4314', '90d88362-42de-486f-9399-18ab61fd2b4e'::uuid, 575.00),
  (9666, '4315', '95d3ab31-ad4b-4c12-b0e5-2ba380d33c0b'::uuid, 2400.00),
  (9670, '4316', '61f4cef1-4716-4cce-9e2f-a886ed0f1a34'::uuid, 9300.00),
  (9691, '4317', '244129ed-2db3-42ff-a90e-2256ccc4162c'::uuid, 2295.00),
  (9692, '4318', 'cb72915f-cd8c-4b26-a489-f9fa91b50f38'::uuid, 776.00),
  (9701, '4319', '994194cf-3631-4e55-81f3-5e7472eed4a3'::uuid, 1476.00),
  (9707, '4320', '994194cf-3631-4e55-81f3-5e7472eed4a3'::uuid, 2486.00),
  (9714, '4321', 'ef45371d-805d-4858-964b-3879fde3bbc0'::uuid, 2450.00),
  (9718, '4323', '2518e64f-d36f-4807-8148-b9776630cdd4'::uuid, 650.00),
  (9723, '4324', '0141ea57-9b73-4139-b39b-90e9d5e25251'::uuid, 20851.00),
  (9725, '4326', 'cdfe46f5-c56e-453a-9d43-b42a1baa90ba'::uuid, 3600.00)
) as expected(sale_id, folio, customer_id, amount);

do $$
begin
  if (select count(*) from jm_missing_credit_notes_to_restore) <> 15
     or (select count(distinct sale_id) from jm_missing_credit_notes_to_restore) <> 15
     or (select count(distinct folio) from jm_missing_credit_notes_to_restore) <> 15
     or (select sum(amount) from jm_missing_credit_notes_to_restore) <> 64874.00 then
    raise exception 'La lista de 15 ventas o su total no coincide. No se hizo ningun cambio.';
  end if;

  if exists (
    select 1
    from jm_missing_credit_notes_to_restore expected
    left join public.inventory_transactions sale on sale.id = expected.sale_id
    left join public.credit_customers customer on customer.id = expected.customer_id
    where sale.id is null or customer.id is null
       or sale.branch_id <> 2 or sale.business_unit <> 'materiales'
       or sale.type <> 'SALE' or coalesce(sale.is_deleted, false)
       or sale.reference is distinct from expected.folio
       or sale.payment_type is distinct from 'CREDITO'
       or sale.credit_amount is distinct from expected.amount
       or coalesce(sale.cash_amount, 0) <> 0
       or customer.branch_id <> 2 or customer.business_unit <> 'materiales'
       or lower(trim(customer.name)) <> lower(trim(sale.nombre_cliente))
       or coalesce(customer.default_credit_days, 0) < 1
       or (select coalesce(sum(item.line_total), 0)
           from public.inventory_transaction_items item
           where item.transaction_id = expected.sale_id) <> expected.amount
  ) then
    raise exception 'Cambio una venta, su cliente o su importe. No se hizo ningun cambio.';
  end if;

  if exists (
    select 1 from jm_missing_credit_notes_to_restore expected
    join public.credit_notes note
      on note.branch_id = 2 and note.business_unit = 'materiales'
     and (note.folio = expected.folio or note.inventory_transaction_id = expected.sale_id)
  ) then
    raise exception 'Ya existe una nota de credito para uno de estos folios o ventas. No se hizo ningun cambio.';
  end if;
end $$;

insert into public.credit_notes (
  branch_id, business_unit, customer_id, folio, sale_reference,
  issue_date, credit_days_applied, due_date, total, paid_amount,
  balance, notes, inventory_transaction_id
)
select 2, 'materiales', expected.customer_id, expected.folio, expected.folio,
       sale.created_at::date, customer.default_credit_days,
       sale.created_at::date + customer.default_credit_days::integer,
       expected.amount, 0, expected.amount,
       'Nota reconstruida tras corregir folio duplicado; sin abonos confirmados.',
       expected.sale_id
from jm_missing_credit_notes_to_restore expected
join public.inventory_transactions sale on sale.id = expected.sale_id
join public.credit_customers customer on customer.id = expected.customer_id;

do $$
begin
  if (select count(*) from public.credit_notes note
      join jm_missing_credit_notes_to_restore expected
        on note.inventory_transaction_id = expected.sale_id
      where note.customer_id = expected.customer_id
        and note.folio = expected.folio
        and note.total = expected.amount
        and note.balance = expected.amount) <> 15 then
    raise exception 'No se reconstruyeron las 15 notas esperadas. No se hizo ningun cambio.';
  end if;
end $$;

commit;

select note.folio, sale.nombre_cliente, note.total, note.paid_amount,
       note.balance, note.issue_date, note.due_date
from public.credit_notes note
join public.inventory_transactions sale on sale.id = note.inventory_transaction_id
where sale.id in (9650,9658,9659,9664,9665,9666,9670,9691,9692,9701,
                  9707,9714,9718,9723,9725)
order by note.folio::bigint;
