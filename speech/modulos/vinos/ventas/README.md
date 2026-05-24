# Vinos · Ventas / Caja

**Estado:** ✅ Hecho · **Ruta:** `/vinos/ventas`
**Archivos:** `components/Vinos/VinosPOSScreen.tsx` (1506 líneas), `services/vinos/sales.service.ts`, `services/vinos/saleTicketPdf.ts`

## Resumen
Punto de venta de Vinos con ticket PDF y manejo de crédito/saldo.

## Funcionalidades
- Carrito, métodos de pago, cobro.
- Ticket de venta en PDF.
- Rollback automático al editar método de pago: revierte saldo y crédito de la venta previa y aplica el nuevo con saldo/crédito del cliente actual.
