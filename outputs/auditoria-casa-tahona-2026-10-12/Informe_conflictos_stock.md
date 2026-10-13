# Auditoria de conflictos de stock - Casa Tahona

**Corte de datos:** 12 de octubre de 2026.  
**Alcance:** compras, ventas, ventas canceladas, stock actual y bitacora de auditoria consultados en modo de solo lectura.

## Resultado ejecutivo

- Se evaluaron los 678 productos con stock de Casa Tahona.
- Se encontraron **11 productos activos** con diferencia entre el stock actual y el saldo reconstruido desde compras y ventas, mas **1 producto inactivo** de riesgo historico.
- No se detectaron duplicados, ventas o compras huerfanas, registros sin cantidad base, truncamiento de consulta ni diferencia causada por la zona horaria.
- **3 productos activos** presentan una cancelacion antigua donde la auditoria registra expresamente `stock_restored=false`: Tequila 30 30 Reposado 1.750L, Agua Ciel 1L y blue label 750ml.
- **1 producto** (Productos de prueba 4.0) no tiene un error fisico de stock: su diferencia proviene de que el reporte no mostraba una devolucion posterior a un ajuste manual.
- En los demas casos, la diferencia ya estaba presente en capturas historicas o no existe una captura suficiente para atribuirla a un usuario u operacion concreta. Corregirlos automaticamente seria especulativo.

## Lectura correcta del problema

El saldo de `product_stocks` es un saldo operativo; el reporte se reconstruye con eventos historicos. Cuando ambos difieren, no significa por si solo que uno este "mal": significa que existio un movimiento de stock que no quedo reflejado de forma equivalente en ambos historiales. Esta auditoria separa lo probado de lo no trazable.

## Casos auditados

| SKU | Producto | Stock | Historial | Dif. | Diagnostico |
|---|---|---:|---:|---:|---|
| PRO-625626 | Botella tequila Lopar | -10 | -120 | +110 | Riesgo alto: producto inactivo con historial incompleto |
| PRO-460396 | Productos de prueba 4.0 | 60 | 50 | +10 | Confirmado: defecto de reporte |
| PRO-441791 | baileys 700ml | 19 | 16 | +3 | Historial incompleto: diferencia de origen no trazable |
| PRO-189396 | Tequila 30 30 REPOSADO 1.750L | 8 | 10 | -2 | Confirmado parcial: cancelacion sin restitucion, mas una unidad sin trazabilidad |
| PRO-579663 | 1800 MILENIO 700ml | 0 | -1 | +1 | Confirmado: diferencia historica previa |
| PRO-978588 | Agua Ciel 1L | 9 | 10 | -1 | Confirmado: cancelacion sin restitucion |
| PRO-713257 | blue label 750ml | 0 | 1 | -1 | Confirmado: cancelacion sin restitucion |
| PRO-342979 | Doritos Nacho | 32 | 33 | -1 | Confirmado: faltante historico sin movimiento auditado |
| PRO-815550 | siete leguas AÑEJO 700ml | 12 | 13 | -1 | Historial incompleto: faltante de una unidad no atribuible |
| PRO-271873 | Siete Leguas BLANCO 1L | 43 | 42 | +1 | Historial contradictorio: excedente de una unidad |
| PRO-722233 | Tostitos VERDES | 14 | 15 | -1 | Confirmado: faltante historico sin movimiento auditado |
| PRO-333639 | V8 SPLASH BERRY BLEND 500ml | 25 | 26 | -1 | Confirmado: faltante historico independiente de la cancelacion |

Los detalles, evidencia y accion sugerida de cada producto estan en `Auditoria_conflictos_stock_Casa_Tahona.csv`.

## Recomendacion operativa

1. No modificar ventas, compras ni cancelaciones pasadas.
2. Hacer conteo fisico de los 10 casos con diferencia real de stock.
3. Registrar un ajuste manual por cada diferencia validada, con la referencia del SKU y esta auditoria.
4. Conservar en el reporte las filas de `Venta cancelada · Devolucion al stock`; asi las devoluciones dejan de parecer ventas vigentes.
5. Antes de corregir datos masivos, encapsular venta y restauracion de una cancelacion en una transaccion atomica y registrar siempre el movimiento de inventario.

## Limitacion de evidencia

La bitacora historica permite demostrar las cancelaciones con o sin restitucion y fechar algunas divergencias, pero no conserva un movimiento de inventario independiente para cada cambio antiguo. Por esa razon, los casos marcados como "sin movimiento auditado" requieren conteo fisico antes de regularizarlos.
