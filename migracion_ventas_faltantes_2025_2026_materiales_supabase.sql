-- Migracion de ventas faltantes 2025-2026 para Materiales / branch_id = 1
-- Alcance:
-- - Inserta/reutiliza inventory_transactions
-- - Inserta inventory_transaction_items
-- - Liga credit_notes.inventory_transaction_id
-- - NO toca stock
-- - NO toca clientes / notas / abonos
--
-- Fuente: archivos en ./legacy enviados por el usuario

begin;

create temporary table tmp_target_note_folios (
  folio text primary key
);

insert into tmp_target_note_folios (folio) values
  ('28959'), ('33849'), ('34661'), ('34840'), ('34855'), ('35016'), ('35184'), ('35309'), ('35325'),
  ('35398'), ('35449'), ('35516'), ('35525'), ('35529'), ('35630'), ('35807'), ('35905'), ('36029');

create temporary table tmp_target_notes as
select
  cn.id as note_id,
  cn.branch_id,
  cn.customer_id,
  cn.folio,
  cn.issue_date,
  cn.due_date,
  cn.total as note_total,
  cn.balance,
  cn.inventory_transaction_id
from public.credit_notes cn
join tmp_target_note_folios tf on tf.folio = cn.folio
where cn.branch_id = 1
  and cn.issue_date >= date '2025-01-01'
  and cn.issue_date < date '2027-01-01';

create temporary table tmp_legacy_sales (
  legacy_sale_id bigint primary key,
  legacy_customer_id bigint,
  legacy_folio_raw text,
  legacy_folio_prefixed text,
  issue_date date,
  due_date date,
  credit_days_applied integer,
  total numeric,
  credito integer,
  liquidado integer,
  paid_amount_legacy_field numeric,
  direccion text,
  usuario text,
  vendedor text,
  legacy_status integer,
  customer_name text
);

