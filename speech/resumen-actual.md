# GRUPO LOPAR — Resumen Actual del Sistema

> Documento consolidado con el estado vigente del proyecto.  
> Complementa y unifica `resumen-proyecto.md` + `cambios-recientes.md`.

---

## 1. Estado general

El sistema **GRUPO LOPAR Industrial OS** opera como una plataforma web para:

- **Materiales**
- **Concretera**
- **Logística**
- **Transportes**

Todo vive bajo el mismo dominio y el mismo frontend, pero con reglas de visibilidad por:

- sucursal
- unidades de negocio
- permisos del usuario

El `role_key` identifica el tipo de usuario, pero no actúa como bloqueo rígido por sí solo.

---

## 2. Autenticación actual

El login ya no depende del flujo diario de `Supabase Auth`.

### Modelo de sesión

- Usuarios en `public.app_user_profiles`
- Sesiones en `public.app_user_sessions`
- Contraseña en `app_user_profiles.password_hash`
- Validación por RPC
- Token propio guardado en `localStorage`

### RPCs principales

- `app_set_user_password(uuid, text)`
- `app_login_user(text, text)`
- `app_validate_session(uuid)`
- `app_logout_user(uuid)`
- `app_build_employee_payload(uuid)`

### Comportamiento

- login en 2 pasos
- bloqueo temporal por intentos fallidos
- validación de sesión al abrir la app
- logout por RPC

---

## 3. Permisos y visibilidad

La visibilidad real del sistema depende de:

- `app_user_business_unit_access`
- `app_user_branch_access`
- permisos individuales del usuario

### Regla actual

- `role_key` sirve como clasificación
- no debe usarse como candado total si ya hay permisos explícitos
- la sucursal preseleccionada no equivale a permiso

### Sidebar

- arranca colapsado por defecto
- solo muestra encabezados de módulo al entrar
- módulos agrupados:
  - Materiales
  - Concretera
  - Logística
  - Transportes
- el usuario abre manualmente cada grupo

---

## 4. Módulos actuales

### Materiales

- Caja / Venta
- Compras / Entradas
- Productos
- Inventario fisico
- Clientes / Crédito
- Alertas clientes
- Reportes
- Auditorías
- Sucursales
- Personal / Usuarios

### Concretera

- Caja / Venta
- Compras / Entradas
- Productos
- Clientes / Crédito
- Alertas clientes
- Reportes
- Auditorías

### Logística

- Gestión de Diésel

### Transportes

- Caja / Venta
- Compras / Entradas
- Productos
- Clientes / Crédito
- Alertas clientes
- Reportes
- Auditorías

---

## 5. Cambios funcionales recientes

### 5.1 PDFs de venta

- soporte de `PAGARE MERCANTIL` para crédito
- subtotales históricos por `line_total`
- footer por sucursal
- título correcto por unidad de negocio
- tabla de `ABONOS REALIZADOS` en impresión de notas de crédito

### 5.2 Clientes y crédito

- historial de abonos con búsqueda por folio o referencia
- notas de crédito vinculadas correctamente a ventas
- corrección de folio visible en notas históricas
- saldo a favor integrado a ventas y abonos
- exportación de historial de saldo a favor

### 5.3 Compras / Entradas

- búsqueda por entrada, remisión, proveedor y monto total
- sin límite artificial de registros
- paginación ajustada

### 5.4 Caja / Venta

- ajuste rápido de stock desde el módulo de venta
- modal de actualización de stock con observación
- conservación del carrito al ajustar stock

### 5.5 Inventario fisico

- nuevo modulo en Materiales: `/materiales/inventario`
- creacion de inventarios por nombre, fecha inicio, fecha fin y estado
- captura de productos con stock sistema, stock fisico, diferencia y observacion obligatoria si hay diferencia
- resumen de total de productos, sin diferencias, faltantes, sobrantes
- fiabilidad calculada solo con productos tipo `ANILLO`
- tablas nuevas:
  - `material_physical_inventories`
  - `material_physical_inventory_items`

### 5.6 Reportes

- vistas más compactas y responsivas
- tarjetas y gráficas más limpias
- filtros más claros

---

## 6. Auditoría

La auditoría ahora registra mejor las eliminaciones de ventas.

### Lo que se guarda

- entidad: `venta`
- acción: `ELIMINAR`
- descripción de la venta
- detalle de productos eliminados

### Detalle agregado

Para eliminaciones de venta se guarda un campo `detalle` con:

- producto
- sku
- unidad / presentación
- tipo de venta
- cantidad
- factor
- precio unitario
- subtotal

---

## 7. Vercel y producción

Se agregó soporte para SPA y refresh de rutas internas.

### Incluye

- rewrites hacia `index.html`
- control de caché para evitar HTML viejo
- soporte de refresh en rutas como `/materiales/venta`

---

## 8. Correcciones de base de datos

Se han corregido varios casos de migración histórica:

- notas de crédito faltantes
- ventas a crédito sin vínculo correcto
- saldos a favor no descontados
- folios históricos que chocaban con unicidad
- clientes legacy sin `business_unit`

También se trabajó en la clonación de clientes de Materiales hacia Transportes, sin arrastrar:

- ventas
- notas
- pagos
- wallets
- saldos

---

## 9. Módulo Vino

Hay una propuesta técnica para un nuevo módulo:

- CRM de clientes
- frecuencia de recompra
- alertas de abandono
- campañas automáticas
- WhatsApp
- puntos y niveles
- recomendaciones inteligentes

La propuesta está documentada en:

- `speech/propuesta-modulo-vino.txt`

---

## 10. Documentos de referencia

### Documento base

- `speech/resumen-proyecto.md`

### Cambios recientes

- `speech/cambios-recientes.md`

### Propuesta futura

- `speech/propuesta-modulo-vino.txt`

### Resumen consolidado

- `speech/resumen-actual.md`
