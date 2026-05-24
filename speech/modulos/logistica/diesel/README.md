# Logística · Gestión de Diésel

**Estado:** ✅ Hecho · **Ruta:** `/logistica/diesel`
**Archivos:** `components/Diesel/DieselScreen.tsx`, `DieselTankCard.tsx`, `EditCapacityModal.tsx`, `DeleteLogModal.tsx`

## Resumen
Control de combustible: tanques, despachos, recepciones e historial de movimientos.

## Funcionalidades
- Tarjetas de tanque con nivel actual vs capacidad; edición de capacidad.
- Despacho de diésel a vehículo/chofer (con odómetro) vía RPC `process_diesel_dispatch`.
- Recepción/entrada de diésel a tanque vía RPC `process_diesel_reception`.
- Historial de movimientos; archivado (soft-delete) con `archive_diesel_log`.
- Reinicio global de historial (mantiene flota y personal).
- Para `TRANSPORT_USER`, este módulo se muestra dentro del grupo TRANSPORTES.

## Tablas
`diesel_tanks`, `diesel_logs`, `vehicles`, `drivers`.

## Pendientes
- No hay otros submódulos de logística más allá de diésel.