insert into tmp_legacy_sales (
  legacy_sale_id, legacy_customer_id, legacy_folio_raw, legacy_folio_prefixed, issue_date, due_date,
  credit_days_applied, total, credito, liquidado, paid_amount_legacy_field, direccion, usuario, vendedor,
  legacy_status, customer_name
) values
  (28959, 373, '28959', 'LEG-28959', '2025-02-22', '2025-03-24', 30, 1620.00, 1, 0, 1200.00, 'LOS FRESNOS', 'Gabby2024', '', 1, 'juan manuel madrigal (meño)'),
  (33849, 1659, '33849', 'LEG-33849', '2025-11-29', '2025-12-29', 30, 39250.00, 1, 0, 39200.00, 'BUENOS AIRES', 'anallely1712', '', 1, 'ESTEBAN BRAVO'),
  (34661, 1646, '34661', 'LEG-34661', '2026-01-14', '2026-02-13', 30, 8800.00, 1, 0, 4494.00, 'DEGOLLADO', 'Tere', '', 1, 'ALEJANDRO LOPEZ'),
  (34840, 1663, '34840', 'LEG-34840', '2026-01-26', '2026-02-25', 30, 3100.00, 0, 1, 3100.00, 'EL MEZQUITE GRANDE', 'anallely1712', '', 1, 'LUZ MARIA HERNANDEZ'),
  (34855, 1663, '34855', 'LEG-34855', '2026-01-27', '2026-02-26', 30, 1550.00, 0, 1, 1550.00, 'EL MEZQUITE GRANDE', 'anallely1712', '', 1, 'LUZ MARIA HERNANDEZ'),
  (35016, 1678, '35016', 'LEG-35016', '2026-02-04', '2026-02-19', 15, 136724.00, 0, 1, 136724.00, 'TEPIC, NAYARIT', 'anallely1712', '', 1, 'CLADIMACO'),
  (35184, 1678, '35184', 'LEG-35184', '2026-02-12', '2026-02-27', 15, 134254.00, 0, 1, 134254.00, 'TEPIC, NAYARIT', 'anallely1712', '', 1, 'CLADIMACO'),
  (35309, 325, '35309', 'LEG-35309', '2026-02-18', '2026-03-20', 30, 910.00, 0, 1, 910.00, 'VINO POR EL', 'Tere', '', 1, 'JAIME LOPEZ'),
  (35325, 187, '35325', 'LEG-35325', '2026-02-19', '2026-03-06', 15, 13500.00, 1, 0, 0.00, 'CARLOS ALFREDO MENDOZA (LA PIEDAD)', 'Tere', '', 1, 'PUBLICO EN GENERAL'),
  (35398, 1357, '35398', 'LEG-35398', '2026-02-24', '2026-03-11', 15, 1470.00, 1, 0, 0.00, 'MARGARITO RAMIREZ #128 COL SOLIDARIDAD', 'Tere', '', 1, 'JUAN ANTONIO LEDESMA'),
  (35449, 804, '35449', 'LEG-35449', '2026-02-26', '2026-03-13', 15, 4200.00, 0, 1, 4200.00, 'LA PIEDAD ', 'Tere', '', 1, 'DAVID REYES'),
  (35516, 107, '35516', 'LEG-35516', '2026-03-02', '2026-04-01', 30, 2895.00, 1, 0, 0.00, 'DEGOLLADO', 'anallely1712', '', 1, 'JAIME LOPEZ CANGO'),
  (35525, 804, '35525', 'LEG-35525', '2026-03-03', '2026-03-18', 15, 1850.00, 1, 0, 0.00, 'LA PIEDAD', 'Tere', '', 1, 'DAVID REYES'),
  (35529, 187, '35529', 'LEG-35529', '2026-03-03', '2026-03-18', 15, 2868.75, 1, 0, 0.00, 'JAVIER LUNA ', 'anallely1712', '', 1, 'PUBLICO EN GENERAL'),
  (35630, 804, '35630', 'LEG-35630', '2026-03-07', '2026-03-22', 15, 4536.00, 1, 0, 0.00, 'LA PIEDAD', 'Tere', '', 1, 'DAVID REYES'),
  (35807, 619, '35807', 'LEG-35807', '2026-03-16', '2026-04-15', 30, 1250.00, 0, 1, 1250.00, 'EL CARACOL ', 'Tere', '', 1, 'CHRISTOPHER DURAN'),
  (35905, 107, '35905', 'LEG-35905', '2026-03-21', '2026-04-20', 30, 2930.00, 1, 0, 0.00, 'DEGOLLADO', 'anallely1712', '', 1, 'JAIME LOPEZ CANGO'),
  (36029, 619, '36029', 'LEG-36029', '2026-03-27', '2026-04-26', 30, 6900.00, 0, 1, 6900.00, 'BAJIO', 'Tere', '', 1, 'CHRISTOPHER DURAN');

create temporary table tmp_legacy_products (
  legacy_product_id bigint,
  product_name text,
  product_name_normalized text,
  legacy_barcode text,
  legacy_status integer,
  legacy_presentation_id bigint,
  presentation_name text,
  presentation_name_normalized text,
  factor_a_base numeric,
  mayoreo numeric,
  menudeo numeric
);

