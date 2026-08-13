-- Staging para migrar la base antigua de Materiales Jesus Maria.
-- Ejecutar en Supabase antes de cargar los CSV generados.

create schema if not exists migration_materiales_jm;

create table if not exists public.migration_materiales_jm_id_map (
  entity text not null,
  legacy_id text not null,
  new_id text not null,
  created_at timestamp with time zone not null default now(),
  primary key (entity, legacy_id)
);

create table if not exists migration_materiales_jm.legacy_branches (
  legacy_id text primary key,
  code text not null,
  name text not null,
  address text,
  phone text,
  is_active boolean default true
);

create table if not exists migration_materiales_jm.legacy_categories (
  legacy_id text primary key,
  name text not null
);

create table if not exists migration_materiales_jm.legacy_uoms (
  legacy_id text primary key,
  code text not null,
  name text not null
);

create table if not exists migration_materiales_jm.legacy_suppliers (
  legacy_id text primary key,
  branch_legacy_id text not null,
  name text not null,
  phone text,
  email text,
  address text,
  notes text,
  is_active boolean default true,
  created_at timestamp with time zone
);

create table if not exists migration_materiales_jm.legacy_products (
  legacy_id text primary key,
  branch_legacy_id text not null,
  sku text not null,
  barcode text,
  name text not null,
  category_legacy_id text,
  base_uom_legacy_id text,
  purchase_price numeric default 0,
  wholesale_price numeric default 0,
  retail_price numeric default 0,
  min_stock numeric default 0,
  stock_qty numeric default 0,
  description text,
  is_divisible boolean default false,
  is_active boolean default true,
  created_at timestamp with time zone
);

create table if not exists migration_materiales_jm.legacy_product_uoms (
  legacy_id text primary key,
  product_legacy_id text not null,
  uom_legacy_id text not null,
  purpose text not null default 'BOTH',
  factor_to_base numeric not null default 1,
  wholesale_price numeric default 0,
  retail_price numeric default 0,
  is_default_purchase boolean default false,
  is_default_sale boolean default false
);

create table if not exists migration_materiales_jm.legacy_credit_customers (
  legacy_id text primary key,
  branch_legacy_id text not null,
  name text not null,
  phone text,
  address text,
  credit_limit numeric default 0,
  default_credit_days integer default 15,
  policy text default 'BLOQUEO_PARCIAL',
  allow_cash_if_blocked boolean default true,
  late_tolerance_days integer default 0,
  is_active boolean default true,
  created_at timestamp with time zone
);

create table if not exists migration_materiales_jm.legacy_inventory_transactions (
  legacy_id text primary key,
  tx_type text not null,
  branch_legacy_id text not null,
  supplier_legacy_id text,
  customer_legacy_id text,
  reference text,
  notes text,
  purchase_date date,
  is_credit boolean default false,
  nombre_cliente text,
  direccion_cliente text,
  payment_type text,
  wallet_amount numeric default 0,
  cash_amount numeric default 0,
  credit_amount numeric default 0,
  created_by text,
  created_at timestamp with time zone
);

create table if not exists migration_materiales_jm.legacy_inventory_transaction_items (
  legacy_id text primary key,
  transaction_legacy_id text not null,
  product_legacy_id text not null,
  product_uom_legacy_id text not null,
  qty numeric not null,
  factor_used numeric default 1,
  qty_base numeric default 0,
  unit_price numeric default 0,
  line_total numeric default 0,
  barcode_scanned text
);

create table if not exists migration_materiales_jm.legacy_credit_notes (
  legacy_id text primary key,
  sale_legacy_id text not null,
  customer_legacy_id text not null,
  folio text not null,
  sale_reference text,
  issue_date date not null,
  due_date date not null,
  credit_days_applied integer not null default 1,
  total numeric not null default 0,
  paid_amount numeric not null default 0,
  balance numeric not null default 0,
  notes text
);

create table if not exists migration_materiales_jm.legacy_credit_payments (
  legacy_id text primary key,
  note_legacy_id text not null,
  paid_at timestamp with time zone not null,
  amount numeric not null,
  method text not null default 'EFECTIVO',
  reference text,
  notes text
);
