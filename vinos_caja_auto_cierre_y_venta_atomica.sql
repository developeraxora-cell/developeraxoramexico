-- Ejecutar en la base de datos de vinos / Casa Tahona.
-- 1) Cierra cajas abiertas vencidas a las 23:59:59 hora de Mexico.
-- 2) Crea ventas de forma atomica y descuenta stock con bloqueo de fila.

create or replace function public.close_expired_cash_register_sessions(p_branch_id bigint default null)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  session_row public.cash_register_sessions%rowtype;
  close_at timestamptz;
  summary record;
  closed_count integer := 0;
begin
  for session_row in
    select *
    from public.cash_register_sessions
    where closed_at is null
      and (p_branch_id is null or branch_id = p_branch_id)
    order by opened_at
  loop
    close_at := (
      ((session_row.opened_at at time zone 'America/Mexico_City')::date + time '23:59:59')
      at time zone 'America/Mexico_City'
    );

    if close_at > now() then
      continue;
    end if;

    select
      coalesce(sum(case when s.deleted_at is null and upper(coalesce(s.payment_method, '')) = 'EFECTIVO' then coalesce(s.total, 0) else 0 end), 0)::numeric(12, 2) as cash_sales_total,
      coalesce(sum(case when s.deleted_at is null and upper(coalesce(s.payment_method, '')) = 'TARJETA' then coalesce(s.total, 0) else 0 end), 0)::numeric(12, 2) as card_sales_total,
      coalesce(sum(case when s.deleted_at is null and upper(coalesce(s.payment_method, '')) in ('TRANSFERENCIA', 'TRANSFER', 'TRANSFERENCIAS') then coalesce(s.total, 0) else 0 end), 0)::numeric(12, 2) as transfer_sales_total,
      coalesce(sum(case when s.deleted_at is null and upper(coalesce(s.payment_method, '')) in ('CREDITO', 'CRÉDITO') then coalesce(s.total, 0) else 0 end), 0)::numeric(12, 2) as credit_sales_total,
      coalesce(sum(case when s.deleted_at is null and upper(coalesce(s.payment_method, '')) in ('CORTESIA', 'CORTESÍA') then coalesce(s.subtotal, 0) else 0 end), 0)::numeric(12, 2) as courtesy_total,
      coalesce(sum(case when s.deleted_at is null then coalesce(s.discount_amount, 0) else 0 end), 0)::numeric(12, 2) as discounts_total,
      coalesce(sum(case when s.deleted_at is not null then coalesce(s.total, 0) else 0 end), 0)::numeric(12, 2) as cancellations_total,
      count(*) filter (where s.deleted_at is not null)::integer as cancellations_count,
      coalesce(sum(case when s.deleted_at is null then coalesce(s.total, 0) else 0 end), 0)::numeric(12, 2) as total_sold
    into summary
    from public.sales s
    where s.branch_id = session_row.branch_id
      and s.created_by = session_row.cashier_user_id
      and s.created_at >= session_row.opened_at
      and s.created_at <= close_at;

    update public.cash_register_sessions
    set
      closed_at = close_at,
      cash_sales_total = summary.cash_sales_total,
      card_sales_total = summary.card_sales_total,
      transfer_sales_total = summary.transfer_sales_total,
      credit_sales_total = summary.credit_sales_total,
      courtesy_total = summary.courtesy_total,
      discounts_total = summary.discounts_total,
      cancellations_total = summary.cancellations_total,
      cancellations_count = summary.cancellations_count,
      total_sold = summary.total_sold,
      expected_cash = coalesce(opening_cash, 0) + summary.cash_sales_total,
      delivered_cash = coalesce(opening_cash, 0) + summary.cash_sales_total,
      cash_difference = 0,
      closing_observations = concat_ws(' | ', nullif(trim(closing_observations), ''), 'Cierre automatico a las 23:59 hora de Mexico.'),
      updated_at = close_at
    where id = session_row.id
      and closed_at is null;

    if found then
      closed_count := closed_count + 1;
    end if;
  end loop;

  return closed_count;
end;
$$;

grant execute on function public.close_expired_cash_register_sessions(bigint) to anon, authenticated;