insert into tmp_legacy_products values
  (472, 'ALAMBRE QUEMADO', 'ALAMBRE QUEMADO', null, 1, 176, 'KILOS', 'KILOS', 1.0000, 25.00, 25.00),
  (480, 'ANILLO 10X15', 'ANILLO 10X15', null, 1, 409, 'Kilos', 'KILOS', 1.0000, 27.00, 27.00),
  (479, 'ANILLO 10X20', 'ANILLO 10X20', '000000000', 1, 362, 'KG', 'KG', 1.0000, 27.00, 27.00),
  (483, 'ANILLO 25X25', 'ANILLO 25X25', null, 1, 201, 'KILOS', 'KILOS', 1.0000, 27.00, 27.00),
  (484, 'ANILLO 30X30', 'ANILLO 30X30', null, 1, 377, 'kilos', 'KILOS', 1.0000, 27.00, 27.00),
  (458, 'ARENA NEGRA', 'ARENA NEGRA', null, 1, 212, 'VIAJE', 'VIAJE', 6.0000, 2800.00, 3100.00),
  (842, 'CEMENTO 25 KG HOLCIM', 'CEMENTO 25 KG HOLCIM', '0000000008426', 1, 758, 'BULTO', 'BULTO', 25.0000, 119.00, 119.00),
  (467, 'CEMENTO HOLCIM', 'CEMENTO HOLCIM', null, 0, 227, 'TN', 'TN', 1000.0000, 4750.00, 4750.00),
  (1188, 'CEMENTO HOLCIM', 'CEMENTO HOLCIM', null, 1, 1107, 'TN', 'TN', 1000.0000, 4750.00, 4750.00),
  (736, 'CEMENTO HOLCIM A GRANEL', 'CEMENTO HOLCIM A GRANEL', null, 1, 645, 'TON', 'TON', 1000.0000, 3800.00, 3800.00),
  (410, 'CLAVO CONCRETO 2', 'CLAVO CONCRETO 2', '0000000004107', 1, 231, 'KILOS', 'KILOS', 0.0000, 80.00, 80.00),
  (461, 'GRAVA 3/4', 'GRAVA 3/4', null, 1, 914, 'VIAJE', 'VIAJE', 6.0000, 2900.00, 3100.00),
  (429, 'MORTERO', 'MORTERO', null, 1, 281, 'TN', 'TN', 1000.0000, 3850.00, 3850.00),
  (1000, 'MORTERO 25 HOLCIM', 'MORTERO 25 HOLCIM', '0000000010009', 1, 923, 'BULTO', 'BULTO', 25.0000, 96.50, 96.50),
  (959, 'SIERRA CIRCULAR TRUPER', 'SIERRA CIRCULAR TRUPER', null, 1, 878, 'PIEZA', 'PIEZA', 0.0000, 1620.00, 1620.00),
  (466, 'VARILLA 1/2', 'VARILLA 1/2', null, 1, 334, 'pieza', 'PIEZA', 1.0000, 262.00, 262.00),
  (465, 'VARILLA 3/8', 'VARILLA 3/8', null, 1, 336, 'PIEZA', 'PIEZA', 1.0000, 147.00, 147.00),
  (465, 'VARILLA 3/8', 'VARILLA 3/8', null, 1, 337, 'TN', 'TN', 150.0000, 22000.00, 22000.00);

create temporary table tmp_legacy_sale_items (
  legacy_sale_id bigint,
  legacy_sale_item_id bigint,
  legacy_product_id bigint,
  legacy_presentation_id bigint,
  product_name text,
  product_name_normalized text,
  legacy_barcode text,
  presentation_name text,
  presentation_name_normalized text,
  tipoventa text,
  cantidad numeric,
  factor_a_base numeric,
  qty_base_calculated numeric,
  catalog_wholesale_price numeric,
  catalog_retail_price numeric,
  pespecial integer,
  unitarioespecial numeric,
  unit_price_used numeric,
  subtotal numeric
);

