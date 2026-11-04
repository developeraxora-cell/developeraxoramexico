# Consumo — Casa Tahona

Implementación basada en `consumo.html`. La migración se entrega para la base independiente de VINOS; no se ha ejecutado en producción.

## Activación

1. Respaldar la base de VINOS y comprobar primero en una copia con el esquema real.
2. Ejecutar **una sola vez** `vinos_consumo.sql` en el SQL Editor del proyecto VINOS. El archivo completo es una transacción; si falla, no aplicar fragmentos por separado. No ejecutarlo en Materiales ni en el proyecto de auditoría.
3. Para cancelar salidas abiertas, ejecutar `vinos_consumo_cancelacion.sql` después de la migración principal. Es aditiva y conserva las tablas existentes.
4. Publicar el frontend después de las migraciones. El acceso es Casa Tahona → Consumo (`/vinos/consumo`), con el permiso existente de ventas de VINOS.
5. Probar salida, cancelación, devolución parcial, crédito, ticket y corte de caja con un cliente de prueba antes de operar.

El script agrega `customers.credit_days` con 30 días predeterminados y `sales.credit_due_date`. Completa las fechas faltantes de créditos existentes usando la fecha original de venta en México más el plazo del cliente. Revisar esa regla contra los acuerdos históricos antes de ejecutar. Los plazos particulares pueden configurarse en `customers.credit_days`; las ventas futuras toman ese valor. No se modifica el stock histórico al instalar.

## Operación e integraciones

- Nueva salida: cliente activo de la sucursal, fecha límite elegida por el operador, piezas enteras y precio pactado. Usa unidades base con factor 1; las presentaciones por bulto no se convierten automáticamente.
- Al confirmar se descuenta stock y se registra el movimiento y su responsable dentro de la misma transacción. Se imprime el ticket de salida.
- Productos muestra **En consumo** con las piezas de consumos abiertos. Ese número ya está descontado del stock disponible.
- Liquidación: se capturan las piezas que regresan. Solo esas piezas vuelven al stock. Se crea una venta normal con las piezas consumidas, sin otro descuento de existencias.
- La venta usa `sales` y `sale_items`, el cliente y el cajero actuales, y la fecha de liquidación. Así participa en las consultas existentes de Ventas, Reportes, CRM y caja. No representa un nuevo programa de puntos/promociones.
- Toda liquidación con piezas consumidas exige caja abierta del cajero en el día operativo de México. Una devolución total cierra el consumo sin venta ficticia ni obligación de caja.
- Métodos: efectivo, tarjeta, transferencia y crédito. Crédito muestra autorizado, saldo y disponible; el servidor vuelve a comprobar autorización, vencimiento y capacidad antes de confirmar. El cargo se incorpora al saldo de créditos existente.
- Los abonos asociados a una venta cubren esa venta. Para determinar vencimientos, los abonos generales cubren primero deuda vencida, luego deuda sin fecha y después vigente. No se reasignan registros de pagos.
- Nueva salida bloqueada por consumo vencido o crédito vencido; también se bloquea si queda deuda con vencimiento desconocido. Una salida pendiente no constituye todavía deuda de crédito.
- Alertas visibles dentro de Casa Tahona para vencimientos del día y consumos vencidos, actualizadas cada minuto mientras la aplicación está abierta. No se envían correos, WhatsApp ni notificaciones con la aplicación cerrada.
- Ambos tickets se pueden reimprimir desde Detalle. Usan el diálogo de impresión del navegador y formato de 80 mm; permitir ventanas emergentes y seleccionar la impresora. Falta validar físicamente el modelo de impresora del negocio.

## Trazabilidad y límites

`vinos_consumption_movements` conserva salida/devolución, cantidades, stock anterior/posterior, responsable y fecha. Los movimientos aparecen en estadísticas del producto; la venta de liquidación se identifica con movimiento de stock cero. Estos registros están en VINOS, no en MongoDB.

Las operaciones usan bloqueos y transacciones. Reintentar una salida con el mismo identificador no duplica el descuento; cambiar sus datos después de guardarla se rechaza. Repetir una liquidación ya confirmada devuelve la venta original.

Las ventas ligadas a consumos liquidados no admiten la cancelación convencional, porque esta repondría stock sin conciliar el consumo. Un flujo de reversión de liquidaciones no forma parte de esta entrega.

Una salida abierta sí puede eliminarse desde su fila. La acción solicita una observación, la registra primero en Auditoría y luego devuelve todas las piezas al stock dentro de una transacción. El folio queda cancelado con fecha, responsable y motivo en VINOS, y deja de aparecer en la lista general. Las liquidaciones no se pueden cancelar desde esta acción.

Se conserva la autenticación externa actual de VINOS: lectura con `anon`/`authenticated`, escritura de Consumo mediante RPC y responsable enviado por la aplicación. No se ha incorporado autenticación Supabase por usuario ni una nueva frontera de permisos de sucursal. Las pruebas no acreditan la seguridad global del sistema ni corrigen las operaciones antiguas de stock del POS.

## Verificación local

- `npm run build`.
- `node --test tests/vinosProductReturnHistory.test.cjs`.
- Instalar utilidades aisladas: `npm install --prefix /tmp/tahona-consumption-tests @electric-sql/pglite playwright`.
- `node tests/vinosConsumption.integration.mjs`: ejecuta la migración real sobre PostgreSQL local embebido, con un esquema de prueba. Verifica stock, retornos, crédito, caja, bloqueos, permisos y reintentos; no escribe en Supabase.
- `node tests/vinosConsumption.browser.mjs`: requiere Vite en el puerto 5174 y Chromium en la ruta indicada en el archivo. Verifica escritorio/móvil sobre datos simulados de `tests/consumption.preview.html`.

La vista de prueba no conecta con datos reales. Las pruebas locales no sustituyen la comprobación del esquema, triggers y políticas de la base de producción.
