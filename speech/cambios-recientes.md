# GRUPO LOPAR — Cambios Recientes

> **Propósito:** complementar `resumen-proyecto.md` con los cambios funcionales y técnicos implementados después de la versión base del documento.  
> **Alcance:** Materiales, Concretera, autenticación, PDFs, reportes, compras, crédito y despliegue.

---

## 1. Autenticación propia de empleados

Se reemplazó la dependencia operativa de `Supabase Auth` por un flujo propio basado en tablas y RPCs del esquema `public`.

### Modelo actual

- Tabla principal de empleados: `public.app_user_profiles`
- Tabla de sesiones: `public.app_user_sessions`
- Hash de contraseña guardado en `app_user_profiles.password_hash`
- La aplicación ya no depende de `auth.users` para login diario
- La visibilidad de módulos depende de `app_user_business_unit_access` y de la sucursal asignada, no del `role_key`

### RPCs activas

- `app_set_user_password(uuid, text)`
- `app_login_user(text, text)`
- `app_validate_session(uuid)`
- `app_logout_user(uuid)`
- `app_build_employee_payload(uuid)`

### Impacto en frontend

- [services/auth/auth.service.ts](/home/carlos-calderon/Escritorio/FreeLancer/developeraxoramexico/services/auth/auth.service.ts)
- [App.tsx](/home/carlos-calderon/Escritorio/FreeLancer/developeraxoramexico/App.tsx)
- [services/auth/permissions.ts](/home/carlos-calderon/Escritorio/FreeLancer/developeraxoramexico/services/auth/permissions.ts)

El login:
- guarda el token de sesión propio
- valida sesión por RPC
- cierra sesión por RPC
- ya no usa `supabase.auth.signInWithPassword()`

Regla operativa actual:
- `role_key` identifica el tipo de usuario, pero no bloquea módulos por sí mismo
- `app_user_business_unit_access` define qué áreas puede ver el usuario
- `app_user_branch_access` define a qué sucursales puede entrar

---

## 2. Despliegue en Vercel

Se agregó configuración explícita para SPA y control de caché.

### Archivo

- [vercel.json](/home/carlos-calderon/Escritorio/FreeLancer/developeraxoramexico/vercel.json)

### Qué resuelve

- reescritura de rutas internas hacia `index.html`
- soporte correcto para refresh en rutas como `/materiales/venta`
- reducción de inconsistencias por caché agresiva del HTML en producción

### Regla aplicada

- `rewrites`: `/(.*) -> /index.html`
- `headers`: `Cache-Control: no-store, no-cache, must-revalidate, proxy-revalidate`

---

## 3. Créditos y notas históricas

Se corrigió el soporte para ventas históricas cuyo subtotal por línea no coincide con `qty * unit_price`.

### Criterio nuevo

- si existe `line_total`, ese valor manda
- solo se usa `qty * unit_price` como fallback

### Pantallas afectadas

- detalle de venta
- historial de ventas
- notas de crédito
- PDF de nota de venta

### Impacto técnico

- se respeta el subtotal histórico real de líneas especiales
- el sistema ya no “reconstruye” importes incorrectamente en UI o PDF

---

## 4. PDFs de venta

Se hicieron varias correcciones relevantes en la impresión de ventas.

### Ajustes implementados

- paginación real para ventas con muchas filas
- aumento del número de filas por página antes de saltar a otra hoja
- soporte de subtotales por `line_total`
- soporte de `PAGARE MERCANTIL` para ventas a crédito en Materiales
- corrección de título por unidad de negocio:
  - Materiales imprime `MATERIALES ...`
  - Concretera imprime `CONCRETERA ...`
- footer dependiente de sucursal
- tabla de `ABONOS REALIZADOS` al imprimir desde `Notas de Crédito`

### Nota importante

La tabla de abonos en el PDF ya no depende de haber abierto antes el modal `Historial de Abonos`.  
Ahora el botón `Imprimir venta` consulta los pagos de esa nota en tiempo real.