insert into tmp_legacy_sale_items values
  (28959, 53243, 959, 878, 'SIERRA CIRCULAR TRUPER', 'SIERRA CIRCULAR TRUPER', null, 'PIEZA', 'PIEZA', 'Menudeo', 1.00, 0.0000, 1.000000, 1620.00, 1620.00, 0, 0.00, 1620.00, 1620.00),
  (33849, 61822, 465, 337, 'VARILLA 3/8', 'VARILLA 3/8', null, 'TN', 'TN', 'Menudeo', 2.00, 150.0000, 300.000000, 22000.00, 22000.00, 0, 0.00, 22000.00, 38000.00),
  (33849, 61823, 479, 362, 'ANILLO 10X20', 'ANILLO 10X20', '000000000', 'KG', 'KG', 'Menudeo', 50.00, 1.0000, 50.000000, 27.00, 27.00, 0, 0.00, 27.00, 1250.00),
  (34661, 63220, 467, 227, 'CEMENTO HOLCIM', 'CEMENTO HOLCIM', null, 'TN', 'TN', 'Menudeo', 1.00, 1000.0000, 1000.000000, 4750.00, 4750.00, 0, 0.00, 4750.00, 4600.00),
  (34661, 63221, 429, 281, 'MORTERO', 'MORTERO', null, 'TN', 'TN', 'Menudeo', 1.00, 1000.0000, 1000.000000, 3850.00, 3850.00, 0, 0.00, 3850.00, 3700.00),
  (34661, 63222, 472, 176, 'ALAMBRE QUEMADO', 'ALAMBRE QUEMADO', null, 'KILOS', 'KILOS', 'Menudeo', 20.00, 1.0000, 20.000000, 25.00, 25.00, 0, 0.00, 25.00, 500.00),
  (34840, 63551, 458, 212, 'ARENA NEGRA', 'ARENA NEGRA', null, 'VIAJE', 'VIAJE', 'Menudeo', 1.00, 6.0000, 6.000000, 2800.00, 3100.00, 0, 0.00, 3100.00, 3100.00),
  (34855, 63577, 461, 914, 'GRAVA 3/4', 'GRAVA 3/4', null, 'VIAJE', 'VIAJE', 'Menudeo', 0.50, 6.0000, 3.000000, 2900.00, 3100.00, 0, 0.00, 3100.00, 1550.00),
  (35016, 63849, 736, 645, 'CEMENTO HOLCIM A GRANEL', 'CEMENTO HOLCIM A GRANEL', null, 'TON', 'TON', 'Precio especial', 35.98, 1000.0000, 35980.000000, 3800.00, 3800.00, 1, 3800.00, 3800.00, 136724.00),
  (35184, 64119, 736, 645, 'CEMENTO HOLCIM A GRANEL', 'CEMENTO HOLCIM A GRANEL', null, 'TON', 'TON', 'Precio especial', 35.33, 1000.0000, 35330.000000, 3800.00, 3800.00, 1, 3800.00, 3800.00, 134254.00),
  (35309, 64324, 410, 231, 'CLAVO CONCRETO 2', 'CLAVO CONCRETO 2', '0000000004107', 'KILOS', 'KILOS', 'Menudeo', 2.00, 0.0000, 2.000000, 80.00, 80.00, 0, 0.00, 80.00, 160.00),
  (35309, 64325, 483, 201, 'ANILLO 25X25', 'ANILLO 25X25', null, 'KILOS', 'KILOS', 'Menudeo', 30.00, 1.0000, 30.000000, 27.00, 27.00, 0, 0.00, 27.00, 750.00),
  (35325, 64365, 465, 337, 'VARILLA 3/8', 'VARILLA 3/8', null, 'TN', 'TN', 'Menudeo', 0.50, 150.0000, 75.000000, 22000.00, 22000.00, 0, 0.00, 22000.00, 11000.00),
  (35325, 64366, 479, 362, 'ANILLO 10X20', 'ANILLO 10X20', '000000000', 'KG', 'KG', 'Menudeo', 50.00, 1.0000, 50.000000, 27.00, 27.00, 0, 0.00, 27.00, 1250.00),
  (35325, 64367, 472, 176, 'ALAMBRE QUEMADO', 'ALAMBRE QUEMADO', null, 'KILOS', 'KILOS', 'Menudeo', 50.00, 1.0000, 50.000000, 25.00, 25.00, 0, 0.00, 25.00, 1250.00),
  (35398, 64502, 465, 336, 'VARILLA 3/8', 'VARILLA 3/8', null, 'PIEZA', 'PIEZA', 'Menudeo', 10.00, 1.0000, 10.000000, 147.00, 147.00, 0, 0.00, 147.00, 1470.00),
  (35449, 64600, 1188, 1107, 'CEMENTO HOLCIM', 'CEMENTO HOLCIM', null, 'TN', 'TN', 'Precio especial', 0.50, 1000.0000, 500.000000, 4750.00, 4750.00, 1, 4700.00, 4700.00, 2350.00),
  (35449, 64601, 429, 281, 'MORTERO', 'MORTERO', null, 'TN', 'TN', 'Precio especial', 0.50, 1000.0000, 500.000000, 3850.00, 3850.00, 1, 3700.00, 3700.00, 1850.00),
  (35516, 64724, 1000, 923, 'MORTERO 25 HOLCIM', 'MORTERO 25 HOLCIM', '0000000010009', 'BULTO', 'BULTO', 'Menudeo', 30.00, 25.0000, 750.000000, 96.50, 96.50, 0, 0.00, 96.50, 2895.00),
  (35525, 64742, 429, 281, 'MORTERO', 'MORTERO', null, 'TN', 'TN', 'Precio especial', 0.50, 1000.0000, 500.000000, 3850.00, 3850.00, 1, 3700.00, 3700.00, 1850.00),
  (35529, 64749, 842, 758, 'CEMENTO 25 KG HOLCIM', 'CEMENTO 25 KG HOLCIM', '0000000008426', 'BULTO', 'BULTO', 'Precio especial', 27.00, 25.0000, 675.000000, 119.00, 119.00, 1, 106.25, 106.25, 2868.75),
  (35630, 64935, 465, 336, 'VARILLA 3/8', 'VARILLA 3/8', null, 'PIEZA', 'PIEZA', 'Menudeo', 20.00, 1.0000, 20.000000, 147.00, 147.00, 0, 0.00, 147.00, 2940.00),
  (35630, 64936, 466, 334, 'VARILLA 1/2', 'VARILLA 1/2', null, 'PIEZA', 'PIEZA', 'Menudeo', 3.00, 1.0000, 3.000000, 262.00, 262.00, 0, 0.00, 262.00, 786.00),
  (35630, 64937, 480, 409, 'ANILLO 10X15', 'ANILLO 10X15', null, 'Kilos', 'KILOS', 'Menudeo', 30.00, 1.0000, 30.000000, 27.00, 27.00, 0, 0.00, 27.00, 810.00),
  (35807, 65279, 472, 176, 'ALAMBRE QUEMADO', 'ALAMBRE QUEMADO', null, 'KILOS', 'KILOS', 'Menudeo', 50.00, 1.0000, 50.000000, 25.00, 25.00, 0, 0.00, 25.00, 1250.00),
  (35905, 65445, 484, 377, 'ANILLO 30X30', 'ANILLO 30X30', null, 'KILOS', 'KILOS', 'Menudeo', 70.00, 1.0000, 70.000000, 27.00, 27.00, 0, 0.00, 27.00, 1890.00),
  (35905, 65446, 483, 201, 'ANILLO 25X25', 'ANILLO 25X25', null, 'KILOS', 'KILOS', 'Menudeo', 20.00, 1.0000, 20.000000, 27.00, 27.00, 0, 0.00, 27.00, 540.00),
  (35905, 65447, 472, 176, 'ALAMBRE QUEMADO', 'ALAMBRE QUEMADO', null, 'KILOS', 'KILOS', 'Menudeo', 20.00, 1.0000, 20.000000, 25.00, 25.00, 0, 0.00, 25.00, 500.00),
  (36029, 65648, 1188, 1107, 'CEMENTO HOLCIM', 'CEMENTO HOLCIM', null, 'TN', 'TN', 'Precio especial', 1.50, 1000.0000, 1500.000000, 4750.00, 4750.00, 1, 4600.00, 4600.00, 6900.00);

