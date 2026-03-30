create table if not exists public.customer_selection_states (
  id uuid primary key default gen_random_uuid(),
  module text not null check (module in ('materials', 'concretera')),
  branch_id text not null,
  customer_id uuid not null,
  updated_by text,
  updated_by_name text,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint customer_selection_states_unique unique (module, branch_id, customer_id)
);

create index if not exists customer_selection_states_module_branch_idx
  on public.customer_selection_states (module, branch_id);

create index if not exists customer_selection_states_customer_idx
  on public.customer_selection_states (customer_id);

alter table public.customer_selection_states replica identity full;

do $$
begin
  begin
    alter publication supabase_realtime add table public.customer_selection_states;
  exception
    when duplicate_object then
      null;
    when undefined_object then
      null;
  end;
end $$;
