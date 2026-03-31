create or replace function public.delete_inventory_purchase(
  p_purchase_id bigint,
  p_deleted_by text default null,
  p_delete_note text default null
)
returns table (
  deleted_purchase_id bigint,
  items_deleted integer,
  restored_qty_base numeric,
  restored_products jsonb
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_branch_id bigint;
  v_type text;
  v_items_deleted integer := 0;
  v_restored_qty_base numeric := 0;
  v_restored_products jsonb := '[]'::jsonb;
  v_has_stock_column boolean := false;
begin
  if p_purchase_id is null then
    raise exception 'Compra inválida.';
  end if;

  if nullif(trim(coalesce(p_delete_note, '')), '') is null then
    raise exception 'La observación es obligatoria para eliminar la compra.';
  end if;

  select branch_id, type
    into v_branch_id, v_type
  from public.inventory_transactions
  where id = p_purchase_id
  for update;

  if not found then
    raise exception 'No se encontró la compra indicada.';
  end if;

  if coalesce(v_type, '') <> 'PURCHASE' then
    raise exception 'El registro indicado no corresponde a una compra.';
  end if;

  create temporary table tmp_inventory_purchase_totals on commit drop as
  select
    iti.product_id,
    sum(coalesce(iti.qty_base, 0))::numeric as qty_base
  from public.inventory_transaction_items iti
  where iti.transaction_id = p_purchase_id
  group by iti.product_id;

  select
    count(*),
    coalesce(sum(coalesce(iti.qty_base, 0)), 0)
    into v_items_deleted, v_restored_qty_base
  from public.inventory_transaction_items iti
  where iti.transaction_id = p_purchase_id;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'product_id', t.product_id,
        'qty_base', t.qty_base
      )
      order by t.product_id
    ),
    '[]'::jsonb
  )
  into v_restored_products
  from tmp_inventory_purchase_totals t;

  insert into public.inventory_stock (branch_id, product_id, qty_base, updated_at)
  select v_branch_id, t.product_id, 0, now()
  from tmp_inventory_purchase_totals t
  on conflict (branch_id, product_id) do nothing;

  if exists (
    select 1
    from tmp_inventory_purchase_totals t
    join public.inventory_stock s
      on s.branch_id = v_branch_id
     and s.product_id = t.product_id
    where coalesce(s.qty_base, 0) < coalesce(t.qty_base, 0)
  ) then
    raise exception 'No se puede eliminar la compra porque parte del stock ya fue consumido.';
  end if;

  update public.inventory_stock s
  set qty_base = coalesce(s.qty_base, 0) - coalesce(t.qty_base, 0),
      updated_at = now()
  from tmp_inventory_purchase_totals t
  where s.branch_id = v_branch_id
    and s.product_id = t.product_id;

  select exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'products'
      and column_name = 'stock'
  )
  into v_has_stock_column;

  if v_has_stock_column then
    update public.products p
    set stock = s.qty_base,
        updated_at = now()
    from public.inventory_stock s
    join tmp_inventory_purchase_totals t
      on t.product_id = s.product_id
    where s.branch_id = v_branch_id
      and p.id = s.product_id;
  else
    update public.products p
    set updated_at = now()
    from tmp_inventory_purchase_totals t
    where p.id = t.product_id;
  end if;

  delete from public.inventory_transaction_items
  where transaction_id = p_purchase_id;

  delete from public.inventory_transactions
  where id = p_purchase_id;

  return query
  select p_purchase_id, v_items_deleted, v_restored_qty_base, v_restored_products;
end;
$$;

grant execute on function public.delete_inventory_purchase(bigint, text, text)
  to anon, authenticated, service_role;

create or replace function public.delete_concrete_purchase(
  p_purchase_id bigint,
  p_deleted_by text default null,
  p_delete_note text default null
)
returns table (
  deleted_purchase_id bigint,
  items_deleted integer,
  restored_qty_base numeric,
  restored_products jsonb
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_branch_id bigint;
  v_type text;
  v_items_deleted integer := 0;
  v_restored_qty_base numeric := 0;
  v_restored_products jsonb := '[]'::jsonb;
  v_has_stock_column boolean := false;
begin
  if p_purchase_id is null then
    raise exception 'Compra inválida.';
  end if;

  if nullif(trim(coalesce(p_delete_note, '')), '') is null then
    raise exception 'La observación es obligatoria para eliminar la compra.';
  end if;

  select branch_id, type
    into v_branch_id, v_type
  from public.concrete_inventory_transactions
  where id = p_purchase_id
  for update;

  if not found then
    raise exception 'No se encontró la compra indicada.';
  end if;

  if coalesce(v_type, '') <> 'PURCHASE' then
    raise exception 'El registro indicado no corresponde a una compra.';
  end if;

  create temporary table tmp_concrete_purchase_totals on commit drop as
  select
    iti.product_id,
    sum(coalesce(iti.qty_base, 0))::numeric as qty_base
  from public.concrete_inventory_transaction_items iti
  where iti.transaction_id = p_purchase_id
  group by iti.product_id;

  select
    count(*),
    coalesce(sum(coalesce(iti.qty_base, 0)), 0)
    into v_items_deleted, v_restored_qty_base
  from public.concrete_inventory_transaction_items iti
  where iti.transaction_id = p_purchase_id;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'product_id', t.product_id,
        'qty_base', t.qty_base
      )
      order by t.product_id
    ),
    '[]'::jsonb
  )
  into v_restored_products
  from tmp_concrete_purchase_totals t;

  insert into public.concrete_inventory_stock (branch_id, product_id, qty_base, updated_at)
  select v_branch_id, t.product_id, 0, now()
  from tmp_concrete_purchase_totals t
  on conflict (branch_id, product_id) do nothing;

  if exists (
    select 1
    from tmp_concrete_purchase_totals t
    join public.concrete_inventory_stock s
      on s.branch_id = v_branch_id
     and s.product_id = t.product_id
    where coalesce(s.qty_base, 0) < coalesce(t.qty_base, 0)
  ) then
    raise exception 'No se puede eliminar la compra porque parte del stock ya fue consumido.';
  end if;

  update public.concrete_inventory_stock s
  set qty_base = coalesce(s.qty_base, 0) - coalesce(t.qty_base, 0),
      updated_at = now()
  from tmp_concrete_purchase_totals t
  where s.branch_id = v_branch_id
    and s.product_id = t.product_id;

  select exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'concrete_products'
      and column_name = 'stock'
  )
  into v_has_stock_column;

  if v_has_stock_column then
    update public.concrete_products p
    set stock = s.qty_base,
        updated_at = now()
    from public.concrete_inventory_stock s
    join tmp_concrete_purchase_totals t
      on t.product_id = s.product_id
    where s.branch_id = v_branch_id
      and p.id = s.product_id;
  else
    update public.concrete_products p
    set updated_at = now()
    from tmp_concrete_purchase_totals t
    where p.id = t.product_id;
  end if;

  delete from public.concrete_inventory_transaction_items
  where transaction_id = p_purchase_id;

  delete from public.concrete_inventory_transactions
  where id = p_purchase_id;

  return query
  select p_purchase_id, v_items_deleted, v_restored_qty_base, v_restored_products;
end;
$$;

grant execute on function public.delete_concrete_purchase(bigint, text, text)
  to anon, authenticated, service_role;
