-- Archivo de referencia de la conversion ya ejecutada en Supabase.
-- Requiere las 19 notas documentales ya cargadas en public.historical_sales.
-- Convierte esas notas en ventas y notas de credito
-- normales de Jesus Maria Materiales. Excluye 2952 y 2959.
-- Una transaccion protege la operacion: ante cualquier error se revierte todo.

begin;

do $$
begin
  if (select count(*) from public.historical_sales
      where branch_id = 2 and business_unit = 'materiales'
        and folio in ('2892','2878','2943','2948','2961','2891','2906','2907','2908','2911','2912','2923','2926','2925','2937','2940','2851','2933','2895')) <> 19 then
    raise exception 'Faltan notas historicas: se requieren las 19 antes de convertirlas en ventas';
  end if;
end $$;

-- Bloquea escrituras simultaneas de existencias mientras se guarda y restaura
-- el estado exacto del inventario de la sucursal.
lock table public.inventory_stock, public.products in share row exclusive mode;
-- La aplicacion usa inventory_transactions.reference como numero visible.
-- Se bloquean nuevas ventas mientras se reserva el siguiente consecutivo de B2.
lock table public.inventory_transactions in share row exclusive mode;
create temporary table jm_stock_before on commit drop as
select branch_id, product_id, qty_base, updated_at
from public.inventory_stock where branch_id = 2;
create temporary table jm_products_before on commit drop as
select id, stock, updated_at
from public.products where branch_id = 2 and business_unit = 'materiales';

do $$
declare
  sale record;
  item record;
  payment record;
  v_sale_id bigint;
  v_note_id uuid;
  v_customer_id uuid;
  v_product_id bigint;
  v_product_uom_id bigint;
  v_factor numeric;
  v_expected_items integer;
  v_next_folio bigint;
  v_new_folio text;
begin
  select coalesce(max(tx.reference::bigint), 0) into v_next_folio
  from public.inventory_transactions tx
  where tx.branch_id = 2 and tx.business_unit = 'materiales'
    and tx.type = 'SALE' and coalesce(tx.is_deleted, false) = false
    and tx.reference ~ '^[0-9]+$';

  for sale in
    select hs.* from public.historical_sales hs
    where hs.branch_id = 2 and hs.business_unit = 'materiales'
      and hs.folio in ('2892','2878','2943','2948','2961','2891','2906','2907','2908','2911','2912','2923','2926','2925','2937','2940','2851','2933','2895')
    order by hs.folio::integer
  loop
    select count(*) into v_expected_items from public.historical_sale_items where historical_sale_id = sale.id;
    if v_expected_items = 0 then raise exception 'La nota % no tiene partidas', sale.folio; end if;

    select id, reference into v_sale_id, v_new_folio
    from public.inventory_transactions
    where branch_id = 2 and business_unit = 'materiales' and type = 'SALE'
      and notes = 'Venta recuperada de nota historica ' || sale.folio
      and coalesce(is_deleted, false) = false
    order by id limit 1;
    if v_sale_id is null then
      if exists (
        select 1 from public.inventory_transactions
        where branch_id = 2 and business_unit = 'materiales' and type = 'SALE'
          and reference in (sale.folio, 'MIG-JM-VENTA-' || sale.folio)
          and coalesce(is_deleted, false) = false
      ) then raise exception 'La venta antigua % ya existe como venta operativa; revisar antes de duplicar', sale.folio; end if;
      v_next_folio := v_next_folio + 1;
      v_new_folio := v_next_folio::text;
      insert into public.inventory_transactions (
        type, branch_id, business_unit, reference, notes, is_credit,
        nombre_cliente, direccion_cliente, payment_type, wallet_amount,
        cash_amount, credit_amount, is_deleted, created_by, created_at
      ) values (
        'SALE', 2, 'materiales', v_new_folio,
        'Venta recuperada de nota historica ' || sale.folio,
        true, sale.customer_name, sale.customer_address, 'CREDITO',
        0, 0, sale.total, false, sale.source_user, sale.issued_at
      ) returning id into v_sale_id;
    else
      if not exists (
        select 1 from public.inventory_transactions tx
        where tx.id = v_sale_id and lower(trim(tx.nombre_cliente)) = lower(trim(sale.customer_name))
      ) then raise exception 'El folio % ya pertenece a otra venta', sale.folio; end if;
    end if;

    for item in select * from public.historical_sale_items where historical_sale_id = sale.id order by id loop
      select new_id::bigint into v_product_id
      from public.migration_materiales_jm_id_map
      where entity = 'product' and legacy_id = item.product_legacy_id;
      if v_product_id is null then raise exception 'Producto antiguo % de nota % sin equivalencia', item.product_legacy_id, sale.folio; end if;
      select pu.id, pu.factor_to_base into v_product_uom_id, v_factor
      from public.product_uoms pu
      left join public.uoms u on u.id = pu.uom_id
      where pu.product_id = v_product_id
      order by case when lower(trim(u.name)) = lower(trim(coalesce(item.uom, ''))) then 0 else 1 end,
               case when pu.is_default_sale then 0 else 1 end, pu.id
      limit 1;
      if v_product_uom_id is null then raise exception 'Producto % de nota % sin presentacion', v_product_id, sale.folio; end if;
      if not exists (
        select 1 from public.inventory_transaction_items existing
        where existing.transaction_id = v_sale_id and existing.product_id = v_product_id
          and existing.qty = item.quantity and existing.line_total = item.line_total
      ) then
        insert into public.inventory_transaction_items (
          transaction_id, product_id, product_uom_id, qty, factor_used,
          qty_base, unit_price, line_total, barcode_scanned
        ) values (
          v_sale_id, v_product_id, v_product_uom_id, item.quantity,
          coalesce(v_factor, 1), item.quantity * coalesce(v_factor, 1),
          item.unit_price, item.line_total, null
        );
      end if;
    end loop;

    select coalesce(
      (select map.new_id::uuid from public.migration_materiales_jm_id_map map
       where map.entity = 'customer' and map.legacy_id = sale.customer_legacy_id
       limit 1),
      (select c.id from public.credit_customers c
       where c.branch_id = 2 and c.business_unit = 'materiales'
         and lower(trim(c.name)) = lower(trim(sale.customer_name))
       order by c.id limit 1)
    ) into v_customer_id;
    if v_customer_id is null then raise exception 'Cliente de nota % sin equivalencia', sale.folio; end if;

    select id into v_note_id from public.credit_notes
    where branch_id = 2 and business_unit = 'materiales' and inventory_transaction_id = v_sale_id
    order by id limit 1;
    if v_note_id is null then
      insert into public.credit_notes (
        branch_id, business_unit, customer_id, folio, sale_reference,
        issue_date, credit_days_applied, due_date, total, paid_amount,
        balance, notes, inventory_transaction_id
      ) values (
        2, 'materiales', v_customer_id, v_new_folio, sale.folio,
        sale.issued_at::date,
        case when sale.folio = '2851' then 15 else 30 end,
        sale.issued_at::date + case when sale.folio = '2851' then 15 else 30 end,
        sale.total, 0, sale.total,
        'Nota recuperada de venta historica ' || sale.folio, v_sale_id
      ) returning id into v_note_id;
    elsif not exists (
      select 1 from public.credit_notes n where n.id = v_note_id
        and n.inventory_transaction_id = v_sale_id and n.customer_id = v_customer_id
        and n.folio = v_new_folio and n.sale_reference = sale.folio
    ) then raise exception 'La nota % ya pertenece a otra venta o cliente', sale.folio;
    end if;

    for payment in select * from public.historical_sale_payments where historical_sale_id = sale.id loop
      if not exists (select 1 from public.credit_payments where reference = payment.reference and note_id = v_note_id) then
        insert into public.credit_payments (note_id, paid_at, amount, method, reference, notes)
        values (v_note_id, payment.paid_at, payment.amount,
          payment.method::public.credit_payment_method, payment.reference, payment.notes);
      end if;
    end loop;
    update public.credit_notes n set
      paid_amount = (select coalesce(sum(p.amount), 0) from public.credit_payments p where p.note_id = v_note_id),
      balance = greatest(0, sale.total - (select coalesce(sum(p.amount), 0) from public.credit_payments p where p.note_id = v_note_id))
    where n.id = v_note_id;
    if (select count(*) from public.inventory_transaction_items where transaction_id = v_sale_id) <> v_expected_items then
      raise exception 'La venta % no tiene las % partidas esperadas; operacion revertida', sale.folio, v_expected_items;
    end if;
  end loop;
