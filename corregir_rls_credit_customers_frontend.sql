-- Ejecutar en Supabase SQL Editor.
--
-- Problema:
-- SQL Editor muestra clientes porque corre como postgres.
-- El frontend consulta por PostgREST con anon key:
--   /rest/v1/credit_customers?select=*&branch_id=eq.1&business_unit=eq.materiales
-- y recibe [] porque Row Level Security filtra las filas para el rol anon.
--
-- Este proyecto usa autenticacion propia en public.app_user_profiles/app_user_sessions,
-- no Supabase Auth. Por eso las policies basadas en auth.uid() no aplican al frontend.

-- 1) Diagnostico de policies actuales.
select
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
from pg_policies
where schemaname = 'public'
  and tablename in (
    'credit_customers',
    'credit_customer_addresses',
    'credit_notes',
    'credit_payments',
    'customer_wallets',
    'customer_wallet_movements'
  )
order by tablename, policyname;

-- 2) Grants necesarios para PostgREST con anon/authenticated.
grant select, insert, update, delete on public.credit_customers to anon, authenticated;
grant select, insert, update, delete on public.credit_customer_addresses to anon, authenticated;
grant select, insert, update, delete on public.credit_notes to anon, authenticated;
grant select, insert, update, delete on public.credit_payments to anon, authenticated;
grant select, insert, update, delete on public.customer_wallets to anon, authenticated;
grant select, insert, update, delete on public.customer_wallet_movements to anon, authenticated;

-- 3) Policies permisivas para el modelo actual de autenticacion propia.
--    Si ya existen, no se duplican.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'credit_customers'
      and policyname = 'lopar_app_credit_customers_all'
  ) then
    create policy lopar_app_credit_customers_all
      on public.credit_customers
      for all
      to anon, authenticated
      using (true)
      with check (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'credit_customer_addresses'
      and policyname = 'lopar_app_credit_customer_addresses_all'
  ) then
    create policy lopar_app_credit_customer_addresses_all
      on public.credit_customer_addresses
      for all
      to anon, authenticated
      using (true)
      with check (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'credit_notes'
      and policyname = 'lopar_app_credit_notes_all'
  ) then
    create policy lopar_app_credit_notes_all
      on public.credit_notes
      for all
      to anon, authenticated
      using (true)
      with check (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'credit_payments'
      and policyname = 'lopar_app_credit_payments_all'
  ) then
    create policy lopar_app_credit_payments_all
      on public.credit_payments
      for all
      to anon, authenticated
      using (true)
      with check (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'customer_wallets'
      and policyname = 'lopar_app_customer_wallets_all'
  ) then
    create policy lopar_app_customer_wallets_all
      on public.customer_wallets
      for all
      to anon, authenticated
      using (true)
      with check (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'customer_wallet_movements'
      and policyname = 'lopar_app_customer_wallet_movements_all'
  ) then
    create policy lopar_app_customer_wallet_movements_all
      on public.customer_wallet_movements
      for all
      to anon, authenticated
      using (true)
      with check (true);
  end if;
end;
$$;

-- 4) Prueba exacta que debe devolver filas igual que el frontend.
select
  id,
  branch_id,
  business_unit,
  name
from public.credit_customers
where branch_id = 1
  and business_unit = 'materiales'
order by name
limit 5;

select
  id,
  branch_id,
  business_unit,
  name
from public.credit_customers
where branch_id = 1
  and business_unit = 'transporteria'
order by name
limit 5;