create or replace function public.create_vinos_sale_atomic(p_sale jsonb, p_items jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sale_id uuid;
  v_branch_id bigint := (p_sale->>'branch_id')::bigint;
  v_customer_id uuid := nullif(p_sale->>'customer_id', '')::uuid;
  v_promotion_id uuid := nullif(p_sale->>'promotion_id', '')::uuid;
  v_coupon_code text := nullif(trim(coalesce(p_sale->>'coupon_code', '')), '');
  v_wallet_used numeric := coalesce((p_sale->>'wallet_used')::numeric, 0);
  required_row record;
  v_available numeric;
  v_product_name text;
begin
  if v_branch_id is null then
    raise exception 'Sucursal invalida para la venta.';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Agrega al menos un producto.';
  end if;

  for required_row in
    select
      item.product_id,
      sum(coalesce(item.qty_base, item.qty * coalesce(item.factor_used, 1))) as required_qty
    from jsonb_to_recordset(p_items) as item(
      product_id uuid,
      product_uom_id uuid,
      qty numeric,
      factor_used numeric,
      qty_base numeric,
      price_type text,
      unit_price numeric,
      line_total numeric
    )
    group by item.product_id
  loop
    select ps.qty, p.name
    into v_available, v_product_name
    from public.product_stocks ps
    left join public.products p on p.id = ps.product_id
    where ps.branch_id = v_branch_id
      and ps.product_id = required_row.product_id
    for update of ps;

    if not found or coalesce(v_available, 0) + 0.000001 < required_row.required_qty then
      select name into v_product_name
      from public.products
      where id = required_row.product_id;

      raise exception 'Stock insuficiente para "%". Disponible: %, solicitado: %.',
        coalesce(v_product_name, 'producto'),
        coalesce(v_available, 0),
        required_row.required_qty;
    end if;
  end loop;

  insert into public.sales (
    branch_id,
    customer_id,
    payment_method,
    price_type,
    subtotal,
    discount_amount,
    total,
    coupon_code,
    promotion_id,
    promotion_code,
    wallet_used,
    credit_used,
    cash_received,
    notes,
    delivery_address,
    created_by
  )
  values (
    v_branch_id,
    v_customer_id,
    nullif(p_sale->>'payment_method', ''),
    nullif(p_sale->>'price_type', ''),
    coalesce((p_sale->>'subtotal')::numeric, 0),
    coalesce((p_sale->>'discount_amount')::numeric, 0),
    coalesce((p_sale->>'total')::numeric, 0),
    v_coupon_code,
    v_promotion_id,
    nullif(trim(coalesce(p_sale->>'promotion_code', '')), ''),
    v_wallet_used,
    coalesce((p_sale->>'credit_used')::numeric, 0),
    coalesce((p_sale->>'cash_received')::numeric, 0),
    nullif(p_sale->>'notes', ''),
    nullif(p_sale->>'delivery_address', ''),
    nullif(p_sale->>'created_by', '')
  )
  returning id into v_sale_id;

  insert into public.sale_items (
    sale_id,
    product_id,
    product_uom_id,
    qty,
    factor_used,
    qty_base,
    price_type,
    unit_price,
    line_total
  )
  select
    v_sale_id,
    item.product_id,
    item.product_uom_id,
    item.qty,
    coalesce(item.factor_used, 1),
    coalesce(item.qty_base, item.qty * coalesce(item.factor_used, 1)),
    item.price_type,
    item.unit_price,
    coalesce(item.line_total, item.qty * item.unit_price)
  from jsonb_to_recordset(p_items) as item(
    product_id uuid,
    product_uom_id uuid,
    qty numeric,
    factor_used numeric,
    qty_base numeric,
    price_type text,
    unit_price numeric,
    line_total numeric
  );

  for required_row in
    select
      item.product_id,
      sum(coalesce(item.qty_base, item.qty * coalesce(item.factor_used, 1))) as required_qty
    from jsonb_to_recordset(p_items) as item(
      product_id uuid,
      product_uom_id uuid,
      qty numeric,
      factor_used numeric,
      qty_base numeric,
      price_type text,
      unit_price numeric,
      line_total numeric
    )
    group by item.product_id
  loop
    update public.product_stocks
    set qty = qty - required_row.required_qty
    where branch_id = v_branch_id
      and product_id = required_row.product_id;
  end loop;

  if v_wallet_used > 0 and v_customer_id is not null then
    insert into public.customer_wallet_movements (
      customer_id,
      amount,
      type,
      related_sale_id,
      notes,
      created_by
    )
    values (
      v_customer_id,
      -v_wallet_used,
      'USO',
      v_sale_id,
      'Uso en venta ' || v_sale_id::text,
      nullif(p_sale->>'created_by', '')
    );

    update public.customers
    set
      wallet_balance = greatest(0, coalesce(wallet_balance, 0) - v_wallet_used),
      updated_at = now()
    where id = v_customer_id;
  end if;

  if v_promotion_id is not null then
    update public.promotions
    set
      status = 'USADA',
      used_at = now(),
      sale_id = v_sale_id,
      redeemed_by = v_customer_id
    where id = v_promotion_id
      and status = 'ACTIVA';
  end if;

  if v_coupon_code is not null then
    update public.coupons
    set uses = coalesce(uses, 0) + 1
    where code = upper(v_coupon_code);
  end if;

  return v_sale_id;
end;
$$;

grant execute on function public.create_vinos_sale_atomic(jsonb, jsonb) to anon, authenticated;
