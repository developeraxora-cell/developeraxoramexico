# Materiales · Ventas / Caja (POS)

**Estado:** ✅ Hecho · **Ruta:** `/materiales/ventas`
**Archivos:** `components/POS/POSScreen.tsx`, `services/inventory/purchases.service.ts`, `services/pdf/promissoryNotePdf.ts`

## Resumen
Punto de venta de Materiales: arma carrito, cobra y emite NOTA DE VENTA en PDF.

## Funcionalidades
- Búsqueda de productos y armado de carrito con conversión de unidades.
- Métodos de pago: LIQUIDADO, CRÉDITO, SIN COSTO.
- PDF NOTA DE VENTA (pdf-lib) con footer por sucursal y título por unidad de negocio.
- PAGARÉ MERCANTIL adjunto para ventas a crédito.
- Ajuste rápido de stock desde la venta (modal con observación; conserva el carrito).
- Subtotales por `line_total` con fallback a `qty * unit_price`.
- `business_unit` enviado explícito al crear la venta.

## Tablas
`inventory_transactions` (ventas), `product_stocks` (actualizado por triggers).

## Pendientes / Notas
- ⚠️ Errores TS preexistentes en el archivo (no son regresión).
