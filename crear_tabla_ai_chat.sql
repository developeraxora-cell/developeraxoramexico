-- Historial de conversaciones del Asistente IA (Ollama)
-- Cada fila = una conversación. Los mensajes se guardan como STRING (JSON serializado)
-- en la columna `payload` para que pese poco.

create table if not exists public.ai_chat_histories (
  id            uuid primary key default gen_random_uuid(),
  user_id       text not null,
  business_unit text,
  branch_id     text,
  title         text,
  payload       text not null,          -- JSON.stringify(messages[])
  message_count integer not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- RLS: el proyecto confía el control de acceso al frontend (sin RLS en las demás
-- tablas). Desactivamos RLS aquí para evitar el error 42501 al insertar/actualizar.
alter table public.ai_chat_histories disable row level security;

create index if not exists ai_chat_histories_user_idx
  on public.ai_chat_histories (user_id, updated_at desc);

create index if not exists ai_chat_histories_unit_idx
  on public.ai_chat_histories (user_id, business_unit, updated_at desc);

-- Mantener updated_at fresco en cada UPDATE
create or replace function public.set_ai_chat_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_ai_chat_updated_at on public.ai_chat_histories;
create trigger trg_ai_chat_updated_at
  before update on public.ai_chat_histories
  for each row execute function public.set_ai_chat_updated_at();
