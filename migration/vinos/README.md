# Migracion Vinos a Supabase

Este directorio contiene una ruta de migracion por etapas para cargar una base antigua al schema nuevo de Supabase de Vinos.

## Estado encontrado en el proyecto

- `Supabase Snippet Untitled query.csv`: export previo de 100 productos.
- `actualizar_productos_vinos_desde_csv.sql`: SQL previo que actualiza productos existentes desde ese CSV. No crea productos, categorias, unidades, sucursales ni stocks.
- `test-vinos.js`: diagnostico de conexion usando `VITE_SUPABASE_URL_VINOS` y `VITE_SUPABASE_ANON_KEY_VINOS`.
- `concre45_crm2.sql`: dump MySQL detectado como origen operativo con clientes, proveedores, productos, presentaciones, ventas, entradas y abonos.
- `extract_from_mysql_dump.mjs`: extractor que convierte ese dump a CSVs compatibles con `migration_vinos.legacy_*`.

## Flujo recomendado

1. Ejecutar `00_preflight.sql` en Supabase para confirmar extensiones, tablas y dependencias.
2. Ejecutar `01_staging_schema.sql` para crear las tablas temporales persistentes bajo `migration_vinos`.
3. Generar los CSV desde el dump MySQL:

```bash
node migration/vinos/extract_from_mysql_dump.mjs concre45_crm2.sql --out migration/vinos/out
```

Opcionalmente se puede cambiar la sucursal destino, ya que el dump no trae sucursales:

```bash
node migration/vinos/extract_from_mysql_dump.mjs concre45_crm2.sql --out migration/vinos/out --branch-code JM --branch-name "Jesus Maria" --branch-address "Jesus Maria, Jalisco"
```

4. Cargar los CSV a staging con `psql`:

```bash
psql "$SUPABASE_DB_URL" -f migration/vinos/out/load_staging_csv.psql
```

5. Ejecutar `02_load_from_staging.sql` dentro de una transaccion.
6. Revisar los resultados de auditoria al final del script.
7. Si el conteo y muestras son correctos, dejar `commit`; si no, cambiar a `rollback` y ajustar staging.

## Orden de carga

1. `legacy_branches`
2. `legacy_categories`
3. `legacy_brands`
4. `legacy_uoms`
5. `legacy_suppliers`
6. `legacy_products`
7. `legacy_product_stocks`
8. `legacy_product_uoms`
9. `legacy_customers`
10. `legacy_sales`
11. `legacy_sale_items`
12. `legacy_credit_payments`
13. `legacy_purchases`
14. `legacy_purchase_items`

## Notas importantes

- Los IDs antiguos se guardan en `public.migration_legacy_id_map` para que la carga sea idempotente.
- `sales.created_by` y `purchases.created_by` son obligatorios en el schema nuevo. El script usa un UUID fijo de migracion cuando el staging no trae usuario.
- Para productos, el upsert principal se hace por `sku`. Si no existe SKU en origen, el staging debe traer uno generado antes de ejecutar la carga.
- Para clientes, el script crea UUID nuevo por `legacy_id`. No hay constraint unico de nombre/telefono en el destino.
- Las presentaciones de MySQL se migran a `public.product_uoms` y las partidas historicas guardan `product_uom_id`.
- Los abonos de MySQL se migran a `public.credit_payments` solo cuando pertenecen a ventas con `ventas.credito = 1` o `ventas.liquidado = 0`. El dump tambien registra pagos de contado en `abonos`; cargarlos como `credit_payments` distorsionaria el saldo de deuda por cliente.
- `abonosentradas` no tiene tabla destino en el schema proporcionado. El extractor conserva su suma en `purchases.notes` como referencia operativa.
- Las tablas de historiales derivados, como `customer_product_history`, se pueden regenerar despues desde ventas migradas.

## Resultado del extractor con `concre45_crm2.sql`

El ultimo corrido local genero:

- 1 sucursal, 1 categoria, 666 UOMs, 33 proveedores.
- 1243 productos, 1243 stocks, 1456 equivalencias producto/UOM.
- 121 clientes.
- 2805 ventas y 5208 partidas.
- 2 abonos de credito migrables.
- 557 compras/entradas y 1168 partidas.
- Total ventas origen/staging: `13353003.06`.
- Saldo de credito esperado despues de abonos migrables: `2014594.83`.
