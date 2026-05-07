# GRUPO LOPAR — Industrial OS
## Documentación Técnica Completa del Sistema

> **Versión del documento:** 1.0  
> **Proyecto:** `pos-ferremateriales`  
> **Audiencia:** Desarrolladores nuevos, equipo técnico, revisores de código  
> **Idioma del sistema:** Español (México)

> **Complemento de cambios recientes:** [cambios-recientes.md](/home/carlos-calderon/Escritorio/FreeLancer/developeraxoramexico/speech/cambios-recientes.md)

---

## Tabla de Contenidos

1. [Descripción General del Proyecto](#1-descripción-general-del-proyecto)
2. [Arquitectura del Sistema](#2-arquitectura-del-sistema)
3. [Autenticación y Autorización](#3-autenticación-y-autorización)
4. [Modelo de Base de Datos](#4-modelo-de-base-de-datos)
5. [Módulos del Sistema](#5-módulos-del-sistema)
6. [Vistas y Componentes](#6-vistas-y-componentes)
7. [Funcionalidades Principales](#7-funcionalidades-principales)
8. [APIs y Endpoints](#8-apis-y-endpoints)
9. [Configuración del Proyecto](#9-configuración-del-proyecto)
10. [Resumen Técnico Final](#10-resumen-técnico-final)

---

## 1. Descripción General del Proyecto

### ¿Qué problema resuelve?

**GRUPO LOPAR Industrial OS** es un sistema de gestión empresarial integral diseñado para una empresa industrial mexicana con dos unidades de negocio principales:

- **Materiales:** Venta, compra y gestión de materiales de construcción (varillas, cemento, arena, etc.)
- **Concretera:** Producción y entrega de concreto premezclado por metros cúbicos

El sistema centraliza operaciones que antes eran manuales o dispersas en herramientas separadas: ventas en mostrador, control de crédito, inventario, logística de combustible, auditorías y reportes.

### ¿Para quién está diseñado?

| Actor | Descripción |
|-------|-------------|
| Superadministrador | Dueño o director con acceso total a todo el sistema |
| Socio | Accionista con acceso a Jesús María (ambas unidades de negocio) |
| Usuario Materiales | Empleado de mostrador en una sucursal específica |
| Usuario Concretera | Operador de concretera en una sucursal específica |

### Objetivo principal

Proveer control unificado de ventas, inventario, crédito a clientes, compras, logística de diésel y auditoría de cambios — con restricciones por rol, sucursal y unidad de negocio —, reemplazando procesos manuales por un sistema web profesional y seguro.

### Sucursales del sistema

| ID | Nombre | Código |
|----|--------|--------|
| 1 | Degollado Lopar | B1 |
| 2 | Jesús María Lopar | B2 |

---

## 2. Arquitectura del Sistema

### Stack tecnológico

| Capa | Tecnología | Versión |
|------|-----------|---------|
| Frontend | React + TypeScript | 19.x |
| Build tool | Vite | — |
| Estilos | Tailwind CSS | — |
| Routing | React Router DOM | 7.x |
| Backend / DB | Supabase (PostgreSQL) | 2.x |
| Autenticación | RPC functions en Supabase | — |
| Auditoría | MongoDB vía Supabase Edge Functions | — |
| Gráficos | Recharts | 2.x |
| PDF | pdf-lib | 1.x |
| Iconos | Lucide React | 0.56x |
| CAPTCHA UI | react-simple-captcha / widget custom | — |
| Evidencias de pago | Cloudinary | — |

### Organización de carpetas

```
/
├── App.tsx                          ← Orquestador principal. Estado global, routing, sesión
├── index.tsx                        ← Punto de entrada React con BrowserRouter
├── types.ts                         ← Todos los tipos, interfaces y enums
├── constants.tsx                    ← Datos de ejemplo / seeding local
├── vite.config.ts                   ← Configuración Vite (puerto 3000, alias @)
├── package.json
├── .env.local                       ← Variables de entorno (NUNCA subir a git)
│
├── components/
│   ├── Layout.tsx                   ← Sidebar navegación, selector de sucursal
│   ├── Auth/LoginScreen.tsx         ← Login en 2 pasos + captcha
│   ├── Users/UsersScreen.tsx        ← CRUD personal/usuarios
│   ├── Branches/BranchesScreen.tsx  ← CRUD sucursales
│   ├── POS/POSScreen.tsx            ← Ventas Materiales
│   ├── Inventory/
│   │   ├── InventoryScreen.tsx      ← Productos e inventario Materiales
│   │   ├── PurchasesScreen.tsx      ← Compras/entradas Materiales
│   │   └── NewProductModal.tsx      ← Modal crear producto
│   ├── Customers/CustomerScreen.tsx ← Clientes y crédito Materiales
│   ├── Reports/ReportsScreen.tsx    ← Reportes Materiales
│   ├── Audit/AuditScreen.tsx        ← Auditoría de cambios
│   ├── CreditAlerts/               ← Alertas de crédito vencido
│   ├── Wallet/                      ← Billeteras de cliente (prepago)
│   ├── Concrete/                    ← Todos los módulos de Concretera
│   │   ├── ConcretePOSScreen.tsx
│   │   ├── ConcretePurchasesScreen.tsx
│   │   ├── ConcreteInventoryScreen.tsx
│   │   ├── ConcreteCustomersScreen.tsx
│   │   ├── ConcreteReportsScreen.tsx
│   │   ├── ConcreteFleet.tsx        ← Flota de camiones mezcladores
│   │   ├── ConcreteFormulas.tsx     ← Fórmulas de mezcla
│   │   └── ConcreteOps.tsx          ← Operaciones de producción
│   ├── Diesel/DieselScreen.tsx      ← Gestión de combustible
│   └── common/                      ← Componentes reutilizables
│       ├── ConfirmModal.tsx
│       ├── FeedbackModal.tsx
│       ├── StatusModal.tsx
│       └── CustomerSearchSelect.tsx
│
├── services/
│   ├── supabaseClient.ts            ← Cliente Supabase + servicios base
│   ├── auth/
│   │   ├── auth.service.ts          ← Login, logout, validación sesión
│   │   ├── permissions.ts           ← Lógica de permisos y acceso
│   │   └── routes.ts                ← Mapeo tab ↔ URL
│   ├── inventory/                   ← Servicios catálogo y compras Materiales
│   ├── concretera/                  ← Servicios catálogo, crédito, compras Concretera
│   ├── credit/credit.service.ts     ← Crédito Materiales
│   ├── audit/                       ← Escritura y lectura de auditorías
│   ├── wallet.service.ts            ← Billetera Materiales
│   ├── currency.ts                  ← Formateo moneda MXN
│   ├── conversionEngine.ts          ← Conversión entre unidades de medida
│   ├── uomEquivalence.ts            ← Normalización nombres UOM
│   ├── paymentEvidenceUpload.service.ts
│   ├── shared/customerSelection.service.ts
│   └── pdf/                         ← Generación de PDFs
│
├── supabase/functions/
│   ├── audit-log/index.ts           ← Edge Function: guardar en MongoDB
│   └── payment-evidence-upload/index.ts
│
├── speech/                          ← Documentación técnica
│   └── resumen-proyecto.md          ← Este archivo
│
└── legacy/                          ← SQL de migración/datos históricos
```

### Flujo general de funcionamiento

```
Usuario abre navegador
       ↓
index.tsx → BrowserRouter → App.tsx
       ↓
App carga token del localStorage
       ↓
authService.getCurrentUser(token)  [RPC: app_validate_session]
       ↓
Si válido → loadGlobalData()       [productos, clientes, sucursales, diesel...]
       ↓
Supabase Realtime subscriptions    [sales, stocks, customers, diesel_tanks...]
       ↓
Layout.tsx → renderiza sidebar según permisos del usuario
       ↓
useLocation() determina la ruta activa → renderiza el Screen correspondiente
       ↓
Cada Screen consulta su propio servicio → Supabase → PostgreSQL
       ↓
Cambios críticos se auditan via Edge Function → MongoDB
```

---

## 3. Autenticación y Autorización

### Cómo funciona el login

El login es un flujo de **2 pasos** implementado en `components/Auth/LoginScreen.tsx`:

**Paso 1 — Identificación:**
- El usuario ingresa su nombre de usuario o correo electrónico
- Validación del campo no vacío
- Al continuar pasa al Paso 2

**Paso 2 — Verificación:**
- Muestra el identificador como pill de solo lectura (con botón "Cambiar")
- Campo de contraseña con toggle mostrar/ocultar
- Widget estilo reCAPTCHA (click único, spinner 1.4s, palomita de confirmación)
- Botón "Iniciar sesión"

**Protección anti-brute force:**
- Máximo 5 intentos fallidos
- Bloqueo de 5 minutos tras agotar intentos
- Contador de intentos restantes visible
- Estado persistido en `localStorage`

### Flujo de autenticación técnico

```
LoginScreen.submit()
       ↓
authService.signIn(identifier, password)
       ↓
supabase.rpc('app_login_user', { p_identifier, p_password })
         [hash: md5(user_id::text || ':' || password)]
       ↓
Supabase retorna: AuthPayloadRow {
  session_token,    user_id,      full_name,
  role_key,         active,       default_branch_id,
  session_minutes,  allowed_branch_ids,  allowed_branch_db_ids,
  business_units,   permissions,  expires_at
}
       ↓
Token guardado en localStorage (clave: SESSION_TOKEN_KEY)
       ↓
App.tsx: setCurrentUser(User)
       ↓
Redirect → primera ruta accesible según permisos
```

### Manejo de sesiones

| Aspecto | Implementación |
|---------|---------------|
| Almacenamiento del token | `localStorage` (clave configurable) |
| Duración de sesión | 600 minutos (10 horas), fijo para todos los usuarios |
| Validación de sesión | Al cargar la app: `app_validate_session(token)` |
| Expiración automática | `useEffect` en App.tsx verifica `session_started_at` + `sessionMinutes` |
| Logout | `app_logout_user(token)` → limpia localStorage → redirige a `/` |
| Protección de rutas | Si no hay usuario → `LoginScreen`; si no tiene permiso → redirect al primer tab accesible |

### Roles existentes

| Rol (role_key) | Enum (Role) | Descripción |
|----------------|-------------|-------------|
| `superadmin` | `Role.SUPERADMIN` | Acceso total a todo el sistema y sucursales |
| `admin` | `Role.ADMIN` | Acceso total (equivalente a superadmin en permisos) |
| `socio` | `Role.SOCIO` | Acceso multi-módulo solo en Jesús María |
| `materials_user` | `Role.MATERIALS_USER` | Solo Materiales en su sucursal asignada |
| `concrete_user` | `Role.CONCRETE_USER` | Solo Concretera en su sucursal asignada |
| `cajero` | `Role.CAJERO` | Sin permisos definidos (configuración manual) |
| `almacen` | `Role.ALMACEN` | Sin permisos definidos (configuración manual) |

> **Nota:** `isFullAccessRole(role)` retorna `true` para `ADMIN` y `SUPERADMIN`, lo que bypasea todas las verificaciones de permisos en el frontend.

### Permisos por rol

Los permisos usan el formato: `{business_unit}.{module_key}.{action}`

#### Superadmin / Admin
Acceso completo. No requiere permisos en base de datos — `isFullAccessRole()` lo maneja en frontend.

#### materials_user

| Permiso | Descripción |
|---------|-------------|
| `materiales.sales.view` / `.create` | Ver y crear ventas |
| `materiales.purchases.view` / `.create` | Ver y crear compras/entradas |
| `materiales.products.view` | Ver productos |
| `materiales.customers.view` / `.create` | Ver y crear clientes |
| `materiales.alerts.view` | Ver alertas de crédito |

**Restricción:** Solo su sucursal asignada. Sin Reportes, Auditorías, Sucursales ni Usuarios.

#### concrete_user

| Permiso | Descripción |
|---------|-------------|
| `concretera.sales.view` / `.create` | Ver y crear ventas |
| `concretera.purchases.view` / `.create` | Ver y crear compras/entradas |
| `concretera.products.view` | Ver productos |
| `concretera.customers.view` / `.create` | Ver y crear clientes |
| `concretera.alerts.view` | Ver alertas de crédito |

**Restricción:** Solo su sucursal asignada. Sin Reportes ni Auditorías.

#### socio

Acceso completo a Materiales + Concretera + Logística + Global, **únicamente para la sucursal Jesús María**.

Incluye: ventas, compras, productos (view + edit), clientes, alertas, reportes, exportación, auditorías, sucursales (view), usuarios (view), logística diésel.

### Funciones de permisos (`services/auth/permissions.ts`)

```typescript
isFullAccessRole(role?)        → true si ADMIN o SUPERADMIN
userCanAccess(user, bu, mod, action)  → true si tiene el permiso
userCanAccessTab(user, tabId)  → true si puede ver ese tab
firstAccessibleTab(user, tabIds) → primer tab visible para el usuario
```

### Rutas protegidas

Cada URL está mapeada a un tabId en `services/auth/routes.ts`:

| Tab ID | URL | Módulo |
|--------|-----|--------|
| `pos` | `/materiales/ventas` | Ventas Materiales |
| `purchases` | `/materiales/compras` | Compras Materiales |
| `inventory` | `/materiales/productos` | Productos Materiales |
| `customers` | `/materiales/clientes` | Clientes Materiales |
| `customer-alerts` | `/materiales/alertas` | Alertas Crédito Materiales |
| `reports` | `/materiales/reportes` | Reportes Materiales |
| `audit-internal` | `/materiales/auditorias` | Auditorías Materiales |
| `production` | `/materiales/produccion` | Producción Materiales |
| `branches` | `/sucursales` | Gestión de Sucursales |
| `users` | `/usuarios` | Personal / Usuarios |
| `concrete-pos` | `/concretera/ventas` | Ventas Concretera |
| `concrete-purchases` | `/concretera/compras` | Compras Concretera |
| `concrete-inventory` | `/concretera/productos` | Productos Concretera |
| `concrete-customers` | `/concretera/clientes` | Clientes Concretera |
| `concrete-customer-alerts` | `/concretera/alertas` | Alertas Crédito Concretera |
| `concrete-reports` | `/concretera/reportes` | Reportes Concretera |
| `concrete-audit` | `/concretera/auditorias` | Auditorías Concretera |
| `diesel` | `/logistica/diesel` | Gestión de Diésel |

**Protección:** Si el usuario intenta acceder a una URL sin permiso, `App.tsx` lo redirige automáticamente al primer tab accesible con `{ replace: true }`.

---

## 4. Modelo de Base de Datos

> La base de datos es **PostgreSQL administrada por Supabase**. El esquema principal es `public`.

### Tablas de Autenticación y Usuarios

#### `app_user_profiles`
| Campo | Tipo | Descripción |
|-------|------|-------------|
| `id` | UUID PK | Identificador único del usuario |
| `email` | TEXT | Correo electrónico |
| `username` | TEXT | Nombre de usuario para login |
| `full_name` | TEXT | Nombre completo |
| `role_key` | TEXT | Rol asignado (FK → `app_roles`) |
| `active` | BOOLEAN | Si puede iniciar sesión |
| `default_branch_id` | INTEGER | Sucursal por defecto (FK → `branches`) |
| `session_minutes` | INTEGER | Duración de sesión (fijo: 600) |
| `created_at` | TIMESTAMPTZ | Fecha de creación |

#### `app_roles`
| Campo | Tipo | Descripción |
|-------|------|-------------|
| `role_key` | TEXT PK | Identificador del rol |
| `label` | TEXT | Nombre legible |
| `is_system` | BOOLEAN | Si es rol de sistema |

#### `app_permissions`
| Campo | Tipo | Descripción |
|-------|------|-------------|
| `permission_key` | TEXT PK | Clave del permiso (`bu.module.action`) |
| `business_unit` | TEXT | Unidad de negocio |
| `module_key` | TEXT | Módulo |
| `action` | TEXT | Acción (view, create, edit, delete, export, admin) |
| `label` | TEXT | Descripción legible |

#### `app_role_permissions`
| Campo | Tipo | Descripción |
|-------|------|-------------|
| `role_key` | TEXT | FK → `app_roles` |
| `permission_key` | TEXT | FK → `app_permissions` |

#### `app_user_permissions` (permisos individuales)
Permisos extra por usuario individual (sobreescribe el rol).

#### `app_user_branch_access`
| Campo | Tipo | Descripción |
|-------|------|-------------|
| `user_id` | UUID | FK → `app_user_profiles` |
| `branch_id` | INTEGER | FK → `branches` |

#### `app_user_business_unit_access`
| Campo | Tipo | Descripción |
|-------|------|-------------|
| `user_id` | UUID | FK → `app_user_profiles` |
| `business_unit` | TEXT | `materiales`, `concretera`, `logistica`, `global` |

#### `app_user_sessions`
| Campo | Tipo | Descripción |
|-------|------|-------------|
| `session_token` | TEXT PK | Token único de sesión |
| `user_id` | UUID | FK → `app_user_profiles` |
| `expires_at` | TIMESTAMPTZ | Expiración |
| `created_at` | TIMESTAMPTZ | Inicio de sesión |

### Tablas Operacionales Principales

#### `branches` (Sucursales)
| Campo | Tipo | Descripción |
|-------|------|-------------|
| `id` | SERIAL PK | ID numérico |
| `code` | TEXT | Código legible (B1, B2, ...) |
| `name` | TEXT | Nombre de la sucursal |
| `address` | TEXT | Dirección |
| `is_active` | BOOLEAN | Estado |
| `created_at` | TIMESTAMPTZ | — |

#### `products` (Productos)
| Campo | Tipo | Descripción |
|-------|------|-------------|
| `id` | UUID PK | — |
| `sku` | TEXT | Código de producto |
| `barcode` | TEXT | Código de barras |
| `name` | TEXT | Nombre del producto |
| `category_id` | UUID | FK → `categories` |
| `base_unit_id` | UUID | FK → `uoms` |
| `allows_decimals` | BOOLEAN | Permite cantidades decimales |
| `standard_length_m` | NUMERIC | Longitud estándar (varillas) |
| `min_stock` | NUMERIC | Stock mínimo alerta |
| `max_stock` | NUMERIC | Stock máximo |
| `cost_per_base_unit` | NUMERIC | Costo de compra |
| `price_per_base_unit` | NUMERIC | Precio de venta |
| `module` | TEXT | `materiales` o `concretera` |
| `created_by` | UUID | FK → `app_user_profiles` |
| `deleted_at` | TIMESTAMPTZ | Soft delete |

#### `product_stocks`
| Campo | Tipo | Descripción |
|-------|------|-------------|
| `product_id` | UUID | FK → `products` |
| `branch_id` | INTEGER | FK → `branches` |
| `qty` | NUMERIC | Cantidad actual en stock |

#### `uoms` (Unidades de Medida)
| Campo | Tipo | Descripción |
|-------|------|-------------|
| `id` | UUID PK | — |
| `code` | TEXT | Ej: `kg`, `ton`, `blt` |
| `name` | TEXT | Nombre completo |

#### `product_uoms` (Conversiones por Producto)
| Campo | Tipo | Descripción |
|-------|------|-------------|
| `id` | UUID PK | — |
| `product_id` | UUID | FK → `products` |
| `uom_id` | UUID | FK → `uoms` |
| `factor` | NUMERIC | Factor de conversión a unidad base |
| `is_default_sale` | BOOLEAN | Unidad de venta por defecto |

#### `sales` (Ventas)
| Campo | Tipo | Descripción |
|-------|------|-------------|
| `id` | UUID PK | — |
| `branch_id` | INTEGER | FK → `branches` |
| `customer_id` | UUID | FK → `customers` (nullable = mostrador) |
| `payment_method` | TEXT | `EFECTIVO`, `TARJETA`, `CREDITO`, `BILLETERA`, `HIBRIDA`, `SIN_COSTO` |
| `total` | NUMERIC | Total de la venta |
| `notes` | TEXT | Observaciones |
| `created_by` | UUID | FK → `app_user_profiles` |
| `created_at` | TIMESTAMPTZ | — |
| `module` | TEXT | `materiales` o `concretera` |

#### `sale_items` (Detalle de Venta)
| Campo | Tipo | Descripción |
|-------|------|-------------|
| `id` | UUID PK | — |
| `sale_id` | UUID | FK → `sales` |
| `product_id` | UUID | FK → `products` |
| `qty` | NUMERIC | Cantidad vendida |
| `unit_id` | UUID | FK → `uoms` |
| `unit_price` | NUMERIC | Precio por unidad |
| `subtotal` | NUMERIC | Qty × unit_price |
| `qty_base` | NUMERIC | Cantidad en unidad base |

#### `purchases` (Compras / Entradas)
| Campo | Tipo | Descripción |
|-------|------|-------------|
| `id` | UUID PK | — |
| `branch_id` | INTEGER | FK → `branches` |
| `supplier_id` | UUID | FK → `suppliers` |
| `reference` | TEXT | Número de factura |
| `purchase_date` | DATE | — |
| `is_credit` | BOOLEAN | Si es compra a crédito |
| `notes` | TEXT | — |
| `created_by` | UUID | — |
| `deleted_at` | TIMESTAMPTZ | Soft delete |
| `delete_note` | TEXT | Justificación eliminación |
| `module` | TEXT | `materiales` o `concretera` |

#### `customers` (Clientes con crédito)
| Campo | Tipo | Descripción |
|-------|------|-------------|
| `id` | UUID PK | — |
| `branch_id` | INTEGER | FK → `branches` |
| `name` | TEXT | — |
| `phone` | TEXT | — |
| `address` | TEXT | — |
| `credit_limit` | NUMERIC | Límite de crédito |
| `default_credit_days` | INTEGER | 15 o 30 |
| `policy` | TEXT | `CERO_TOLERANCIA` o `BLOQUEO_PARCIAL` |
| `allow_cash_if_blocked` | BOOLEAN | Permite efectivo aunque esté bloqueado |
| `late_tolerance_days` | INTEGER | Días de gracia |
| `is_active` | BOOLEAN | — |

#### `credit_notes` (Notas de Crédito)
| Campo | Tipo | Descripción |
|-------|------|-------------|
| `id` | UUID PK | — |
| `customer_id` | UUID | FK → `customers` |
| `folio` | TEXT | Número de folio |
| `issue_date` | DATE | Fecha de emisión |
| `due_date` | DATE | Fecha de vencimiento |
| `total` | NUMERIC | Monto total |
| `paid_amount` | NUMERIC | Monto pagado |
| `balance` | NUMERIC | Saldo pendiente |
| `status` | TEXT | `ABIERTA`, `PAGADA`, `VENCIDA` |
| `deleted_at` | TIMESTAMPTZ | Soft delete |

#### `credit_payments` (Abonos)
| Campo | Tipo | Descripción |
|-------|------|-------------|
| `id` | UUID PK | — |
| `note_id` | UUID | FK → `credit_notes` |
| `paid_at` | TIMESTAMPTZ | Fecha del pago |
| `amount` | NUMERIC | Monto abonado |
| `method` | TEXT | `EFECTIVO`, `TRANSFERENCIA`, `TARJETA`, `CHEQUE`, `YAPE`, `PLIN`, `OTRO` |
| `reference` | TEXT | Referencia del pago |

#### `customer_wallets` (Billeteras / Prepago)
| Campo | Tipo | Descripción |
|-------|------|-------------|
| `id` | UUID PK | — |
| `customer_id` | UUID | FK → `customers` |
| `status` | TEXT | `ACTIVA`, `INACTIVA`, `BLOQUEADA` |
| `current_balance` | NUMERIC | Saldo disponible |
| `opened_amount` | NUMERIC | Monto de apertura |
| `opened_at` | TIMESTAMPTZ | — |

#### `customer_wallet_movements`
| Campo | Tipo | Descripción |
|-------|------|-------------|
| `id` | UUID PK | — |
| `wallet_id` | UUID | FK → `customer_wallets` |
| `type` | TEXT | `APERTURA`, `RECARGA`, `USO_VENTA`, `AJUSTE`, `REVERSO` |
| `amount` | NUMERIC | — |
| `sale_id` | UUID | FK → `sales` (si aplica) |

#### `diesel_tanks` (Tanques de Diésel)
| Campo | Tipo | Descripción |
|-------|------|-------------|
| `id` | UUID PK | — |
| `branch_id` | INTEGER | FK → `branches` |
| `name` | TEXT | Nombre del tanque |
| `current_qty` | NUMERIC | Litros actuales |
| `max_capacity` | NUMERIC | Capacidad máxima |

#### `diesel_logs` (Movimientos de Diésel)
| Campo | Tipo | Descripción |
|-------|------|-------------|
| `id` | UUID PK | — |
| `type` | TEXT | `CARGA` (salida a vehículo) o `RECEPCION` (ingreso al tanque) |
| `tank_id` | UUID | FK → `diesel_tanks` |
| `amount` | NUMERIC | Litros |
| `cost_per_liter` | NUMERIC | — |
| `total_cost` | NUMERIC | — |
| `supplier` | TEXT | Proveedor (para RECEPCION) |
| `invoice_number` | TEXT | — |
| `vehicle_id` | UUID | FK → `vehicles` (para CARGA) |
| `driver_id` | UUID | FK → `drivers` |
| `odometer_reading` | NUMERIC | — |
| `status` | TEXT | Estado del registro |
| `delete_observation` | TEXT | Justificación si fue eliminado |
| `created_by` | UUID | — |

#### `vehicles` y `drivers`
Tablas de activos de logística con campos: `id`, `plate`/`license`, `description`/`name`, `active`.

### RPC Functions (PostgreSQL)

| Función | Propósito |
|---------|-----------|
| `app_login_user(p_identifier, p_password)` | Autenticación. Hash: `md5(user_id::text || ':' || password)` |
| `app_validate_session(p_token)` | Valida token y retorna payload de usuario |
| `app_logout_user(p_token)` | Elimina la sesión |
| `app_set_user_password(p_user_id, p_password)` | Cambia contraseña (genera hash) |
| `app_build_employee_payload` | Construye payload completo con permisos del usuario |

### Edge Functions (Supabase)

| Función | Ruta | Descripción |
|---------|------|-------------|
| `audit-log` | `POST /functions/v1/audit-log` | Almacena evento de auditoría en MongoDB |
| `payment-evidence-upload` | `POST /functions/v1/payment-evidence-upload` | Sube archivo de evidencia a Cloudinary |

### Relaciones clave

```
app_user_profiles ──┬── app_user_branch_access ──── branches
                    ├── app_user_business_unit_access
                    ├── app_user_sessions
                    └── app_user_permissions

app_roles ──────────── app_role_permissions ──── app_permissions

branches ──┬── product_stocks ──── products ──── product_uoms ──── uoms
           ├── sales ──── sale_items
           ├── purchases
           ├── customers ──── credit_notes ──── credit_payments
           │              └── customer_wallets ──── customer_wallet_movements
           └── diesel_tanks ──── diesel_logs
```

---

## 5. Módulos del Sistema

### 5.1 Autenticación (`/`)

| Aspecto | Detalle |
|---------|---------|
| Archivo | `components/Auth/LoginScreen.tsx` |
| Función | Login en 2 pasos con verificación CAPTCHA |
| Tablas | `app_user_profiles`, `app_user_sessions` |
| Acciones | Iniciar sesión, bloqueo por intentos |
| Validaciones | Campos obligatorios, CAPTCHA, anti-brute force |
| Flujo | Paso 1: identificador → Paso 2: contraseña + verificación |

### 5.2 Ventas Materiales (`/materiales/ventas`)

| Aspecto | Detalle |
|---------|---------|
| Archivo | `components/POS/POSScreen.tsx` |
| Función | Punto de venta para materiales de construcción |
| Tablas | `sales`, `sale_items`, `product_stocks`, `customers`, `credit_notes`, `customer_wallets` |
| Acciones | Crear venta, ver historial, exportar PDF, anular venta |
| Validaciones | Crédito del cliente, stock disponible, CAPTCHA en cancelaciones |
| Roles | `superadmin`, `admin`, `materials_user`, `socio` |

**Métodos de pago disponibles:**

| Método | Descripción |
|--------|-------------|
| `EFECTIVO` | Pago en efectivo con cálculo de cambio |
| `TARJETA` | Tarjeta de crédito / débito |
| `CREDITO` | Genera nota de crédito automáticamente |
| `BILLETERA` | Usa saldo prepago del cliente |
| `HIBRIDA` | Combinación de dos métodos |
| `SIN_COSTO` | Salida sin cargo (requiere justificación) |

**Flujo completo de venta:**
1. Seleccionar cliente (o público general / mostrador)
2. Validar crédito disponible si aplica
3. Buscar y agregar productos (búsqueda por nombre, SKU o código de barras)
4. Definir cantidad y unidad de medida (con conversión automática)
5. Aplicar precios especiales si necesario (requiere justificación)
6. Seleccionar método de pago
7. Agregar dirección de entrega (opcional)
8. Registrar observaciones (opcional)
9. Confirmar venta → actualización automática de stock
10. Registrar auditoría
11. Generar PDF de recibo con watermark

### 5.3 Compras / Entradas Materiales (`/materiales/compras`)

| Aspecto | Detalle |
|---------|---------|
| Archivo | `components/Inventory/PurchasesScreen.tsx` |
| Función | Registro de entradas de inventario desde proveedores |
| Tablas | `purchases`, `purchase_items`, `product_stocks`, `suppliers` |
| Acciones | Crear compra, ver historial, eliminar (con justificación) |
| Roles | `superadmin`, `admin`, `materials_user`, `socio` |

### 5.4 Productos / Inventario Materiales (`/materiales/productos`)

| Aspecto | Detalle |
|---------|---------|
| Archivo | `components/Inventory/InventoryScreen.tsx` |
| Función | Catálogo de productos con control de stock |
| Tablas | `products`, `product_stocks`, `product_uoms`, `uoms`, `categories` |
| Acciones | CRUD productos, ajuste manual de stock, ver historial de movimientos |
| Validaciones | Razón obligatoria para ajustes manuales |
| Roles | Ver: todos los roles con acceso. Editar: `superadmin`, `admin`, `socio` |

**Razones de ajuste de stock:**

| Razón | Descripción |
|-------|-------------|
| `CONTEO_CORRECTO` | Corrección por conteo físico |
| `MERMA` | Pérdida por deterioro |
| `DERECHO_CORTE` | Sobrante de corte |
| `DAÑO` | Daño en almacén |
| `ERROR_VENTA` | Corrección por error en venta |
| `ROBO` | Pérdida por robo |
| `OTRO` | Otro motivo (requiere observación) |

### 5.5 Clientes / Crédito Materiales (`/materiales/clientes`)

| Aspecto | Detalle |
|---------|---------|
| Archivo | `components/Customers/CustomerScreen.tsx` |
| Función | Gestión completa de clientes con línea de crédito |
| Tablas | `customers`, `credit_notes`, `credit_payments`, `customer_wallets`, `customer_addresses` |
| Acciones | CRUD clientes, crear nota crédito, registrar abono, gestionar billetera, subir evidencia, exportar estado de cuenta PDF |
| Roles | Ver: todos con permiso `customers.view`. Crear/editar: `superadmin`, `admin`, `socio`, `materials_user` |

**Políticas de crédito:**

| Política | Comportamiento |
|----------|---------------|
| `CERO_TOLERANCIA` | Bloqueo total de crédito al vencer |
| `BLOQUEO_PARCIAL` | Puede vender en efectivo aunque esté vencido en crédito |

### 5.6 Alertas de Crédito (`/materiales/alertas`)

| Aspecto | Detalle |
|---------|---------|
| Archivo | `components/CreditAlerts/CreditAlertsScreen.tsx` |
| Función | Dashboard de clientes con crédito vencido o próximo a vencer |
| Tablas | `credit_notes`, `customers` |
| Acciones | Ver clientes en mora, filtrar por estado |
| Roles | `superadmin`, `admin`, `materials_user`, `socio` |

### 5.7 Reportes Materiales (`/materiales/reportes`)

| Aspecto | Detalle |
|---------|---------|
| Archivo | `components/Reports/ReportsScreen.tsx` |
| Función | Análisis visual de ventas e inventario |
| Acciones | Filtrar por fecha/categoría, exportar PDF |
| Roles | `superadmin`, `admin`, `socio` |

**Análisis disponibles:**
- Ventas por categoría (barras)
- Tendencia de ventas en el tiempo (área)
- Estado de stock vs mínimos/máximos
- Rotación de productos
- Productos sin movimiento

### 5.8 Auditorías (`/materiales/auditorias`)

| Aspecto | Detalle |
|---------|---------|
| Archivo | `components/Audit/AuditScreen.tsx` |
| Función | Registro inmutable de todas las operaciones del sistema |
| Almacenamiento | MongoDB via Supabase Edge Function |
| Acciones | Búsqueda, filtros por acción/entidad/fecha, paginación |
| Roles | `superadmin`, `admin`, `socio` |

**Tipos de eventos auditados:**
`CREAR`, `ACTUALIZAR`, `ELIMINAR`, `VENTA`, `COMPRA`

**Entidades auditadas:**
`producto`, `cliente`, `venta`, `compra`, `nota_credito`, `abono_credito`

### 5.9 Sucursales (`/sucursales`)

| Aspecto | Detalle |
|---------|---------|
| Archivo | `components/Branches/BranchesScreen.tsx` |
| Función | Gestión de puntos de venta |
| Tablas | `branches` |
| Acciones | Crear, editar, activar/desactivar, cambiar sucursal activa |
| Roles | Ver y cambiar de sucursal: todos. Crear/editar: `superadmin`, `admin` |

> **Importante:** La función `isFullAccessRole()` determina si el usuario puede moverse entre sucursales libremente. Los usuarios con rol restringido solo pueden acceder a su sucursal asignada.

### 5.10 Personal / Usuarios (`/usuarios`)

| Aspecto | Detalle |
|---------|---------|
| Archivo | `components/Users/UsersScreen.tsx` |
| Función | Administración del personal del sistema |
| Tablas | `app_user_profiles`, `app_user_branch_access`, `app_user_business_unit_access`, `app_user_sessions`, `app_user_permissions` |
| Acciones | Crear usuario, editar datos, cambiar contraseña, activar/desactivar, eliminar (con cascada) |
| Roles | `superadmin`, `admin` |

**Campos del formulario de usuario:**
- Nombre completo, correo electrónico, username
- Rol asignado (4 opciones: superadmin, materials_user, concrete_user, socio)
- Estado activo/inactivo
- Sucursales permitidas (checkboxes)
- Áreas de negocio (checkboxes)
- Sesión fija: 600 minutos (no editable)

**Eliminación en cascada:**
`sessions → permissions → branch_access → business_unit_access → profile`

### 5.11 Módulos Concretera

Los módulos de Concretera son espejos funcionalmente equivalentes a los de Materiales, con particularidades propias:

| Módulo | URL | Archivo | Particularidad |
|--------|-----|---------|----------------|
| Ventas | `/concretera/ventas` | `ConcretePOSScreen.tsx` | Metadata: edad/resistencia/descarga |
| Compras | `/concretera/compras` | `ConcretePurchasesScreen.tsx` | — |
| Productos | `/concretera/productos` | `ConcreteInventoryScreen.tsx` | Materiales para fórmulas |
| Clientes | `/concretera/clientes` | `ConcreteCustomersScreen.tsx` | — |
| Alertas | `/concretera/alertas` | — | — |
| Reportes | `/concretera/reportes` | `ConcreteReportsScreen.tsx` | — |
| Auditorías | `/concretera/auditorias` | — | — |

**Particularidades de órdenes de concreto:**

```typescript
// Metadata específica de venta de concreto
type ConcreteSaleMeta = {
  edad: '28' | '14' | '7' | '3' | null      // Días de fraguado
  rev: '12' | '14' | '16' | '18' | null     // Resistencia kg/cm²
  descarga: 'Directo' | 'Bomba' | null       // Tipo de descarga
}
```

**Componentes adicionales de Concretera:**
- `ConcreteFleet.tsx` — Camiones mezcladores (estado: DISPONIBLE, CARGANDO, EN_RUTA, REGRESANDO, MANTENIMIENTO)
- `ConcreteFormulas.tsx` — Fórmulas de mezcla con materiales y cantidades por m³
- `ConcreteOps.tsx` — Gestión de órdenes de producción y despacho

### 5.12 Logística / Diésel (`/logistica/diesel`)

| Aspecto | Detalle |
|---------|---------|
| Archivo | `components/Diesel/DieselScreen.tsx` |
| Función | Control de combustible para flota de vehículos |
| Tablas | `diesel_tanks`, `diesel_logs`, `vehicles`, `drivers` |
| Acciones | Registrar carga/recepción, gestionar tanques, CRUD vehículos y conductores, exportar reportes, eliminar con justificación |
| Roles | `superadmin`, `admin`, `socio` |

**Vistas del módulo:**
1. **Status** — Estado actual de tanques, nivel de llenado
2. **Logs** — Historial de movimientos (carga a vehículo / recepción en tanque)
3. **Assets** — CRUD de vehículos y conductores

---

## 6. Vistas y Componentes

### Componentes reutilizables (`components/common/`)

| Componente | Propósito |
|-----------|-----------|
| `ConfirmModal.tsx` | Modal de confirmación para acciones irreversibles. Soporte para campo de observación obligatorio |
| `FeedbackModal.tsx` | Modal de estado: `loading`, `success`, `error`, `warning` |
| `StatusModal.tsx` | Variante liviana del modal de estado |
| `CustomerSearchSelect.tsx` | Búsqueda autocomplete de clientes con debounce (mín 3 caracteres). Incluye opción "Público General" |

### Componentes de Billetera (`components/Wallet/`)

| Componente | Propósito |
|-----------|-----------|
| `WalletCreateModal.tsx` | Crear nueva billetera de prepago para cliente |
| `WalletRechargeModal.tsx` | Recargar saldo de billetera |
| `WalletHistoryModal.tsx` | Ver historial de movimientos de la billetera |

### Componentes de Diésel (`components/Diesel/`)

| Componente | Propósito |
|-----------|-----------|
| `DieselTankCard.tsx` | Tarjeta visual de un tanque (nivel, capacidad, acciones) |
| `DeleteLogModal.tsx` | Modal para eliminar registro con observación obligatoria |
| `EditCapacityModal.tsx` | Modal para cambiar capacidad máxima del tanque |

### Navegación (Layout)

El sidebar (`components/Layout.tsx`) implementa:
- **Grupos colapsables** por unidad de negocio (Materiales, Concretera, Logística)
- **Items con sub-ítems** (Auditorías tiene hijos: Auditoría interna, Producción)
- **Filtrado automático** de items según `userCanAccessTab()`
- **Auto-expansión** del grupo del tab activo al navegar
- **Selector de sucursal** en el encabezado (con validación de permisos)
- **Avatar de usuario** con nombre, rol y botón de logout
- **Colapso total** del sidebar con toggle

---

## 7. Funcionalidades Principales

### Sistema de crédito a clientes

Flujo completo:
1. Cliente tiene un `credit_limit` (ej: $50,000 MXN)
2. Cada venta a crédito genera una `credit_note` con fecha de vencimiento
3. El `balance` de las notas suma a la deuda actual
4. Si deuda > credit_limit → bloqueo según política (`CERO_TOLERANCIA` o `BLOQUEO_PARCIAL`)
5. Abonos reducen el `paid_amount` y actualizan `balance` y `status`
6. Pagos se documentan con método, referencia y evidencia (imagen/PDF)
7. Estado de cuenta exportable en PDF

### Sistema de billetera (prepago)

1. El cliente deposita dinero por adelantado (APERTURA)
2. Las cargas posteriores generan movimientos RECARGA
3. Al vender se descuenta automáticamente (USO_VENTA)
4. El saldo está siempre disponible en tiempo real

### Conversión de unidades

El motor en `services/conversionEngine.ts` resuelve conversiones en 3 pasos:
1. Busca conversión directa entre las unidades especificadas para ese producto
2. Busca la conversión inversa
3. Aplica equivalencias globales estándar (kg↔ton, etc.)

Esto permite vender un producto en "bultos" aunque esté cargado en "kg".

### Auditoría de cambios

Todas las acciones sensibles generan un `AuditLogInput`:
```typescript
{
  branch_id, user_id, action_type, module,
  entity_type, entity_id, description,
  justification?,
  previous_data?,  // Estado antes del cambio
  new_data?        // Estado después del cambio
}
```
Enviado via `POST /functions/v1/audit-log` → Edge Function → MongoDB.

### Generación de PDFs

Se usa `pdf-lib` para generar:
- **Recibos de venta** con detalle de productos, cliente y totales
- **Estados de cuenta** de clientes con historial de notas y pagos
- **Reportes** de ventas e inventario con gráficos
- Todos incluyen **watermark** y **datos de sucursal** en el pie de página

### Sincronización en tiempo real

Supabase Realtime mantiene el estado sincronizado entre pestañas/dispositivos para:
- `sales` — Nuevas ventas
- `product_stocks` — Cambios de inventario
- `customers` — Cambios en clientes
- `diesel_tanks`, `diesel_logs`, `vehicles`, `drivers`, `branches`

---

## 8. APIs y Endpoints

### RPC Functions (Supabase)

Todas se invocan via `supabase.rpc(functionName, params)`.

| Función | Params | Retorna |
|---------|--------|---------|
| `app_login_user` | `p_identifier`, `p_password` | `AuthPayloadRow` |
| `app_validate_session` | `p_token` | `AuthPayloadRow` |
| `app_logout_user` | `p_token` | `void` |
| `app_set_user_password` | `p_user_id`, `p_password` | `void` |

### Edge Functions

#### `POST /functions/v1/audit-log`

**Headers:** `Authorization: Bearer {supabaseAnonKey}`

**Body:**
```json
{
  "branch_id": "string",
  "user_id": "string",
  "action_type": "CREAR | ACTUALIZAR | ELIMINAR | VENTA | COMPRA",
  "module": "materiales | concretera",
  "entity_type": "producto | cliente | venta | compra | nota_credito | abono_credito",
  "entity_id": "string",
  "description": "string",
  "justification": "string?",
  "previous_data": "object?",
  "new_data": "object?"
}
```

**Retorna:** `{ success: boolean }`

#### `POST /functions/v1/payment-evidence-upload`

**Body:** `FormData` con archivo + `payment_id`

**Retorna:** `{ url: string, public_id: string }`  
Almacena en Cloudinary.

### Servicios Supabase (REST/PostgREST)

Los servicios en `/services/` usan el cliente Supabase directamente con `.from('tabla').select/insert/update/delete`.

Ejemplos clave:

```typescript
// Obtener todos los productos con stock por sucursal
supabase
  .from('products')
  .select('*, product_stocks(*), product_uoms(*)')
  .is('deleted_at', null)

// Crear una venta
supabase
  .from('sales')
  .insert({ branch_id, customer_id, payment_method, total, created_by, module })
  .select()
  .single()

// Ajuste de stock
supabase.rpc('adjust_product_stock', {
  p_product_id, p_branch_id, p_new_qty, p_reason, p_notes, p_user_id
})
```

### API de Lectura de Auditorías

**URL:** Configurada via `VITE_AUDIT_API_URL`

**Endpoint:** `GET {AUDIT_API_URL}/logs`

**Query params:** `module`, `branch_id`, `action_type`, `entity_type`, `search`, `date_from`, `date_to`, `page`, `page_size`

**Retorna:**
```json
{
  "data": [AuditLogRow],
  "total": number,
  "page": number,
  "page_size": number
}
```

---

## 9. Configuración del Proyecto

### Variables de entorno necesarias

| Variable | Requerida | Descripción |
|----------|-----------|-------------|
| `VITE_SUPABASE_URL` | ✅ Sí | URL del proyecto Supabase |
| `VITE_SUPABASE_ANON_KEY` | ✅ Sí | Llave anónima de Supabase |
| `VITE_AUDIT_API_URL` | ⬜ Opcional | URL de la API de lectura de auditorías |

Sin las variables de Supabase el sistema funciona en **modo degradado offline** (sin persistencia).

### Archivo `.env.local` (no subir a git)

```env
VITE_SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
VITE_AUDIT_API_URL=https://api.tudominio.com
```

### Dependencias importantes

| Paquete | Versión | Propósito |
|---------|---------|-----------|
| `react` / `react-dom` | 19.x | UI framework |
| `@supabase/supabase-js` | 2.90.x | Cliente Supabase |
| `react-router-dom` | 7.x | Routing SPA |
| `recharts` | 2.x | Gráficos en reportes |
| `pdf-lib` | 1.x | Generación de PDFs |
| `lucide-react` | 0.56x | Iconos SVG |
| `react-simple-captcha` | 9.x | CAPTCHA en login (instalado pero sustituido por widget custom) |
| `@types/react` | — | Tipos TypeScript para React |
| `@types/react-dom` | — | Tipos TypeScript para React DOM |

### Scripts disponibles

```bash
npm run dev      # Servidor de desarrollo en http://localhost:3000
npm run build    # Build de producción en /dist
npm run preview  # Preview del build de producción
```

### Cómo levantar el proyecto localmente

```bash
# 1. Clonar el repositorio
git clone <url-del-repo>
cd developeraxoramexico

# 2. Instalar dependencias
npm install

# 3. Configurar variables de entorno
cp .env.example .env.local
# Editar .env.local con tus credenciales de Supabase

# 4. Iniciar servidor de desarrollo
npm run dev

# 5. Abrir en navegador
# http://localhost:3000
```

### Base de datos: pasos de configuración

```bash
# 1. Crear proyecto en Supabase (supabase.com)

# 2. Ejecutar en el SQL Editor de Supabase:
#    - definitive_employee_auth.sql    (crea tablas de auth + RPC functions)
#    - seed_permissions.sql            (siembra roles y permisos)

# 3. Desplegar Edge Functions:
supabase functions deploy audit-log
supabase functions deploy payment-evidence-upload

# 4. Crear el primer usuario superadmin desde el SQL Editor:
INSERT INTO app_user_profiles (id, email, username, full_name, role_key, active, session_minutes)
VALUES (gen_random_uuid(), 'admin@lopar.com', 'admin', 'Administrador Principal', 'superadmin', true, 600);
```

### Consideraciones para despliegue en producción

1. **SPA Fallback:** El servidor debe servir `index.html` para todas las rutas (BrowserRouter). En Vercel/Netlify esto se configura automáticamente; en Nginx requiere:
   ```nginx
   location / {
     try_files $uri /index.html;
   }
   ```
2. **Variables de entorno:** Configurar en el panel de la plataforma de hosting (no en archivos).
3. **CORS en Supabase:** Agregar el dominio de producción a los dominios permitidos en Supabase.
4. **Edge Functions:** Deben desplegarse con `supabase functions deploy` antes del primer uso.

---

## 10. Resumen Técnico Final

### Cómo se conecta todo el sistema

```
Usuario ──► LoginScreen ──► authService.signIn()
                                    │
                         ┌──────────▼──────────┐
                         │  app_login_user RPC  │
                         │  (PostgreSQL/Supabase)│
                         └──────────┬──────────┘
                                    │ AuthPayloadRow
                         ┌──────────▼──────────┐
                         │      App.tsx         │
                         │  Estado global:       │
                         │  - currentUser        │
                         │  - products           │
                         │  - customers          │
                         │  - branches           │
                         │  - dieselData         │
                         └──────────┬──────────┘
                                    │
                    ┌───────────────▼───────────────┐
                    │          Layout.tsx            │
                    │  Sidebar con permisos          │
                    │  filtrados por rol/permisos    │
                    └───────────────┬───────────────┘
                                    │ activeTab / ruta
                    ┌───────────────▼───────────────┐
                    │     Screen correspondiente     │
                    │  (POSScreen, CustomerScreen,  │
                    │   DieselScreen, etc.)          │
                    └───────────────┬───────────────┘
                                    │
              ┌─────────────────────┼─────────────────────┐
              │                     │                     │
     ┌────────▼────────┐  ┌────────▼────────┐  ┌────────▼────────┐
     │  Supabase DB    │  │  Edge Functions │  │  Audit API      │
     │  (PostgreSQL)   │  │  (audit-log,    │  │  (MongoDB       │
     │  Realtime subs  │  │   evidence-up)  │  │   vía API)      │
     └─────────────────┘  └─────────────────┘  └─────────────────┘
```

### Partes críticas del sistema

| Archivo/Servicio | Criticidad | Razón |
|-----------------|-----------|-------|
| `App.tsx` | 🔴 Crítico | Estado global, sesión, carga de datos, routing |
| `services/auth/auth.service.ts` | 🔴 Crítico | Toda la autenticación depende de aquí |
| `services/auth/permissions.ts` | 🔴 Crítico | Control de acceso a todos los módulos |
| `services/supabaseClient.ts` | 🔴 Crítico | Punto único de conexión con Supabase |
| `types.ts` | 🟡 Alto | Todos los archivos dependen de sus tipos |
| `definitive_employee_auth.sql` | 🔴 Crítico | RPC functions sin las cuales el login no funciona |
| `seed_permissions.sql` | 🟡 Alto | Sin este seed los permisos por rol no existen |
| `services/auth/routes.ts` | 🟡 Alto | Mapeo tab↔URL; romper esto rompe toda la navegación |
| `components/Layout.tsx` | 🟡 Alto | Navegación global del sistema |

### Qué NO modificar sin cuidado

1. **`types.ts`** — Cambiar el enum `Role` o la interfaz `User` afecta todos los archivos del sistema.
2. **`services/auth/permissions.ts`** — El mapeo `TAB_PERMISSIONS` y las funciones `isFullAccessRole/userCanAccessTab` controlan quién ve qué.
3. **`services/auth/routes.ts`** — El mapa `TAB_PATHS` debe estar en sincronía con el routing de `App.tsx` y el sidebar de `Layout.tsx`.
4. **`supabase/functions/audit-log/`** — Modificar sin actualizar también el `auditService` del frontend genera inconsistencias.
5. **RPC functions en Supabase** — Son la única manera de autenticar. Modificarlas requiere actualizar `auth.service.ts` simultáneamente.
6. **`product_stocks`** — La tabla se actualiza automáticamente por triggers en Supabase al registrar ventas y compras. No actualizar manualmente sin entender los triggers.

### Posibles mejoras detectadas

| Área | Mejora Sugerida |
|------|----------------|
| TypeScript | Varios archivos (ConcretePOSScreen, POSScreen, ReportsScreen) tienen errores de TS pre-existentes que deben resolverse |
| Seguridad | Implementar Row Level Security (RLS) en Supabase para que las restricciones por sucursal se apliquen también en backend |
| Offline | El "modo degradado" actual no persiste datos localmente; considerar IndexedDB para operaciones offline reales |
| Testing | No existe suite de pruebas automatizadas (unit ni e2e) |
| Gestión de errores | Algunos servicios no manejan errores de red de forma uniforme |
| Código duplicado | Los servicios de Materiales y Concretera son casi idénticos; considerar una abstracción genérica parametrizable |
| Auditoría MongoDB | La API de lectura (`VITE_AUDIT_API_URL`) es externa y no documentada en el código fuente del proyecto |
| Sesión | El token en localStorage es menos seguro que una cookie HttpOnly; considerar migrar |
| Cloudinary | Las credenciales de Cloudinary deben estar en variables de entorno de la Edge Function, no hardcodeadas |

### Riesgos técnicos / Deuda técnica

| Riesgo | Nivel | Descripción |
|--------|-------|-------------|
| Sin RLS en Supabase | 🔴 Alto | Un usuario con acceso directo a la API (PostgREST) puede ver datos de otras sucursales |
| Errores TS sin resolver | 🟡 Medio | ConcretePOSScreen, POSScreen, ReportsScreen y catalog.service tienen errores de tipos |
| Sin pruebas automáticas | 🟡 Medio | Regresiones pueden pasar inadvertidas |
| Dependencia de MongoDB externo | 🟡 Medio | Si el servicio de auditoría cae, los logs se pierden sin retry |
| `VITE_*` vars en frontend | 🟡 Medio | Las claves de Supabase son visibles en el bundle. Esto es normal para la anon key, pero requiere RLS para ser seguro |
| Código duplicado Materiales/Concretera | 🟢 Bajo | Aumenta mantenimiento pero no genera riesgos inmediatos |
| `constants.tsx` con datos de ejemplo | 🟢 Bajo | Datos de prueba presentes en producción (no crítico si Supabase está configurado) |

---

*Documento generado el 2026-05-06. Refleja el estado del código en la rama `main`.*
