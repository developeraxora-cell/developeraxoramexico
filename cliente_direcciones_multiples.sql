create table if not exists public.credit_customer_addresses (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.credit_customers(id) on delete cascade,
  label text,
  address text not null,
  is_default boolean not null default false,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

create index if not exists credit_customer_addresses_customer_id_idx
  on public.credit_customer_addresses(customer_id);

create unique index if not exists credit_customer_addresses_default_unique_idx
  on public.credit_customer_addresses(customer_id)
  where is_default = true;

insert into public.credit_customer_addresses (customer_id, label, address, is_default)
select c.id, 'Principal', trim(c.address), true
from public.credit_customers c
where coalesce(trim(c.address), '') <> ''
  and not exists (
    select 1
    from public.credit_customer_addresses a
    where a.customer_id = c.id
  );

create table if not exists public.concrete_credit_customer_addresses (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.concrete_credit_customers(id) on delete cascade,
  label text,
  address text not null,
  is_default boolean not null default false,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

create index if not exists concrete_credit_customer_addresses_customer_id_idx
  on public.concrete_credit_customer_addresses(customer_id);

create unique index if not exists concrete_credit_customer_addresses_default_unique_idx
  on public.concrete_credit_customer_addresses(customer_id)
  where is_default = true;

insert into public.concrete_credit_customer_addresses (customer_id, label, address, is_default)
select c.id, 'Principal', trim(c.address), true
from public.concrete_credit_customers c
where coalesce(trim(c.address), '') <> ''
  and not exists (
    select 1
    from public.concrete_credit_customer_addresses a
    where a.customer_id = c.id
  );
