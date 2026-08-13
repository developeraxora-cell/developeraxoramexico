-- Repara renglones faltantes de ventas/compras migradas desde staging.
-- Usa los mapas existentes, pero hace fallback por SKU y por UOM por defecto
-- para no saltar items cuando falte un product_uom en migration_materiales_jm_id_map.

begin;

insert into public.uoms (code, name)
select 'MIG', 'Unidad migrada'
where not exists (
  select 1
  from public.uoms existing
  where lower(trim(existing.code)) = 'mig'
);

update public.uoms
set name = 'Unidad migrada'
where lower(trim(code)) = 'mig';

with resolved_products as (
  select distinct
    product_row.id as product_id,
    coalesce(product_row.base_uom_id, fallback_uom.id) as uom_id,
    coalesce(product_row.wholesale_price, product_row.precio, 0) as wholesale_price,
    coalesce(product_row.retail_price, product_row.precio, 0) as retail_price
  from migration_materiales_jm.legacy_inventory_transaction_items i
  join public.migration_materiales_jm_id_map transaction_map
    on transaction_map.entity = 'transaction'
   and transaction_map.legacy_id = i.transaction_legacy_id
  join public.inventory_transactions tx
    on tx.id = transaction_map.new_id::bigint
  join migration_materiales_jm.legacy_products legacy_product
    on legacy_product.legacy_id = i.product_legacy_id
  left join public.migration_materiales_jm_id_map product_map
    on product_map.entity = 'product'
   and product_map.legacy_id = i.product_legacy_id
  left join public.products product_by_map
    on product_by_map.id = case
      when product_map.new_id ~ '^[0-9]+$' then product_map.new_id::bigint
      else null
    end
  left join lateral (
    select matched.*
    from public.products matched
    where matched.branch_id = tx.branch_id
      and coalesce(matched.business_unit, 'materiales') = 'materiales'
      and (
        lower(trim(coalesce(matched.sku, ''))) = lower(trim(legacy_product.sku))
        or (
          nullif(trim(legacy_product.barcode), '') is not null
          and lower(trim(coalesce(matched.barcode, ''))) = lower(trim(legacy_product.barcode))
        )
      )
    order by
      case when lower(trim(coalesce(matched.sku, ''))) = lower(trim(legacy_product.sku)) then 0 else 1 end,
      matched.id
    limit 1
  ) product_by_source on product_by_map.id is null
  join lateral (
    select
      coalesce(product_by_map.id, product_by_source.id) as id,
      coalesce(product_by_map.base_uom_id, product_by_source.base_uom_id) as base_uom_id,
      coalesce(product_by_map.wholesale_price, product_by_source.wholesale_price) as wholesale_price,
      coalesce(product_by_map.retail_price, product_by_source.retail_price) as retail_price,
      coalesce(product_by_map.precio, product_by_source.precio) as precio
  ) product_row on product_row.id is not null
  join lateral (
    select u.id
    from public.uoms u
    where lower(trim(u.code)) = 'mig'
    order by u.id
    limit 1
  ) fallback_uom on true
  where not exists (
    select 1
    from public.product_uoms existing
    where existing.product_id = product_row.id
  )
)
insert into public.product_uoms (
  product_id,
  uom_id,
  purpose,
  factor_to_base,
  wholesale_price,
  retail_price,
  is_default_purchase,
  is_default_sale
)
select
  product_id,
  uom_id,
  'BOTH',
  1,
  wholesale_price,
  retail_price,
  true,
  true
from resolved_products
where uom_id is not null
on conflict (product_id, uom_id) do update
set
  purpose = excluded.purpose,
  factor_to_base = excluded.factor_to_base,
  wholesale_price = excluded.wholesale_price,
  retail_price = excluded.retail_price;

do $$
declare
  r record;
  v_id bigint;
