-- Casa Tahona: allow credit sales to be partially paid with another method.
-- Run this in the VINOS / Casa Tahona Supabase database before deploying the app change.

alter table public.sales
  add column if not exists split_payment_method text,
  add column if not exists split_payment_amount numeric not null default 0;

comment on column public.sales.split_payment_method is
  'Complementary payment method used when payment_method is CREDITO and only part of the sale becomes debt.';

comment on column public.sales.split_payment_amount is
  'Amount actually charged with split_payment_method, including card commission when applicable.';
