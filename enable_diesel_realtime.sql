-- ================================================================
-- HABILITACIÓN DE REALTIME PARA LOGÍSTICA DIESEL - GRUPO LOPAR
-- ================================================================
-- Ejecuta este script en el SQL Editor de Supabase para corregir
-- el problema de que el PC no se actualiza cuando el celular guarda datos.

begin;

-- 1. Asegurar que las tablas estén en la publicación 'supabase_realtime'
-- Esto permite que Supabase envíe notificaciones a la app
alter publication supabase_realtime add table diesel_tanks;
alter publication supabase_realtime add table diesel_logs;
alter publication supabase_realtime add table vehicles;
alter publication supabase_realtime add table drivers;

commit;

-- Confirmación visual
select '✅ Realtime habilitado exitosamente para Diesel' as status;
