# Materiales · Productos / Inventario

**Estado:** ✅ Hecho · **Ruta:** `/materiales/productos`
**Archivos:** `components/Inventory/InventoryScreen.tsx`, `components/Inventory/NewProductModal.tsx`, `services/inventory/catalog.service.ts`, `services/conversionEngine.ts`, `services/uomEquivalence.ts`

## Resumen
Catálogo de productos y control de inventario por sucursal.

## Funcionalidades
- CRUD de productos (alta con modal `NewProductModal`).
- Catálogo: unidades (UoM), categorías, marcas, proveedores.
- Motor de conversión de unidades: directa → inversa → fallback global (ton↔kg).
- Equivalencias de UoM respaldadas en BD.
- Stock por sucursal en `product_stocks` (modificado solo por triggers).

## Pendientes
- Ninguno funcional.