### Archivos principales

- [components/Customers/CustomerScreen.tsx](/home/carlos-calderon/Escritorio/FreeLancer/developeraxoramexico/components/Customers/CustomerScreen.tsx)
- [components/Concrete/ConcreteCustomersScreen.tsx](/home/carlos-calderon/Escritorio/FreeLancer/developeraxoramexico/components/Concrete/ConcreteCustomersScreen.tsx)
- [services/pdf/customerStatementPdf.ts](/home/carlos-calderon/Escritorio/FreeLancer/developeraxoramexico/services/pdf/customerStatementPdf.ts)
- [services/pdf/branchFooter.ts](/home/carlos-calderon/Escritorio/FreeLancer/developeraxoramexico/services/pdf/branchFooter.ts)

---

## 5. Clientes y crédito

Se extendieron y homologaron flujos entre Materiales y Concretera.

### Materiales

- historial de abonos con búsqueda por folio o referencia
- edición de tipo de venta con persistencia real de montos
- soporte de saldo a favor en ventas y cambios de forma de pago
- corrección del folio visible en ventas legacy

### Concretera

- paridad funcional del módulo de clientes respecto a Materiales
- historial de abonos
- notas de crédito
- ventas en efectivo
- saldo a favor
- búsqueda de abonos por folio o referencia

---

## 6. Saldo a favor

Se consolidó el uso de billetera/saldo a favor para clientes.

### Casos soportados

- `SALDO A FAVOR`
- `SALDO A FAVOR + EFECTIVO`
- `SALDO A FAVOR + CREDITO`
- venta híbrida cuando el saldo no cubre el total

### Persistencia corregida

En cambios de tipo de venta también se actualizan:

- `payment_type`
- `wallet_amount`
- `cash_amount`
- `credit_amount`
- `wallet_id`

### Servicios relacionados

- [services/wallet.service.ts](/home/carlos-calderon/Escritorio/FreeLancer/developeraxoramexico/services/wallet.service.ts)
- [services/concretera/wallet.service.ts](/home/carlos-calderon/Escritorio/FreeLancer/developeraxoramexico/services/concretera/wallet.service.ts)
- [services/pdf/walletHistoryPdf.ts](/home/carlos-calderon/Escritorio/FreeLancer/developeraxoramexico/services/pdf/walletHistoryPdf.ts)

### Exportación nueva

En `Gestionar cliente -> Saldo a favor` de Materiales se agregó `Exportar historial`.

Ese PDF:

- mantiene el formato visual de los demás documentos del sistema
- separa movimientos en dos tablas:
  - `RECARGAS REALIZADAS`
  - `GASTOS REALIZADOS`
- centra el contenido de las tablas y muestra total acumulado por cada una
- funciona solo en Materiales

---

## 7. Compras / Entradas

Se mejoró la consulta y navegación del historial de compras.

### Cambios

- búsqueda por:
  - número de entrada
  - remisión / referencia
  - proveedor
  - monto total
- se quitó el límite artificial de 50 registros
- paginación sobre todo el historial
- se cambió el tamaño de página a 15 registros

### Archivos

- [components/Inventory/PurchasesScreen.tsx](/home/carlos-calderon/Escritorio/FreeLancer/developeraxoramexico/components/Inventory/PurchasesScreen.tsx)
- [components/Concrete/ConcretePurchasesScreen.tsx](/home/carlos-calderon/Escritorio/FreeLancer/developeraxoramexico/components/Concrete/ConcretePurchasesScreen.tsx)

---

## 8. Caja / Venta

Se agregó ajuste rápido de stock desde el módulo de venta.

### Objetivo

Evitar que el cajero pierda el carrito cuando necesita aumentar stock a mitad de la venta.

### Flujo nuevo