begin
  for r in
    with resolved_items as (
      select
        i.legacy_id,
        tx.id as transaction_id,
        product_row.id as product_id,
        coalesce(product_uom_by_map.id, fallback_product_uom.id) as product_uom_id,
        i.qty,
        coalesce(i.factor_used, 1) as factor_used,
        coalesce(nullif(i.qty_base, 0), i.qty * coalesce(i.factor_used, 1)) as qty_base,
        coalesce(i.unit_price, 0) as unit_price,
        coalesce(i.line_total, i.qty * coalesce(i.unit_price, 0)) as line_total,
        nullif(trim(i.barcode_scanned), '') as barcode_scanned,
        coalesce(item_by_map.id, item_by_signature.id) as existing_item_id
      from migration_materiales_jm.legacy_inventory_transaction_items i
      join public.migration_materiales_jm_id_map transaction_map
        on transaction_map.entity = 'transaction'
       and transaction_map.legacy_id = i.transaction_legacy_id
      join public.inventory_transactions tx
        on tx.id = transaction_map.new_id::bigint
      join migration_materiales_jm.legacy_products legacy_product
        on legacy_product.legacy_id = i.product_legacy_id
      left join public.migration_materiales_jm_id_map product_map
        on product_map.entity = 'product'
       and product_map.legacy_id = i.product_legacy_id
      left join public.products product_by_map
        on product_by_map.id = case
          when product_map.new_id ~ '^[0-9]+$' then product_map.new_id::bigint
          else null
        end
      left join lateral (
        select matched.id
        from public.products matched
        where matched.branch_id = tx.branch_id
          and coalesce(matched.business_unit, 'materiales') = 'materiales'
          and (
            lower(trim(coalesce(matched.sku, ''))) = lower(trim(legacy_product.sku))
            or (
              nullif(trim(legacy_product.barcode), '') is not null
              and lower(trim(coalesce(matched.barcode, ''))) = lower(trim(legacy_product.barcode))
            )
          )
        order by
          case when lower(trim(coalesce(matched.sku, ''))) = lower(trim(legacy_product.sku)) then 0 else 1 end,
          matched.id
        limit 1
      ) product_by_source on product_by_map.id is null
      join lateral (
        select coalesce(product_by_map.id, product_by_source.id) as id
      ) product_row on product_row.id is not null
      left join public.migration_materiales_jm_id_map product_uom_map
        on product_uom_map.entity = 'product_uom'
       and product_uom_map.legacy_id = i.product_uom_legacy_id
      left join public.product_uoms product_uom_by_map
        on product_uom_by_map.id = case
          when product_uom_map.new_id ~ '^[0-9]+$' then product_uom_map.new_id::bigint
          else null
        end
       and product_uom_by_map.product_id = product_row.id
      left join lateral (
        select pu.id
        from public.product_uoms pu
        where pu.product_id = product_row.id
        order by
          coalesce(pu.is_default_sale, false) desc,
          abs(coalesce(pu.factor_to_base, 1) - coalesce(nullif(i.factor_used, 0), 1)),
          pu.id
        limit 1
      ) fallback_product_uom on product_uom_by_map.id is null
      left join public.migration_materiales_jm_id_map item_map
        on item_map.entity = 'transaction_item'
       and item_map.legacy_id = i.legacy_id
      left join public.inventory_transaction_items item_by_map
        on item_by_map.id = case
          when item_map.new_id ~ '^[0-9]+$' then item_map.new_id::bigint
          else null
        end
      left join lateral (
        select existing.id
        from public.inventory_transaction_items existing
        where existing.transaction_id = tx.id
          and existing.product_id = product_row.id
          and existing.product_uom_id is not distinct from coalesce(product_uom_by_map.id, fallback_product_uom.id)
          and coalesce(existing.qty, 0) = coalesce(i.qty, 0)
          and coalesce(existing.unit_price, 0) = coalesce(i.unit_price, 0)
          and coalesce(existing.line_total, 0) = coalesce(i.line_total, i.qty * coalesce(i.unit_price, 0), 0)
        order by existing.id
        limit 1
      ) item_by_signature on item_by_map.id is null
    )
    select *
    from resolved_items
  loop
    if r.existing_item_id is null then
      insert into public.inventory_transaction_items (
        transaction_id,
        product_id,
        product_uom_id,
        qty,
        factor_used,
        qty_base,
        unit_price,
        line_total,
        barcode_scanned
      )
      values (
        r.transaction_id,
        r.product_id,
        r.product_uom_id,
        r.qty,
        r.factor_used,
        r.qty_base,
        r.unit_price,
        r.line_total,
        r.barcode_scanned
      )
      returning id into v_id;
    else
      update public.inventory_transaction_items
      set
        transaction_id = r.transaction_id,
        product_id = r.product_id,
        product_uom_id = r.product_uom_id,
        qty = r.qty,
        factor_used = r.factor_used,
        qty_base = r.qty_base,
        unit_price = r.unit_price,
        line_total = r.line_total,
        barcode_scanned = r.barcode_scanned
      where id = r.existing_item_id
      returning id into v_id;
    end if;

    insert into public.migration_materiales_jm_id_map (entity, legacy_id, new_id)
    values ('transaction_item', r.legacy_id, v_id::text)
    on conflict (entity, legacy_id) do update set new_id = excluded.new_id;
  end loop;
end;
$$;

select
  cn.folio,
  cn.inventory_transaction_id,
  tx.reference,
  count(item.id) as items,
  coalesce(sum(item.line_total), 0) as total_items
from public.credit_notes cn
join public.inventory_transactions tx
  on tx.id = cn.inventory_transaction_id
left join public.inventory_transaction_items item
  on item.transaction_id = tx.id
where cn.folio = 'MIG-JM-CRED-2027'
group by cn.folio, cn.inventory_transaction_id, tx.reference;

select count(*) as credit_notes_sin_items
from public.credit_notes note
where note.branch_id = 2
  and note.business_unit = 'materiales'
  and note.inventory_transaction_id is not null
  and not exists (
    select 1
    from public.inventory_transaction_items item
    where item.transaction_id = note.inventory_transaction_id
  );

commit;
