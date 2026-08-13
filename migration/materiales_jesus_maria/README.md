# Migracion Materiales Jesus Maria

Esta ruta es solo para la sucursal Jesus Maria del modulo Materiales.

Destino verificado:

- `branches.id = 2`
- `branches.code = B2`
- `branches.name = JESUS MARIA LOPAR`
- `business_unit = materiales` en tablas operativas de Materiales. La tabla `branches` de este proyecto no tiene columna `business_unit`.

No usar `migration/vinos` para esta carga.

## Generar staging local

```bash
node migration/materiales_jesus_maria/extract_from_mysql_dump.mjs concre45_crm2.sql \
  --out migration/materiales_jesus_maria/out
```

El extractor rechaza `--branch-code CODIGO_REAL` para evitar cargar con un placeholder.

## Ejecutar en Supabase

Usa una URL directa de Postgres en `SUPABASE_DB_URL`.

```bash
psql "$SUPABASE_DB_URL" -f migration/materiales_jesus_maria/00_preflight.sql
psql "$SUPABASE_DB_URL" -f migration/materiales_jesus_maria/01_staging_schema.sql
psql "$SUPABASE_DB_URL" -f migration/materiales_jesus_maria/out/load_staging_csv.psql
psql "$SUPABASE_DB_URL" -f migration/materiales_jesus_maria/02_load_from_staging.sql
```

## Resultado esperado del dump actual

- Productos: 1243
- Unidades/presentaciones: 663 `uoms`, 1488 `product_uoms`
- Proveedores: 33
- Clientes de credito: 121
- Transacciones de inventario: 3362
- Items de transaccion: 6376
- Notas de credito: 292
- Abonos de credito migrables: 2

Totales revisados:

- Ventas origen: `13,353,003.06`
- Compras origen: `10,279,866.16`
- Ventas a credito origen: `2,052,551.83`
- Abonos de credito migrables: `37,957.00`
- Saldo de credito esperado: `2,014,594.83`

Los `abonos` que pertenecen a ventas liquidadas/no credito se omiten de `credit_payments`; quedan representados en la venta como pago en efectivo.