- botón `Actualizar stock producto`
- selección del producto dentro del modal
- captura de nuevo stock
- observación obligatoria
- refresco de stock sin salir de caja
- el carrito actual se conserva

### Archivo principal

- [components/POS/POSScreen.tsx](/home/carlos-calderon/Escritorio/FreeLancer/developeraxoramexico/components/POS/POSScreen.tsx)

---

## 9. Reportes

Se rediseñaron y corrigieron los reportes para uso móvil y escritorio.

### Mejoras de presentación

- layout más compacto y legible
- filtros más claros
- exportaciones integradas con mejor ubicación
- tablas recientes con menos ruido
- mejoras de responsividad en móvil

---

## 10. Navegación y permisos visuales

La navegación lateral ahora inicia en estado colapsado por defecto para mostrar solo los encabezados de módulo.

### Estado actual

- El sidebar arranca sin desplegar submenús.
- Los módulos visibles se muestran agrupados por unidad de negocio:
  - Materiales
  - Concretera
  - Logística
  - Transportes
- El usuario abre manualmente cada grupo cuando lo necesita.
- El estado expandido no se fuerza al cargar la sesión.

### Permisos

- La visibilidad de módulos y sucursales sigue dependiendo de:
  - `app_user_business_unit_access`
  - `app_user_branch_access`
- El rol identifica el tipo de usuario, pero no actúa como bloqueo fijo por sí solo.
- La sucursal preseleccionada no equivale a permiso; solo es valor inicial.

---

## 11. Inventario fisico de Materiales

Se agrego un modulo nuevo dentro de Materiales para conteos fisicos de inventario.

### Flujo

- crear inventario con nombre, fecha inicio, fecha fin y estado
- listar inventarios creados por sucursal
- seleccionar inventario para capturar productos
- buscar producto por nombre, codigo o codigo de barras
- registrar stock sistema, stock fisico, diferencia y observacion
- exigir observacion cuando exista diferencia
- finalizar o reactivar inventario

### Metricas

- total de productos capturados
- productos sin diferencia
- productos con faltante
- productos con sobrante
- porcentaje de fiabilidad solo para productos `ANILLO`

### Archivos

- [components/Inventory/PhysicalInventoryScreen.tsx](/home/carlos-calderon/Escritorio/FreeLancer/developeraxoramexico/components/Inventory/PhysicalInventoryScreen.tsx)
- [services/inventory/physicalInventory.service.ts](/home/carlos-calderon/Escritorio/FreeLancer/developeraxoramexico/services/inventory/physicalInventory.service.ts)
- [crear_modulo_inventario_fisico_materiales.sql](/home/carlos-calderon/Escritorio/FreeLancer/developeraxoramexico/crear_modulo_inventario_fisico_materiales.sql)

### Gráficas

- `Top productos` ordenado por facturación real
- `Menos vendidos` ordenado por cantidad vendida
- exclusión de productos con cero ventas
- ajuste de padding y ancho útil en gráficas horizontales
- `Stock actual vs mínimo` refinado para mostrar comparaciones más útiles

### Archivos

- [components/Reports/ReportsScreen.tsx](/home/carlos-calderon/Escritorio/FreeLancer/developeraxoramexico/components/Reports/ReportsScreen.tsx)
- [components/Concrete/ConcreteReportsScreen.tsx](/home/carlos-calderon/Escritorio/FreeLancer/developeraxoramexico/components/Concrete/ConcreteReportsScreen.tsx)

---

## 10. Proveedores

No hay cambios persistentes recientes en el modelo de proveedores.  
Se intentó una modificación de campos (`documento`, `estado`) y después se revirtió porque no correspondía a este sistema.

Estado final:

- formulario y servicios de proveedores siguen con la estructura previa
- no quedó SQL nuevo aplicado en el repositorio para ese intento

---

## 11. Migraciones y datos legacy

Durante este ciclo también se trabajó en:

- migración de clientes con deuda desde sistemas legacy
- migración de notas, ventas y abonos históricos
- corrección manual de ventas/notas mal vinculadas
- normalización de referencias `LEG-*`

No todos esos scripts quedaron como artefactos permanentes en la raíz, pero el soporte funcional resultante sí quedó integrado en la app.

---

## 12. Estado actual

El estado actual del proyecto combina:

- autenticación propia por empleados
- SPA preparada para Vercel
- créditos y ventas históricas corregidas
- PDFs con subtotales reales y abonos impresos
- reportes más legibles
- paridad funcional más alta entre Materiales y Concretera

---

## 13. Alertas de clientes

Se mejoró la vista de `Alertas clientes` para mostrar no solo la cantidad de clientes por filtro, sino también el monto de deuda acumulado por cada categoría.

### Nuevos importes por vista

- `Vencidos`
- `Por vencer 7 días`
- `Límite excedido`
- `Límite preventivo`
- `Todos`

Cada botón ahora muestra:

- cantidad de clientes dentro del filtro
- suma total de deuda de ese grupo en pesos

### Archivo

- [components/CreditAlerts/CreditAlertsScreen.tsx](/home/carlos-calderon/Escritorio/FreeLancer/developeraxoramexico/components/CreditAlerts/CreditAlertsScreen.tsx)

---

## 14. Documentos de clientes

Se agregó soporte para adjuntar hasta 2 documentos por cliente en alta y edición de clientes de crédito.

### Alcance

- permite subir PDF o imagen
- se carga a Cloudinary mediante la misma función de subida usada para evidencias
- funciona tanto al crear como al editar clientes
- si un documento ya existe y se reemplaza, el archivo anterior se elimina de Cloudinary

### Archivos

- [components/Customers/CustomerScreen.tsx](/home/carlos-calderon/Escritorio/FreeLancer/developeraxoramexico/components/Customers/CustomerScreen.tsx)
- [components/Concrete/ConcreteCustomersScreen.tsx](/home/carlos-calderon/Escritorio/FreeLancer/developeraxoramexico/components/Concrete/ConcreteCustomersScreen.tsx)
- [services/credit/credit.service.ts](/home/carlos-calderon/Escritorio/FreeLancer/developeraxoramexico/services/credit/credit.service.ts)
- [services/concretera/credit.service.ts](/home/carlos-calderon/Escritorio/FreeLancer/developeraxoramexico/services/concretera/credit.service.ts)
- [crear_tablas_documentos_clientes.sql](/home/carlos-calderon/Escritorio/FreeLancer/developeraxoramexico/crear_tablas_documentos_clientes.sql)

---

## 15. Evidencias de abonos

Se mejoró el modal `Evidencias del Abono` para permitir adjuntar nuevos archivos directamente desde la vista de evidencias ya registradas.

### Nuevo flujo

- ver evidencias existentes
- seleccionar uno o varios archivos adicionales
- adjuntarlos al mismo abono sin salir del modal

### Archivos

- [components/Customers/CustomerScreen.tsx](/home/carlos-calderon/Escritorio/FreeLancer/developeraxoramexico/components/Customers/CustomerScreen.tsx)
- [components/Concrete/ConcreteCustomersScreen.tsx](/home/carlos-calderon/Escritorio/FreeLancer/developeraxoramexico/components/Concrete/ConcreteCustomersScreen.tsx)

---

## 16. Módulo de Transportería (TRANSPORTES)

Se integró un tercer módulo de negocio: **Transportería**, para la sucursal **Degollado**. Incluye nuevos roles, navegación condicional, corrección de datos segregados y paridad funcional con Materiales.

> **Fecha de implementación:** 2026-05-10 / 2026-05-11

---

### 16.1 Nuevo rol: `transport_user`

Se agregó `Role.TRANSPORT_USER` al sistema. Comportamiento:

- Solo puede ver y operar en la sucursal **Degollado** (filtro por nombre `DEGOLLADO`)
- Al crear un usuario con este rol, la sucursal Degollado se **auto-selecciona**
- Unidades de negocio por defecto: `transporteria` + `logistica`
- Permisos por defecto incluyen `logistica.diesel.view`
- En `isUnitDisabled`: solo permite marcar `transporteria` y `logistica`
- En `isBranchDisabled`: solo permite marcar sucursales con nombre `DEGOLLADO`

**Archivo:** `components/Users/UsersScreen.tsx`

---

### 16.2 Navegación sidebar condicional

**Archivo:** `components/Layout.tsx`

#### Cambios aplicados:

| Cambio | Detalle |
|--------|---------|
| Icono Concretera | Reemplazado emoji 🧱 por SVG `BrickIcon` personalizado (ladrillo naranja 3D) |
| Nombre Transportería | Renombrado a `TRANSPORTES` en sidebar |
| Tipo de icono | `NavItem.icon` y `NavGroup.icon` ahora aceptan `React.ReactNode` (soporta SVG) |
| Visibilidad transporteria | El grupo TRANSPORTES solo se muestra cuando la sucursal activa contiene `"DEGOLLADO"` en el nombre (`isDegolladoBranch`) |
| Logística para transport_user | Para `Role.TRANSPORT_USER`, los ítems de Logística (Diésel) se insertan dentro del grupo TRANSPORTES, después del primer ítem (Caja/Venta). El grupo Logística original se oculta. |

**Patrón de detección de sucursal:**
```ts
const isDegolladoBranch = activeBranchName.includes('DEGOLLADO');
```

**Patrón de merge de logística para transport_user:**
```ts
if (isTransportUser) {
  const logisticaGroup = built.find((g) => g.id === 'logistica');
  const logisticaItems = logisticaGroup?.items ?? [];
  return built
    .filter((g) => g.id !== 'logistica')
    .map((g) => {
      if (g.id !== 'transporteria') return g;
      const [first, ...rest] = g.items;
      return { ...g, items: [first, ...logisticaItems, ...rest] };
    });
}
```

---

### 16.3 Separación de datos por módulo (bug de estado estale)

Al cambiar entre tabs de Materiales y Transportería, React reutilizaba la misma instancia del componente (misma clase), dejando datos stale visibles.

**Solución:** `key` props únicos por contexto en `App.tsx`:

| Componente | key materiales | key transporteria |
|-----------|----------------|-------------------|
| POSScreen | `pos-materiales` | `pos-transporteria` |
| PurchasesScreen | `purchases-materiales` | `purchases-transporteria` |
| CustomerScreen | `customers-materiales` | `customers-transporteria` |
| InventoryScreen | `inventory-materiales` | `inventory-transporteria` |
| CreditAlertsScreen | `alerts-materiales` | `alerts-transporteria` |
| ReportsScreen | `reports-materiales` | `reports-transporteria` |

Cada `key` distinto fuerza remount completo → estado fresco → datos correctos.

---

### 16.4 Filtros de datos por `businessUnit`

Los módulos que comparte Materiales y Transportería ahora filtran por `businessUnit` prop:

#### CreditAlertsScreen
- Recibe prop `businessUnit?: string`
- Ambas llamadas al servicio pasan `businessUnit` para filtrar clientes y notas

#### ReportsScreen
- Recibe prop `businessUnit?: string`
- `listProductsByBranch` usa `businessUnit` para catálogo
- Query de `inventory_transactions` filtra `.eq('business_unit', businessUnit)` cuando está definido

#### POSScreen — Historial de Ventas
- Query de `inventory_transactions` filtra `.eq('business_unit', businessUnit)` en `countQuery` y `transactionsQuery`
- `businessUnit` agregado al deps array de `loadSalesHistory`

---

### 16.5 Funcionalidades habilitadas para Transportería

Estas funciones estaban ocultas con `!isTransportBranch` y se habilitaron para transporteria:

