create table if not exists public.cash_register_sessions (
  id uuid primary key default gen_random_uuid(),
  branch_id bigint not null,
  branch_code text,
  branch_name text,
  cashier_user_id text not null,
  cashier_name text not null,
  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  opening_cash numeric(12, 2) not null default 0,
  cash_sales_total numeric(12, 2) not null default 0,
  card_sales_total numeric(12, 2) not null default 0,
  transfer_sales_total numeric(12, 2) not null default 0,
  credit_sales_total numeric(12, 2) not null default 0,
  courtesy_total numeric(12, 2) not null default 0,
  discounts_total numeric(12, 2) not null default 0,
  cancellations_total numeric(12, 2) not null default 0,
  cancellations_count integer not null default 0,
  total_sold numeric(12, 2) not null default 0,
  expected_cash numeric(12, 2) not null default 0,
  delivered_cash numeric(12, 2),
  cash_difference numeric(12, 2),
  opening_observations text,
  closing_observations text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists cash_register_sessions_branch_opened_idx
  on public.cash_register_sessions (branch_id, opened_at desc);

create unique index if not exists cash_register_sessions_cashier_open_idx
  on public.cash_register_sessions (branch_id, cashier_user_id)
  where closed_at is null;