-- Asegura UOMs necesarias.
insert into public.uoms (code, name)
select distinct
  upper(trim(lp.presentation_name_normalized)) as code,
  initcap(lower(trim(lp.presentation_name_normalized))) as name
from tmp_legacy_products lp
where not exists (
  select 1
  from public.uoms u
  where upper(trim(coalesce(u.code, ''))) = upper(trim(lp.presentation_name_normalized))
     or upper(trim(coalesce(u.name, ''))) = upper(trim(lp.presentation_name_normalized))
);

create temporary table tmp_uom_map as
select distinct on (upper(trim(lp.presentation_name_normalized)))
  upper(trim(lp.presentation_name_normalized)) as presentation_key,
  u.id as uom_id,
  u.code,
  u.name
from tmp_legacy_products lp
join public.uoms u
  on upper(trim(coalesce(u.code, ''))) = upper(trim(lp.presentation_name_normalized))
  or upper(trim(coalesce(u.name, ''))) = upper(trim(lp.presentation_name_normalized))
order by upper(trim(lp.presentation_name_normalized)), u.id;

-- Productos actuales: prioriza barcode, luego sku LEG-1-id, luego nombre.
create temporary table tmp_product_candidates as
select
  lp.legacy_product_id,
  p.id as product_id,
  case
    when lp.legacy_barcode is not null
      and lp.legacy_barcode not in ('', '0', '000000000')
      and coalesce(p.barcode, '') = lp.legacy_barcode then 1
    when coalesce(p.sku, '') = concat('LEG-1-', lp.legacy_product_id) then 2
    when upper(trim(p.name)) = upper(trim(lp.product_name_normalized)) then 3
    else 99
  end as priority,
  p.is_active
