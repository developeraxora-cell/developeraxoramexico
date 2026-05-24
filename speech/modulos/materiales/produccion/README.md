# Materiales · Producción

**Estado:** ⚠️ Parcial (solo UI) · **Ruta:** `/materiales/produccion`
**Archivos:** `components/Production/ProductionScreen.tsx`

## Resumen
Módulo de producción interna con el diseño del sistema. La interfaz está completa; la lógica aún no se implementa.

## Funcionalidades (visual)
- Lista "Gestión de Producciones": ID, Fecha, Responsable, Observaciones, Fecha Registro, Acciones.
- Acciones por fila: Editar y Eliminar (reemplazan al antiguo botón "Config").
- Botón "Nueva Producción" → formulario "Nueva Producción Interna":
  - Datos: Fecha de Producción, Responsable, Observaciones.
  - "Materia Prima Utilizada": Producto, Stock Actual, Unidad, Cantidad Usada.
  - "Productos Terminados": Producto, Actual, Número Pareas, Peso, Peso Ajustado, Acciones + "Agregar Producto".
  - Botones "Procesar Producción" y "Limpiar".

## Pendientes (❌ toda la lógica)
- Backend/RPC y tablas de producción.
- Carga real de materias primas y productos terminados.
- Cálculo de peso / peso ajustado / número de pareas.
- Procesar producción + descuento de stock de materia prima y alta de terminados.
- Editar / eliminar reales y persistencia. Datos actuales son de muestra.
