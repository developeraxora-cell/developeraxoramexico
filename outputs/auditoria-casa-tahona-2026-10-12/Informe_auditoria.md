# Auditoría de stock de Casa Tahona

Corte: 12/10/2026, 16:37 UTC. Sucursal VIN-01. Consultas de solo lectura.

Se revisaron 678 productos: 637 activos y 41 inactivos o eliminados. Se detectaron **11 productos activos adicionales con diferencias**, aparte del Tequila Cristalino corregido localmente.

| SKU | Producto | Stock | Historial | Diferencia |
|---|---|---:|---:|---:|
| PRO-460396 | Productos de prueba 4.0 | 60 | 50 | +10 |
| PRO-441791 | baileys 700ml | 19 | 16 | +3 |
| PRO-189396 | Tequila 30 30 REPOSADO 1.750L | 8 | 10 | -2 |
| PRO-579663 | 1800 MILENIO 700ml | 0 | -1 | +1 |
| PRO-978588 | Agua Ciel 1L | 9 | 10 | -1 |
| PRO-713257 | blue label 750ml | 0 | 1 | -1 |
| PRO-342979 | Doritos Nacho | 32 | 33 | -1 |
| PRO-815550 | siete leguas AÑEJO 700ml | 12 | 13 | -1 |
| PRO-271873 | Siete Leguas BLANCO 1L | 43 | 42 | +1 |
| PRO-722233 | Tostitos VERDES | 14 | 15 | -1 |
| PRO-333639 | V8 SPLASH BERRY BLEND 500ml | 25 | 26 | -1 |

## Causas y evidencia

**Productos de prueba 4.0:** stock 60 e historial 50. La venta V-2B2939 de 10 unidades ocurrió antes del último ajuste a 50; su eliminación ocurrió después. La auditoría confirma la restitución de 10 unidades, que el reporte omite. Motivo: venta de prueba. Registro de auditoría: fec053ef-706c-4d05-b39a-d9a806b17a7b.

**Los otros diez casos:** diferencias confirmadas; causa todavía no determinada. Incorporar las devoluciones no las resuelve. No se encontró un ajuste manual de stock que las explique en los eventos disponibles. No se deben ajustar existencias por inferencia ni atribuir estos casos al mismo error.

**Tequila 30-30 Cristalino 750 ml (control):** stock 39, historial anterior 33 e historial local corregido 39. La publicación en producción no se verificó.

**Botella tequila Lopar (inactivo):** stock -10 e historial -120, diferencia +110. Hay compras eliminadas, pero no explican por sí solas la diferencia.

**marlboro BLANCO (activo):** stock e historial -10. No hay discrepancia entre ambos, pero existe stock negativo que requiere revisión.

## Método y límites

Se descargaron todos los registros visibles de productos, stocks, compras y ventas con paginación y conteos exactos: 1,161 partidas de compra, 6,944 de venta, 1,397 eventos de auditoría de producto y 75 de eliminación de venta. No hay duplicados de ID, partidas huérfanas ni unidades base faltantes. Ningún producto alcanza los límites de consultas del reporte. El stock fue idéntico al inicio y al final de la extracción.

Se ejecutó el servicio del código local sobre estos datos y se reprodujo la acumulación del historial. México y Perú produjeron los mismos saldos finales. Se comparó el cálculo actual, el anterior y una simulación con todas las devoluciones. La simulación no altera datos ni código del sistema.

El alcance confirma diferencias entre registros digitales; no determina existencias físicas. Para las diez diferencias no explicadas se necesitan comprobantes, historial adicional o conteo físico.

Fuentes: Supabase VINOS (products, product_stocks, purchase_items, sale_items) y API audit-log del proyecto de auditoría. Identificadores y URLs de consulta en las hojas Catalogo, Devoluciones y Alcance y fuentes del Excel.
