# Global · Sucursales

**Estado:** ✅ Hecho · **Ruta:** `/sucursales`
**Archivos:** `components/Branches/BranchesScreen.tsx`, `branchesService` en `services/supabaseClient.ts`

## Resumen
Administración de sucursales del grupo.

## Funcionalidades
- CRUD de sucursales (alta, edición, baja).
- `Branch.id` = código (ej. "MAT-01"); `Branch.dbId` = PK numérica para operaciones DB.
- Marca activa/inactiva; unidad de negocio por sucursal.
