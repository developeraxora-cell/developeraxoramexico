# Materiales · Inventario Físico

**Estado:** ✅ Hecho · **Ruta:** `/materiales/inventario`
**Archivos:** `components/Inventory/PhysicalInventoryScreen.tsx`, `services/inventory/physicalInventory.service.ts`, `services/pdf/physicalInventoryPdf.ts`

## Resumen
Conteos físicos de inventario con comparación contra stock de sistema y reporte PDF.

## Funcionalidades
- Crear inventarios (nombre, fecha inicio, fecha fin, estado activo/cerrado).
- Captura por producto: stock sistema, stock físico, diferencia, observación (obligatoria si hay diferencia).
- Resumen: total productos, sin diferencias, faltantes, sobrantes, % fiabilidad.
- % fiabilidad calculado solo con productos tipo `ANILLO`.
- PDF de reporte con estilo igual a la nota de venta (cabecera negra, tabla con bordes negros, resumen compacto y centrado). Abre en pestaña o descarga directa.
- Botón "Imprimir Reporte" como acción por fila en el historial (carga ítems on-demand).
- Historial con edición, cierre y eliminación de inventarios.

## Tablas
`material_physical_inventories`, `material_physical_inventory_items`.

## Pendientes
- ⚠️ Generalizar el % de fiabilidad (hoy acoplado al nombre `ANILLO`).
