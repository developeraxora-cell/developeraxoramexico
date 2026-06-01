-- Función para que el Asistente IA ejecute consultas SELECT generadas por el modelo.
-- Candados: solo SELECT/WITH, sin sentencias peligrosas, tope de 500 filas y timeout.
-- SECURITY DEFINER → corre como el dueño. NO hay RLS en el proyecto, así que el
-- filtrado por sucursal/unidad se hace en el prompt (no forzado aquí). Riesgo asumido.

create or replace function public.exec_readonly_sql(query text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  result jsonb;
  lowered text := lower(btrim(query));
  -- Versión sin literales entre comillas, para no dar falsos positivos al validar
  -- (ej. buscar un texto que contenga "update" o ";" dentro de comillas es válido).
  stripped text := regexp_replace(lower(btrim(query)), '''(''''|[^''])*''', '''''', 'g');
begin
  -- 1) Debe empezar con SELECT o WITH
  if lowered !~ '^(select|with)\s' then
    raise exception 'Solo se permiten consultas SELECT.';
  end if;

  -- 2) Prohibir múltiples sentencias (punto y coma fuera de literales)
  if btrim(rtrim(stripped, ';')) ~ ';' then
    raise exception 'No se permiten múltiples sentencias.';
  end if;

  -- 3) Prohibir palabras clave de escritura/DDL (fuera de literales)
  if stripped ~ '\m(insert|update|delete|drop|alter|truncate|create|grant|revoke|comment|copy|call|do|merge|vacuum|reindex|refresh|lock|set|begin|commit)\M' then
    raise exception 'Consulta no permitida (solo lectura).';
  end if;

  -- 4) Límite de tiempo por consulta
  set local statement_timeout = '8s';

  -- 5) Ejecutar envuelto: cualquier cosa que no sea SELECT válido falla aquí.
  --    Tope duro de 500 filas.
  execute format(
    'select coalesce(jsonb_agg(t), ''[]''::jsonb) from (select * from (%s) q limit 500) t',
    query
  ) into result;

  return result;
end;
$$;

-- Permitir que el rol anónimo (cliente del navegador) la invoque.
grant execute on function public.exec_readonly_sql(text) to anon, authenticated;