from (select distinct legacy_product_id, product_name_normalized, legacy_barcode from tmp_legacy_products) lp
join public.products p
  on p.branch_id = 1
 and (
      (lp.legacy_barcode is not null and lp.legacy_barcode not in ('', '0', '000000000') and coalesce(p.barcode, '') = lp.legacy_barcode)
   or coalesce(p.sku, '') = concat('LEG-1-', lp.legacy_product_id)
   or upper(trim(p.name)) = upper(trim(lp.product_name_normalized))
 );

create temporary table tmp_product_match as
select legacy_product_id, product_id
from (
  select
    legacy_product_id,
    product_id,
    row_number() over (
      partition by legacy_product_id
      order by priority asc, case when is_active then 0 else 1 end, product_id desc
    ) as rn
  from tmp_product_candidates
) ranked
where rn = 1;

-- Crea productos faltantes si no existen.
create temporary table tmp_missing_products as
select distinct on (lp.legacy_product_id)
  lp.legacy_product_id,
  lp.product_name,
  lp.product_name_normalized,
  lp.legacy_barcode,
  lp.presentation_name_normalized,
  case when coalesce(lp.factor_a_base, 0) <= 0 then 1 else lp.factor_a_base end as factor_a_base,
  coalesce(lp.mayoreo, lp.menudeo, 0) as wholesale_price,
  coalesce(lp.menudeo, lp.mayoreo, 0) as retail_price
from tmp_legacy_products lp
left join tmp_product_match pm on pm.legacy_product_id = lp.legacy_product_id
where pm.product_id is null
order by lp.legacy_product_id, lp.legacy_presentation_id;

insert into public.products (
  branch_id,
  sku,
  barcode,
  name,
  description,
  base_uom_id,
  is_divisible,
  attrs,
  is_active,
  precio,
  wholesale_price,
  retail_price,
  stock,
  min_stock
)
select
  1,
  concat('LEG-AUTO-1-', mp.legacy_product_id),
  case
    when mp.legacy_barcode is not null and mp.legacy_barcode not in ('', '0', '000000000')
      and not exists (select 1 from public.products p where p.barcode = mp.legacy_barcode)
      then mp.legacy_barcode
    else concat('BC-AUTO-1-', mp.legacy_product_id)
  end,
  mp.product_name,
  'Migrado automaticamente desde venta legacy 2025-2026',
  um.uom_id,
  true,
  '{}'::jsonb,
  true,
  mp.retail_price,
  mp.wholesale_price,
  mp.retail_price,
  0,
  0
