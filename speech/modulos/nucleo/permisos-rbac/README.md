# Núcleo · Permisos / RBAC

**Estado:** ✅ Hecho
**Archivos:** `services/auth/permissions.ts`, `services/auth/routes.ts`

## Resumen
Control de acceso por permisos granulares con forma `{businessUnit}.{moduleKey}.{action}`. El `role_key` es una etiqueta, no un candado: la visibilidad real viene de las tablas de acceso en BD.

## Funcionalidades
- `userCanAccess`, `userCanAccessTab`, `firstAccessibleTab`, `userCanAccessBranch`.
- `ADMIN` y `SUPERADMIN` saltan toda verificación (`isFullAccessRole`).
- `VINOS_ADMIN` limitado exclusivamente a la unidad `vinos`.
- Mapa `TAB_PERMISSIONS`: tab → {businessUnit, moduleKey, action}.
- Mapa `TAB_PATHS`: tab → ruta URL (y `PATH_TO_TAB` inverso).
- Acceso por sucursal vía `allowedBranchIds` (códigos) y `allowedBranchDbIds` (PKs).

## Tablas
`app_user_business_unit_access`, `app_user_branch_access` (fuente real de acceso, no `role_key`).

## Roles
`SUPERADMIN`, `ADMIN`, `SOCIO`, `MATERIALS_USER`, `CONCRETE_USER`, `TRANSPORT_USER`, `CAJERO`, `ALMACEN`, `VINOS_ADMIN`.

## Pendientes
- Ninguno funcional. (Ver seguridad RLS en Estado Global / backlog.)
