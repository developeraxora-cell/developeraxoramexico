# Núcleo · Layout / Sidebar

**Estado:** ✅ Hecho
**Archivos:** `components/Layout.tsx`

## Resumen
Marco de navegación con sidebar agrupado por unidad de negocio y reglas de visibilidad especiales.

## Funcionalidades
- Sidebar colapsado por defecto; solo muestra encabezados de módulo al entrar.
- Grupos: Materiales, Concretera, Logística, Transportes, Vinos, Global.
- TRANSPORTES visible solo cuando la sucursal activa incluye "DEGOLLADO" (`isDegolladoBranch`).
- Para `TRANSPORT_USER`, Logística (Diésel) se fusiona dentro del grupo TRANSPORTES; el grupo Logística se oculta.
- Selector de sucursal activa en la barra superior.

## Pendientes
- Ninguno funcional.
