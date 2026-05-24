# Núcleo · Estado Global y Carga

**Estado:** ✅ Hecho
**Archivos:** `App.tsx`, `services/supabaseClient.ts`

## Resumen
Todo el estado de entidades vive en `App.tsx` y baja por props (sin Redux/Zustand). Una sola función carga todo y se re-ejecuta ante eventos Realtime.

## Funcionalidades
- `loadGlobalData()` con `Promise.allSettled` (productos, clientes, ventas, tanques, vehículos, choferes, logs, sucursales).
- Suscripciones Realtime: `sales`, `product_stocks`, `customers`, `diesel_tanks`, `diesel_logs`, `vehicles`, `drivers`, `branches`.
- Sucursal seleccionada persistida en `localStorage` (`lopar_selected_branch`).
- Mapeo snake_case (DB) → camelCase (app). `Branch.id` = código; `Branch.dbId` = PK numérica.
- **Loader temático `AppLoading`** en arranque y carga inicial; gatea el montaje de módulos hasta tener sucursales resueltas (corrige errores "No se pudo cargar …" al refrescar).
- Remount keys por unidad de negocio para evitar estado obsoleto al cambiar de pestaña.

## Pendientes
- ❌ **RLS en Supabase**: sin Row Level Security; control solo en frontend. Riesgo de acceso directo vía PostgREST a datos de otras sucursales.