| Funcionalidad | Componente |
|--------------|------------|
| KPI Saldo a favor | POSScreen |
| Sección editar tipo de pago con saldo a favor | POSScreen |
| Confirmar venta con saldo a favor | POSScreen |
| Botón "Actualizar stock producto" | POSScreen |
| Grid KPI Saldo a favor | CustomerScreen |
| Sección gestión saldo a favor | CustomerScreen |
| Columna "Saldo a favor" en tabla clientes | CustomerScreen |
| Upload documentos al crear/editar cliente | CustomerScreen |
| Botón "Ventas en efectivo" | CustomerScreen |

---

### 16.6 Fix crítico: `business_unit` no se guardaba en ventas

**Problema:** `createSale` en `services/inventory/purchases.service.ts` nunca incluía `business_unit` en el INSERT. PostgreSQL aplicaba el DEFAULT `'materiales'` a todas las ventas, incluyendo las de transporteria.

**Consecuencia:** Ventas hechas en transporteria tenían `business_unit = 'materiales'` → no aparecían en el Historial de Ventas de transporteria (que filtra `.eq('business_unit', 'transporteria')`).

**Fix aplicado:**

```ts
// services/inventory/purchases.service.ts

// 1. Agregado a CreateSaleInput interface:
business_unit?: string | null;

// 2. Agregado al INSERT:
business_unit: business_unit ?? 'materiales',
```

```ts
// components/POS/POSScreen.tsx

// 3. Ahora se pasa al llamar createSale:
const transaction = await purchasesService.createSale({
  branch_id: branchId,
  business_unit: businessUnit,   // ← nuevo
  ...
});
```

**Ventas históricas mal clasificadas:** Para corregir solo las ventas específicas afectadas:

```sql
UPDATE inventory_transactions
SET business_unit = 'transporteria'
WHERE id IN (1682, 1683, 1684);
-- Ajustar IDs según ventas reales
```

---

### 16.7 Fix: Edge Function audit-log rechazaba logs de transporteria

**Archivo:** `supabase/functions/audit-log/index.ts`

**Problema:** El tipo `AuditModule` solo aceptaba `'materiales' | 'concretera'`. `normalizeModule()` retornaba `null` para `'transporteria'` → la Edge Function lanzaba `"Invalid module value"` → todos los logs de auditoría de transportería fallaban silenciosamente.

**Fix:**

```ts
// Antes:
type AuditModule = 'materiales' | 'concretera';

// Después:
type AuditModule = 'materiales' | 'concretera' | 'transporteria';
```

```ts
// Agregado en normalizeModule():
if (normalized === 'transporteria') return 'transporteria' as AuditModule;

// Agregado en moduleAliases:
transporteria: ['transporteria'],
```

> ✅ **DESPLEGADA** manualmente vía Supabase Dashboard el 2026-05-11.

---

### 16.8 Resumen de archivos modificados en este ciclo

| Archivo | Tipo de cambio |
|---------|---------------|
| `components/Layout.tsx` | BrickIcon SVG, rename TRANSPORTES, isDegolladoBranch, TRANSPORT_USER nav merge |
| `components/Users/UsersScreen.tsx` | Rol transport_user: branch auto-select, permisos, unidades |
| `components/POS/POSScreen.tsx` | Saldo a favor habilitado, filtro business_unit historial, fix createSale |
| `components/Customers/CustomerScreen.tsx` | Saldo a favor, documentos, ventas en efectivo habilitados |
| `components/CreditAlerts/CreditAlertsScreen.tsx` | Filtro businessUnit para transporteria |
| `components/Reports/ReportsScreen.tsx` | Filtro businessUnit para transporteria |
| `services/inventory/purchases.service.ts` | CreateSaleInput + business_unit en INSERT |
| `supabase/functions/audit-log/index.ts` | Soporte transporteria (pendiente redeploy) |
| `App.tsx` | key props por contexto (remount), businessUnit en props de screens transporteria |
