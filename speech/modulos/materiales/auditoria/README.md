# Materiales · Auditoría

**Estado:** ✅ Hecho · **Ruta:** `/materiales/auditorias`
**Archivos:** `components/Audit/AuditScreen.tsx`, `services/audit/*`

## Resumen
Bitácora de auditoría; los eventos se registran en MongoDB vía Edge Function.

## Funcionalidades
- Registro de acciones (entidad, acción, descripción).
- Detalle de eliminación de venta: producto, sku, unidad/presentación, tipo de venta, cantidad, factor, precio unitario, subtotal.
- Lectura/consulta de eventos (`audit-read.service.ts`).

## Infraestructura
- Edge Function `audit-log` (módulos: `materiales`, `concretera`, `transporteria`). URL configurable con `VITE_AUDIT_API_URL`.

## Pendientes
- ⚠️ En entornos nuevos: `supabase functions deploy audit-log`.
