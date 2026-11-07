# Informe de Actividades

**Fecha:** 03/11/2026  
**Proyecto:** Degollado Lopar - Casa Tahona  
**Periodo revisado:** 30/10/2026  
**Responsable:** Carlos Calderón

| N° | CODE | Tarea | Horas estimadas |
|---:|:---:|---|---:|
| 1 | C-01 | Adaptar la plantilla `consumo.html` al sistema e integrar la navegación del nuevo módulo Consumo. | 1.00 |
| 2 | C-02 | Implementar salidas a consumo por cliente, producto, piezas, precio y fecha límite, con descuento y trazabilidad del inventario. | 2.00 |
| 3 | C-03 | Implementar devolución parcial o total y liquidación de piezas consumidas mediante el flujo existente de ventas y caja. | 2.50 |
| 4 | C-04 | Integrar cobro a crédito, verificación de cupo y vencimientos, y bloqueo de nuevas salidas cuando existan obligaciones vencidas. | 1.50 |
| 5 | C-05 | Mostrar alertas de consumo y cantidades «En consumo» en Productos. | 1.00 |
| 6 | C-06 | Generar y permitir reimprimir tickets de salida y liquidación. | 1.50 |
| 7 | C-07 | Preparar la persistencia SQL y validar el flujo con pruebas de inventario, crédito, caja e interfaz. | 2.50 |
| | | **Total estimado** | **12.00** |

**Alcance:** nuevo módulo Casa Tahona > Consumo, basado en la plantilla entregada `consumo.html` y las especificaciones recogidas en `docs/casa-tahona-consumo.md`. El trabajo está en los commits `56e4de1` y `52e0b8b` del 30/10/2026. Las horas son una propuesta de Codex basada en el alcance del código y las pruebas; no son tiempo cronometrado.

**Estado técnico:** la implementación y las pruebas locales están documentadas. `vinos_consumo.sql` fue preparado para revisión y ejecución manual en la base de VINOS; la documentación indica que no se ejecutó en producción. La activación operativa requiere esa migración, publicar el frontend y validar con datos de prueba en el entorno real. Este informe describe trabajo realizado, no confirma que el módulo esté activo en producción.

**Evidencia:** `consumo.html`; `components/Vinos/VinosConsumptionScreen.tsx`; `components/Vinos/VinosConsumptionAlerts.tsx`; `services/vinos/consumption.service.ts`; `services/vinos/consumptionTicket.ts`; `vinos_consumo.sql`; `tests/vinosConsumption.integration.mjs`; `tests/vinosConsumption.browser.mjs`; `docs/casa-tahona-consumo.md`.
