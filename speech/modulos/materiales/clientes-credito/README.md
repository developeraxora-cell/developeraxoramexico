# Materiales · Clientes / Crédito

**Estado:** ✅ Hecho · **Ruta:** `/materiales/clientes`
**Archivos:** `components/Customers/CustomerScreen.tsx`, `services/credit/credit.service.ts`, `services/wallet.service.ts`, `components/Wallet/*`, `services/pdf/*`, `services/paymentEvidenceUpload.service.ts`

## Resumen
CRM de clientes con crédito, notas de crédito, abonos y monedero (saldo a favor).

## Funcionalidades
- Alta y gestión de clientes con límite de crédito y deuda actual.
- Notas de crédito vinculadas a ventas; corrección de folios históricos.
- Historial de abonos con búsqueda por folio o referencia.
- Wallet prepago (saldo a favor): recargas, historial, integración con ventas y abonos.
- PDFs: estado de cuenta, pagaré, historial de wallet (footer por sucursal).
- Evidencias de pago subidas a Cloudinary vía Edge Function.

## Tablas
`credit_notes`, `credit_payments`, `customer_wallets`, `customer_wallet_movements`.

## Pendientes
- Ninguno funcional.