from tmp_missing_products mp
join tmp_uom_map um on um.presentation_key = upper(trim(mp.presentation_name_normalized));

insert into tmp_product_match (legacy_product_id, product_id)
select
  mp.legacy_product_id,
  p.id
from tmp_missing_products mp
join public.products p
  on p.branch_id = 1
 and p.sku = concat('LEG-AUTO-1-', mp.legacy_product_id)
on conflict do nothing;

-- Crea product_uoms necesarios para las presentaciones legacy.
insert into public.product_uoms (
  product_id,
  uom_id,
  purpose,
  factor_to_base,
  is_default_purchase,
  is_default_sale
)
select distinct
  pm.product_id,
  um.uom_id,
  'BOTH',
  case when coalesce(li.factor_a_base, 0) <= 0 then 1 else li.factor_a_base end,
  false,
  false
from tmp_legacy_sale_items li
join tmp_product_match pm on pm.legacy_product_id = li.legacy_product_id
join tmp_uom_map um on um.presentation_key = upper(trim(li.presentation_name_normalized))
on conflict (product_id, uom_id) do nothing;

-- Para productos nuevos, fuerza defaults en su uom base.
update public.product_uoms pu
set is_default_purchase = true,
    is_default_sale = true
from public.products p
where p.branch_id = 1
  and p.sku like 'LEG-AUTO-1-%'
  and pu.product_id = p.id
  and pu.uom_id = p.base_uom_id;

create temporary table tmp_item_payload as
select
  li.legacy_sale_id,
  li.legacy_sale_item_id,
  pm.product_id,
  coalesce(
    (
      select pu.id
      from public.product_uoms pu
      join public.uoms u on u.id = pu.uom_id
      where pu.product_id = pm.product_id
        and (
          upper(trim(coalesce(u.code, ''))) = upper(trim(li.presentation_name_normalized))
          or upper(trim(coalesce(u.name, ''))) = upper(trim(li.presentation_name_normalized))
        )
        and abs(coalesce(pu.factor_to_base, 1) - case when coalesce(li.factor_a_base, 0) <= 0 then 1 else li.factor_a_base end) < 0.0001
      order by pu.id
      limit 1
    ),
    (
      select pu.id
      from public.product_uoms pu
      join public.uoms u on u.id = pu.uom_id
      where pu.product_id = pm.product_id
        and (
          upper(trim(coalesce(u.code, ''))) = upper(trim(li.presentation_name_normalized))
          or upper(trim(coalesce(u.name, ''))) = upper(trim(li.presentation_name_normalized))
        )
      order by pu.id
      limit 1
    ),
    (
      select pu.id
      from public.product_uoms pu
      where pu.product_id = pm.product_id
        and pu.is_default_sale = true
      order by pu.id
      limit 1
    ),
    (
      select pu.id
      from public.product_uoms pu
      where pu.product_id = pm.product_id
      order by pu.id
      limit 1
    )
  ) as product_uom_id,
  li.cantidad as qty,
  case when coalesce(li.factor_a_base, 0) <= 0 then 1 else li.factor_a_base end as factor_used,
  case when coalesce(li.qty_base_calculated, 0) <= 0 then li.cantidad else li.qty_base_calculated end as qty_base,
  li.unit_price_used as unit_price,
  li.legacy_barcode as barcode_scanned,
  li.tipoventa,
  li.subtotal
from tmp_legacy_sale_items li
join tmp_product_match pm on pm.legacy_product_id = li.legacy_product_id;

-- Reutiliza ventas existentes por referencia numérica.
create temporary table tmp_sales_resolved as
select
  tn.note_id,
  ls.legacy_sale_id,
  ls.legacy_folio_raw as reference,
  coalesce(tn.inventory_transaction_id, it.id) as transaction_id