end $$;

-- Si algun trigger movio existencias, se devuelve exactamente su valor previo.
update public.inventory_stock s set qty_base = b.qty_base, updated_at = b.updated_at
from jm_stock_before b
where s.branch_id = b.branch_id and s.product_id = b.product_id
  and (s.qty_base, s.updated_at) is distinct from (b.qty_base, b.updated_at);
delete from public.inventory_stock s where s.branch_id = 2
  and not exists (select 1 from jm_stock_before b where b.branch_id = s.branch_id and b.product_id = s.product_id);
update public.products p set stock = b.stock, updated_at = b.updated_at
from jm_products_before b where p.id = b.id
  and (p.stock, p.updated_at) is distinct from (b.stock, b.updated_at);

do $$
begin
  if exists (
    (select branch_id, product_id, qty_base, updated_at from public.inventory_stock where branch_id = 2
     except select * from jm_stock_before)
    union all
    (select * from jm_stock_before
     except select branch_id, product_id, qty_base, updated_at from public.inventory_stock where branch_id = 2)
  ) or exists (
    (select id, stock, updated_at from public.products where branch_id = 2 and business_unit = 'materiales'
     except select * from jm_products_before)
    union all
    (select * from jm_products_before
     except select id, stock, updated_at from public.products where branch_id = 2 and business_unit = 'materiales')
  ) then raise exception 'El inventario no coincide con el estado inicial; operacion revertida'; end if;
end $$;

commit;

select tx.reference as numero_venta, n.sale_reference as referencia_antigua,
       tx.nombre_cliente, tx.created_at::date as fecha,
       n.total, n.paid_amount as abonos, n.balance,
       (select count(*) from public.inventory_transaction_items i where i.transaction_id = tx.id) as partidas
from public.inventory_transactions tx
join public.credit_notes n on n.inventory_transaction_id = tx.id
where tx.branch_id = 2 and tx.business_unit = 'materiales'
  and n.sale_reference in ('2892','2878','2943','2948','2961','2891','2906','2907','2908','2911','2912','2923','2926','2925','2937','2940','2851','2933','2895')
order by tx.reference::integer;
