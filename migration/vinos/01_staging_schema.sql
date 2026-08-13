-- Staging persistente para normalizar datos de la base antigua antes de cargar a public.
-- Se puede ejecutar multiples veces.

create schema if not exists migration_vinos;

create extension if not exists pgcrypto;

create table if not exists public.migration_legacy_id_map (
  entity text not null,
  legacy_id text not null,
  new_uuid uuid not null default gen_random_uuid(),
  created_at timestamp with time zone not null default now(),
  primary key (entity, legacy_id),
  unique (new_uuid)
);

create or replace function migration_vinos.map_uuid(p_entity text, p_legacy_id text)
returns uuid
language plpgsql
as $$
declare
  v_uuid uuid;
begin
  if nullif(trim(p_legacy_id), '') is null then
    return null;
  end if;

  insert into public.migration_legacy_id_map (entity, legacy_id)
  values (p_entity, trim(p_legacy_id))
  on conflict (entity, legacy_id) do nothing;

  select new_uuid
    into v_uuid
  from public.migration_legacy_id_map
  where entity = p_entity
    and legacy_id = trim(p_legacy_id);

  return v_uuid;
end;
$$;

create table if not exists migration_vinos.legacy_branches (
  legacy_id text primary key,
  code text not null,
  name text not null,
  address text,
  phone text,
  is_active boolean default true
);

create table if not exists migration_vinos.legacy_categories (
  legacy_id text primary key,
  name text not null,
  sort_order integer default 0
);

create table if not exists migration_vinos.legacy_brands (
  legacy_id text primary key,
  name text not null
);

create table if not exists migration_vinos.legacy_uoms (
  legacy_id text primary key,
  name text not null,
  symbol text,
  sort_order integer default 0
);

create table if not exists migration_vinos.legacy_suppliers (
  legacy_id text primary key,
  name text not null,
  phone text,
  email text,
  address text,
  rfc text,
  notes text,
  is_active boolean default true
);

create table if not exists migration_vinos.legacy_products (
  legacy_id text primary key,
  sku text not null,
  barcode text,
  name text not null,
  brand_legacy_id text,
  brand_name text,
  category_legacy_id text,
  category_name text,
  uom_legacy_id text,
  uom_name text,
  origin_country text,
  volume_ml integer,
  alcohol_pct numeric,
  vintage_year integer,
  price_retail numeric default 0,
  price_mid_wholesale numeric default 0,
  price_wholesale numeric default 0,
  cost numeric default 0,
  purchase_cost numeric,
  min_stock numeric default 0,
  max_stock numeric default 9999,
  image_url text,
  notes text,
  is_active boolean default true,
  is_divisible boolean default false,
  price_mid_wholesale_min_qty numeric default 6,
  price_wholesale_min_qty numeric default 12,
  single_price_mode boolean default false
);

create table if not exists migration_vinos.legacy_product_stocks (
  product_legacy_id text not null,
  branch_legacy_id text not null,
  qty numeric default 0,
  primary key (product_legacy_id, branch_legacy_id)
);

create table if not exists migration_vinos.legacy_product_uoms (
  legacy_id text primary key,
  product_legacy_id text not null,
  uom_legacy_id text,
  uom_name text not null,
  factor_to_base numeric not null default 1,
  price_retail numeric not null default 0,
  price_mid_wholesale numeric not null default 0,
  price_wholesale numeric not null default 0,
  is_active boolean default true
);

create table if not exists migration_vinos.legacy_customers (
  legacy_id text primary key,
  branch_legacy_id text not null,
  name text not null,
  phone text,
  email text,
  birthday date,
  gender text,
  tags text[] default '{}'::text[],
  status text default 'ACTIVO',
  preferred_payment_method text,
  preferred_branch_legacy_id text,
  notes text,
  is_active boolean default true,
  customer_types text[] default array['vino']::text[],
  credit_limit numeric default 0,
  wallet_enabled boolean default false,
  wallet_balance numeric default 0,
  created_at timestamp with time zone
);

create table if not exists migration_vinos.legacy_sales (
  legacy_id text primary key,
  branch_legacy_id text not null,
  customer_legacy_id text,
  payment_method text not null default 'EFECTIVO',
  price_type text not null default 'MENUDEO',
  subtotal numeric not null default 0,
  discount_amount numeric default 0,
  total numeric not null default 0,
  delivery_address text,
  notes text,
  created_by uuid,
  created_at timestamp with time zone,
  deleted_at timestamp with time zone,
  delete_note text,
  coupon_code text,
  wallet_used numeric default 0,
  credit_used numeric default 0,
  cash_received numeric default 0,
  payment_type_audit jsonb default '[]'::jsonb,
  split_payment_method text,
  split_payment_amount numeric default 0
);

create table if not exists migration_vinos.legacy_sale_items (
  legacy_id text primary key,
  sale_legacy_id text not null,
  product_legacy_id text not null,
  product_uom_legacy_id text,
  qty numeric not null,
  price_type text not null default 'MENUDEO',
  unit_price numeric not null default 0,
  line_total numeric not null default 0,
  factor_used numeric default 1,
  qty_base numeric default 0
);

create table if not exists migration_vinos.legacy_credit_payments (
  legacy_id text primary key,
  sale_legacy_id text,
  customer_legacy_id text,
  amount numeric not null default 0,
  payment_method text not null default 'EFECTIVO',
  reference text,
  notes text,
  created_by uuid,
  created_at timestamp with time zone,
  deleted_at timestamp with time zone
);

create table if not exists migration_vinos.legacy_purchases (
  legacy_id text primary key,
  branch_legacy_id text not null,
  supplier_legacy_id text,
  reference text,
  purchase_date date,
  total numeric default 0,
  notes text,
  created_by uuid,
  created_at timestamp with time zone,
  deleted_at timestamp with time zone,
  delete_note text,
  is_credit boolean default false
);

create table if not exists migration_vinos.legacy_purchase_items (
  legacy_id text primary key,
  purchase_legacy_id text not null,
  product_legacy_id text not null,
  product_uom_legacy_id text,
  qty numeric not null,
  cost_per_unit numeric not null default 0,
  subtotal numeric not null default 0,
  factor_used numeric default 1,
  qty_base numeric default 0
);
