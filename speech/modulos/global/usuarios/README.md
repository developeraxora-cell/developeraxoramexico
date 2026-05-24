# Global · Usuarios / Personal

**Estado:** ✅ Hecho · **Ruta:** `/usuarios`
**Archivos:** `components/Users/UsersScreen.tsx` (1176 líneas)

## Resumen
Gestión de empleados/usuarios y sus accesos.

## Funcionalidades
- CRUD de usuarios (alta, edición, baja irreversible).
- Asignación de rol, sucursales y unidades de negocio.
- Filtros por rol y estado (todos/activos/inactivos).
- Contraseñas vía RPC `app_set_user_password`.

## Tablas
`app_user_profiles`, `app_user_branch_access`, `app_user_business_unit_access`.