from tmp_target_notes tn
join tmp_legacy_sales ls on ls.legacy_folio_raw = tn.folio
left join public.inventory_transactions it
  on it.branch_id = 1
 and it.type = 'SALE'
 and it.reference = ls.legacy_folio_raw;

create temporary table tmp_missing_sales as
select *
from tmp_sales_resolved
where transaction_id is null;

create temporary table tmp_inserted_sales (
  legacy_sale_id bigint primary key,
  transaction_id bigint,
  reference text
);

with inserted as (
  insert into public.inventory_transactions (
    type,
    branch_id,
    reference,
    notes,
    created_by,
    created_at,
    nombre_cliente,
    direccion_cliente
  )
  select
    'SALE',
    1,
    ls.legacy_folio_raw,
    concat('Migrado legacy 2025-2026 desde venta ', ls.legacy_folio_prefixed),
    nullif(ls.usuario, ''),
    (tn.issue_date::timestamp + interval '12 hours'),
    nullif(ls.customer_name, ''),
    nullif(ls.direccion, '')
  from tmp_missing_sales ms
  join tmp_legacy_sales ls on ls.legacy_sale_id = ms.legacy_sale_id
  join tmp_target_notes tn on tn.note_id = ms.note_id
  returning id, reference
)
insert into tmp_inserted_sales (legacy_sale_id, transaction_id, reference)
select
  ls.legacy_sale_id,
  i.id,
  i.reference
from inserted i
join tmp_legacy_sales ls on ls.legacy_folio_raw = i.reference;

update tmp_sales_resolved sr
set transaction_id = ins.transaction_id
from tmp_inserted_sales ins
where ins.legacy_sale_id = sr.legacy_sale_id;

-- Inserta items solo si la venta no tiene detalle aún.
insert into public.inventory_transaction_items (
  transaction_id,
  product_id,
  product_uom_id,
  qty,
  factor_used,
  qty_base,
  unit_price,
  barcode_scanned
)
select
  sr.transaction_id,
  ip.product_id,
  ip.product_uom_id,
  ip.qty,
  ip.factor_used,
  ip.qty_base,
  ip.unit_price,
  nullif(ip.barcode_scanned, '')
from tmp_item_payload ip
join tmp_sales_resolved sr on sr.legacy_sale_id = ip.legacy_sale_id
where ip.product_uom_id is not null
  and not exists (
    select 1
    from public.inventory_transaction_items iti
    where iti.transaction_id = sr.transaction_id
  );

-- Liga la nota al transaction_id resuelto.
update public.credit_notes cn
set inventory_transaction_id = sr.transaction_id,
    updated_at = now()
from tmp_sales_resolved sr
where sr.note_id = cn.id
  and (cn.inventory_transaction_id is distinct from sr.transaction_id);

-- Resumen final.
select
  (select count(*) from tmp_target_notes) as notas_objetivo,
  (select count(*) from tmp_legacy_sales) as ventas_legacy_cargadas,
  (select count(*) from tmp_missing_sales) as ventas_insertadas,
  (select count(*) from tmp_item_payload where product_uom_id is null) as items_sin_uom_resuelto,
  (select count(*) from public.credit_notes cn join tmp_target_notes tn on tn.note_id = cn.id where cn.inventory_transaction_id is not null) as notas_ligadas,
  (select count(*) from tmp_target_notes tn join tmp_legacy_sales ls on ls.legacy_folio_raw = tn.folio where abs(coalesce(tn.note_total,0) - coalesce(ls.total,0)) > 0.01) as notas_con_total_distinto_al_legacy,
  (select count(*) from tmp_target_notes tn join tmp_legacy_sales ls on ls.legacy_folio_raw = tn.folio where tn.issue_date <> ls.issue_date) as notas_con_fecha_distinta_al_legacy;

commit;
