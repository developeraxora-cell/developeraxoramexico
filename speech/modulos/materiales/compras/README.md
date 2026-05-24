# Materiales · Compras / Entradas

**Estado:** ✅ Hecho · **Ruta:** `/materiales/compras`
**Archivos:** `components/Inventory/PurchasesScreen.tsx`, `services/inventory/purchases.service.ts`

## Resumen
Registro de entradas/compras de mercancía con búsqueda amplia e historial.

## Funcionalidades
- Alta de entradas con proveedor, remisión y productos.
- Búsqueda por entrada, remisión, proveedor y monto total.
- Sin límite artificial de registros; paginación ajustada.
- Suma al stock vía triggers de `product_stocks`.

## Pendientes / Notas
- ⚠️ `business_unit` debe pasarse siempre explícito (bug histórico: default `materiales` mandaba ventas a la unidad equivocada).
