create extension if not exists pgcrypto;

create table if not exists public.inventory_transaction_evidences (
  id uuid primary key default gen_random_uuid(),
  transaction_id bigint not null references public.inventory_transactions(id) on delete cascade,
  file_url text not null,
  secure_url text,
  public_id text,
  resource_type text not null default 'image',
  format text,
  original_filename text,
  bytes bigint,
  uploaded_by text,
  created_at timestamp with time zone not null default now()
);

create index if not exists inventory_transaction_evidences_transaction_id_idx
  on public.inventory_transaction_evidences (transaction_id);

create index if not exists inventory_transaction_evidences_created_at_idx
  on public.inventory_transaction_evidences (created_at desc);

alter table public.inventory_transaction_evidences disable row level security;
grant select, insert, update, delete on public.inventory_transaction_evidences to anon, authenticated;
grant all on public.inventory_transaction_evidences to service_role;

create table if not exists public.concrete_inventory_transaction_evidences (
  id uuid primary key default gen_random_uuid(),
  transaction_id bigint not null references public.concrete_inventory_transactions(id) on delete cascade,
  file_url text not null,
  secure_url text,
  public_id text,
  resource_type text not null default 'image',
  format text,
  original_filename text,
  bytes bigint,
  uploaded_by text,
  created_at timestamp with time zone not null default now()
);

create index if not exists concrete_inventory_transaction_evidences_transaction_id_idx
  on public.concrete_inventory_transaction_evidences (transaction_id);

create index if not exists concrete_inventory_transaction_evidences_created_at_idx
  on public.concrete_inventory_transaction_evidences (created_at desc);

alter table public.concrete_inventory_transaction_evidences disable row level security;
grant select, insert, update, delete on public.concrete_inventory_transaction_evidences to anon, authenticated;
grant all on public.concrete_inventory_transaction_evidences to service_role;
