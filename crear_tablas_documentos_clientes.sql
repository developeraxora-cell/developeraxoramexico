begin;

create extension if not exists pgcrypto;

create table if not exists public.credit_customer_documents (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.credit_customers(id) on delete cascade,
  slot integer not null check (slot in (1, 2)),
  file_url text not null,
  secure_url text,
  public_id text,
  resource_type text not null,
  format text,
  original_filename text,
  bytes bigint,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

create unique index if not exists credit_customer_documents_customer_slot_idx
  on public.credit_customer_documents(customer_id, slot);

create index if not exists credit_customer_documents_customer_id_idx
  on public.credit_customer_documents(customer_id);

create table if not exists public.concrete_credit_customer_documents (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.concrete_credit_customers(id) on delete cascade,
  slot integer not null check (slot in (1, 2)),
  file_url text not null,
  secure_url text,
  public_id text,
  resource_type text not null,
  format text,
  original_filename text,
  bytes bigint,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

create unique index if not exists concrete_credit_customer_documents_customer_slot_idx
  on public.concrete_credit_customer_documents(customer_id, slot);

create index if not exists concrete_credit_customer_documents_customer_id_idx
  on public.concrete_credit_customer_documents(customer_id);

commit;
