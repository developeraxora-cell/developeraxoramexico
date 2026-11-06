# Migración de Concretera Jesús María

Origen: `concre45_crm.sql` (phpMyAdmin, 4 de noviembre de 2026). Destino:
`branches.id = 2`, `code = B2`, tablas `public.concrete_*`.

## Datos auditados

| Entidad | Filas |
|---|---:|
| Productos | 38 |
| Presentaciones | 62 |
| Clientes | 128 |
| Ventas | 2221 (2024 activas, 197 canceladas) |
| Partidas | 2528 |
| Abonos | 1770 |

Hay 192 ventas a crédito activas. Los abonos de ventas de contado no se cargan
en `concrete_credit_payments`: la venta ya registra su pago en efectivo. En
origen no hay proveedores ni compras. El extractor verifica que no falten
clientes, ventas, presentaciones ni productos referenciados.

La prueba local en PostgreSQL 16 cargó el respaldo dos veces con 37 productos
preexistentes. En ambas ejecuciones coincidieron los conteos, ventas
(`29,976,100.00`), partidas (`29,976,100.00`), pagos de crédito (`11,100.00`)
y saldo de crédito activo (`2,548,975.00`).

El respaldo trae 22 productos con stock negativo (−14,216 unidades en total).
El destino exige stock no negativo: se importa cero para esos productos y se
conserva el valor original en `migration_concretera_jm_stock_deficits` para su
conciliación. Los otros productos suman 7 unidades; por eso el stock operativo
inicial total es 7, aunque la suma del respaldo sea −14,209.
El producto IMPER 3% también tiene un mínimo de stock `-1` en origen. Se importa
como `0` y el valor `-1` queda registrado en la misma tabla de conciliación.
Once clientes tienen `diascredito = 0` y `status_credito = 0` en origen; ninguno
tiene ventas a crédito activas. El cero indica crédito deshabilitado, no días
restantes. La carga amplía la restricción de la tabla destino para admitir cero,
conserva ese valor y establece su límite de crédito operativo en cero. Los
límites antiguos se conservan en `migration_concretera_jm_disabled_credit`.
La aplicación también impide venderles a crédito y permite ventas de contado.

## Preparar y ejecutar

### Opción: SQL Editor de Supabase, sin `psql`

Si la limpieza de B2 ya se ejecutó, se puede usar **un solo archivo**:
`out/MIGRACION_COMPLETA_SQL_EDITOR.sql`. Incluye staging, folios por sucursal,
carga y verificación en el orden correcto. No incluye la limpieza y contiene
datos sensibles del respaldo.

Si una ejecución anterior se detuvo por `concrete_uoms_name_key`,
`concrete_products_stock_check`, `concrete_products_min_stock_check` o
`concrete_credit_customers_default_credit_days_check`, ejecutar de nuevo el archivo completo
actualizado. La carga fallida se revierte porque usa una transacción; el archivo
completo vuelve a preparar staging, reutiliza las unidades existentes y registra
los faltantes históricos por separado.

No ejecutar `02_load.sql` por separado antes de crear staging en la misma base:
si faltan sus tablas, la carga se cancela.

Los archivos SQL ya generados para el respaldo actual se ejecutan en este orden:

1. `00_clear_preview.sql`: revisar lo que se borrará.
2. `00_clear_existing_concretera_b2.sql`: limpiar Concretera B2 **una sola vez,
   antes de la carga**.
3. `out/01_staging_and_data.sql`: crear staging e insertar los datos del respaldo.
4. `01_branch_sale_folios.sql`: activar folios de venta independientes por
   sucursal de Concretera.
5. `02_load.sql`: cargar a las tablas `concrete_*`.
6. `03_verify.sql`: comprobar conteos, importes, cartera y stock.

Cada archivo se abre, se copia completo y se ejecuta por separado en el SQL
Editor de la **base principal** de Supabase. El paso 3 contiene datos de clientes
y ventas; está excluido de Git y no debe publicarse.

La aplicación debe publicarse con los cambios de `ConcretePOSScreen`,
`ConcreteCustomersScreen` y `ConcreteReportsScreen` para mostrar `reference`
como folio de venta de Concretera. Los IDs internos de PostgreSQL siguen siendo
globales; el folio visible avanza por sucursal. Materiales usa otra tabla y
mantiene su propio consecutivo por sucursal y unidad de negocio.

```bash
node migration/concretera_jesus_maria/extract.mjs concre45_crm.sql
```

Si se recibe un respaldo más reciente, ejecutar ese comando otra vez para
regenerar `out/01_staging_and_data.sql`, y revisar los conteos fijos de
`02_load.sql` antes de usarlo.

### Opción: terminal con `psql`

Si se necesita borrar los datos actuales de Concretera B2 antes de importar,
ejecutar primero `00_clear_preview.sql` para revisar conteos y luego
`00_clear_existing_concretera_b2.sql`. Es una
transacción separada que elimina productos, stock, ajustes, operaciones,
clientes y dependencias de Concretera B2. No borra la sucursal, Materiales ni
catálogos compartidos. Después de la limpieza la carga crea los 38 productos
del respaldo; sin limpieza, reutiliza los 37 productos `LEG-C-2-*` existentes.

```bash
psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f migration/concretera_jesus_maria/00_clear_preview.sql
psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f migration/concretera_jesus_maria/00_clear_existing_concretera_b2.sql
```

La auditoría de la aplicación usa un servicio externo; sus documentos no se
borran con SQL de esta base. Tampoco se eliminan archivos de evidencias en
almacenamiento externo.

Necesita `node` y una URL **directa** de PostgreSQL en `SUPABASE_DB_URL`.
La variable no se guarda en este repositorio. No usar la clave anónima del
frontend para esta carga.

```bash
node migration/concretera_jesus_maria/extract.mjs concre45_crm.sql
psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f migration/concretera_jesus_maria/00_preflight.sql
psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f migration/concretera_jesus_maria/out/01_staging.sql
psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f migration/concretera_jesus_maria/out/load_staging.psql
psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f migration/concretera_jesus_maria/01_branch_sale_folios.sql
psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f migration/concretera_jesus_maria/02_load.sql
psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f migration/concretera_jesus_maria/03_verify.sql
```

La carga usa una transacción y un mapa de IDs para ser repetible. Reutiliza los
productos `LEG-C-2-*` que aún existan, añade los faltantes y crea las
presentaciones históricas. Conserva el folio antiguo en `reference`, marca las
ventas canceladas y toma el stock final del respaldo con mínimo cero para cumplir
las restricciones del sistema. Los 22 faltantes originales deben revisarse con
operación antes del corte definitivo.

Antes de ejecutar en producción, revisar el `summary.json` y los resultados
de `00_preflight.sql`. Después, todas las diferencias de `03_verify.sql` deben
ser cero. Si hubo actividad en la base antigua después de la exportación, hacer
un respaldo nuevo y repetir la extracción antes de cargar.
