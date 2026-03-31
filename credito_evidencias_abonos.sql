create table if not exists public.credit_payment_evidences (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references public.credit_payments(id) on delete cascade,
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

create index if not exists credit_payment_evidences_payment_id_idx
  on public.credit_payment_evidences (payment_id);

create index if not exists credit_payment_evidences_created_at_idx
  on public.credit_payment_evidences (created_at desc);

alter table public.credit_payment_evidences disable row level security;

grant select, insert, update, delete on public.credit_payment_evidences to anon, authenticated;
grant all on public.credit_payment_evidences to service_role;


create table if not exists public.concrete_credit_payment_evidences (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references public.concrete_credit_payments(id) on delete cascade,
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

create index if not exists concrete_credit_payment_evidences_payment_id_idx
  on public.concrete_credit_payment_evidences (payment_id);

create index if not exists concrete_credit_payment_evidences_created_at_idx
  on public.concrete_credit_payment_evidences (created_at desc);

alter table public.concrete_credit_payment_evidences disable row level security;

grant select, insert, update, delete on public.concrete_credit_payment_evidences to anon, authenticated;
grant all on public.concrete_credit_payment_evidences to service_role;
