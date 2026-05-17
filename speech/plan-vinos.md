# Plan Módulo Vinos — Casa Tahona

> **Plazo total:** 5 días
> **Día actual:** 3 de 5
> **Última actualización:** 2026-05-17

---

## Resumen ejecutivo

Sistema CRM + POS independiente para sucursal de vinos.
DB separada (`supabaseVinos`), usuarios en DB principal, cliente dual en frontend.

---

## ✅ Completado (Días 1–2.5)

### Infraestructura
- Schema completo de DB vinos (`vinos_schema.sql`)
- RLS desactivado para acceso anon (mismo patrón main DB)
- Migración: `customer_types[]`, `credit_limit`, `wallet_enabled/balance`, tabla `customer_documents` con campos Cloudinary
- Cliente Supabase dual (`supabaseVinos`)
- Script de diagnóstico `test-vinos.js`

### Auth + permisos
- Rol `VINOS_ADMIN` agregado al enum
- BU `vinos` agregada al type
- `normalizeRole` y `normalizeBusinessUnit` reconocen vinos
- `userCanAccess` hardcodea: VINOS_ADMIN solo ve BU vinos
- Usuario `carlos` (vinos_admin / password: carlos) creado en main DB
- Sucursal `CASA TAHONA` (VIN-01) creada en ambas DBs

### Frontend — Sidebar VINOS
- 🛒 Caja / Venta — maquetación
- 📥 Compras / Entradas — maquetación
- 📦 Productos — maquetación
- 👥 **Clientes — FUNCIONAL completo**
- 📊 Reportes / CRM — maquetación
- 📋 Auditorías — maquetación

### Clientes (única pantalla funcional)
- CRUD completo contra DB vinos
- Multi-tipo (checkboxes): vino, whisky, cerveza, tequila, premium, fiestas
- Crédito condicional (toggle + monto)
- Saldo a favor condicional (toggle + monto inicial)
- Documentos: upload real a Cloudinary vía Edge Function `payment-evidence-upload`
- Lazy upload (solo al hacer Save, igual que materiales)
- Máximo 2 documentos por cliente
- Soft delete
- Stats: total, activos, en riesgo, ORO/BLACK
- Búsqueda por nombre, teléfono, email
- Tabla con: tipos, nivel lealtad, estado, crédito, saldo, total gastado

### Edge Function
- `supabase/functions/payment-evidence-upload/index.ts` actualizada
- ModuleName ahora incluye `'vinos'`
- Parámetro `category` para folders (`documentos` vs `abonos`)
- Deploy: `supabase functions deploy payment-evidence-upload`

---

## ⏳ Pendiente (Días 3–5)

### 🔴 DÍA 3 (HOY) — Productos

**Objetivo:** módulo de productos 100% funcional para que el POS tenga catálogo.

**Pantalla `VinosProductsScreen.tsx`** (ya maquetada, falta lógica):

- [ ] Service `services/vinos/products.service.ts` — CRUD contra `supabaseVinos`
- [ ] Service `services/vinos/catalog.service.ts` — categorías, marcas, proveedores
- [ ] Cargar lista real (reemplazar mock array)
- [ ] Modal crear / editar producto con campos:
  - SKU (auto o manual)
  - Nombre
  - Categoría (select del catálogo)
  - Marca
  - Origen (país)
  - Costo
  - Precio menudeo
  - Precio medio mayoreo
  - Precio mayoreo
  - Stock inicial
  - Stock mínimo / máximo
  - Imagen (upload Cloudinary, opcional)
- [ ] Filtros por categoría (chips ya están)
- [ ] Búsqueda funcional
- [ ] Soft delete + reactivar
- [ ] Stats reales (total, activos, stock bajo, valor inventario)
- [ ] Pantallas de gestión de categorías/marcas/proveedores (modal o sub-screen)

**Tablas DB ya listas:** `products`, `product_stocks`, `categories`, `brands`, `suppliers`

---

### 🟠 DÍA 4 — POS Ventas + Compras

#### 4.1 POS Ventas

**Pantalla `VinosPOSScreen.tsx`** (ya maquetada, falta lógica):

- [ ] Service `services/vinos/sales.service.ts`
- [ ] Cargar catálogo desde productos
- [ ] Selector de cliente (modal con búsqueda o "público general")
- [ ] Agregar productos al carrito con click
- [ ] Cambiar tipo de precio (menudeo / medio mayoreo / mayoreo) actualiza precios del carrito
- [ ] Quantity selector (+/-)
- [ ] Eliminar item del carrito
- [ ] Descuentos manuales (por línea o total)
- [ ] Cálculo subtotal / IVA / total
- [ ] Método de pago (efectivo / tarjeta / transferencia)
- [ ] Aplicar saldo a favor si cliente tiene wallet
- [ ] Cobrar a crédito si cliente tiene credit_limit
- [ ] Crear venta + sale_items
- [ ] Trigger automático: descuenta stock (`fn_stock_on_sale`)
- [ ] Llamar RPC `recalculate_customer_metrics(customer_id)` post-venta
- [ ] Llamar RPC `update_loyalty_level(customer_id)` post-venta
- [ ] Registrar en `customer_product_history` para recomendaciones
- [ ] Imprimir / mostrar nota de venta (modal con datos)

#### 4.2 Compras

**Pantalla `VinosPurchasesScreen.tsx`** (ya maquetada, falta lógica):

- [ ] Service `services/vinos/purchases.service.ts`
- [ ] Cargar lista de compras
- [ ] Modal nueva entrada:
  - Proveedor (select)
  - Fecha
  - Folio / factura
  - Items (producto + cantidad + costo unitario)
  - Subtotal / IVA / total
- [ ] Crear purchase + purchase_items
- [ ] Trigger automático: suma stock (`fn_stock_on_purchase`)
- [ ] Filtros fecha + proveedor funcionales
- [ ] Búsqueda por folio / proveedor / producto

---

### 🟡 DÍA 5 — Auditoría + Reportes + Polish

#### 5.1 Auditoría

- [ ] Service `services/vinos/audit.service.ts`
- [ ] Cargar `audit_log` con filtros
- [ ] Filtros funcionales: entidad, acción, fecha, usuario
- [ ] Modal detalle con `before` / `after` JSON
- [ ] Búsqueda funcional
- [ ] Exportar a Excel/CSV

#### 5.2 Reportes / CRM Dashboard

- [ ] Service `services/vinos/reports.service.ts`
- [ ] KPIs reales (ventas, ticket promedio, clientes nuevos, retención)
- [ ] Gráfica ventas por día (Chart.js / Recharts)
- [ ] Distribución niveles lealtad (data real)
- [ ] Clientes en riesgo (status DORMIDO / EN_RIESGO con días sin comprar)
- [ ] Cumpleaños del mes
- [ ] Top 10 clientes por LTV
- [ ] Top 10 productos más vendidos
- [ ] Ventas por categoría (pie chart)
- [ ] Recomendaciones por afinidad (`product_affinity` table)

#### 5.3 Polish

- [ ] Botón "Aplicar saldo a favor" en perfil cliente
- [ ] Botón "Movimientos de wallet" (historial)
- [ ] Auto-actualización status cliente (DORMIDO si >60 días, EN_RIESGO si >90, PERDIDO si >180)
- [ ] Botón "Sincronizar métricas" para recalcular todo
- [ ] Errores y validaciones
- [ ] Loading states pulidos
- [ ] Deploy a producción (Vercel)

---

## 🔮 Fuera de scope (Fase 2)

- Edge Function de campañas automáticas (cron nocturno)
- WhatsApp real (Twilio / Meta Business API)
- Gamification UI (badges, challenges)
- App móvil
- PDF de nota de venta con diseño custom
- Programa de referidos

---

## 📋 Próximo paso inmediato

**Hoy mismo:** arrancar con **Productos completo** (Día 3).

Orden de trabajo:
1. Service `products.service.ts`
2. Service `catalog.service.ts` (categorías, marcas)
3. Cargar productos reales en `VinosProductsScreen`
4. Modal crear / editar con 3 niveles de precio
5. Búsqueda + filtros funcionales
6. Soft delete

Cuando Productos esté funcional → arranca Día 4 con POS.

---

## 🛠 Referencias técnicas

| Archivo / Tabla | Para qué |
|---|---|
| `vinos_schema.sql` | Schema base completo |
| `services/vinosClient.ts` | Cliente Supabase dual |
| `services/vinos/customers.service.ts` | Modelo de referencia para nuevos services |
| `services/vinos/documentUpload.service.ts` | Upload a Cloudinary |
| `components/Vinos/VinosCustomersScreen.tsx` | Patrón UI para listas + modal CRUD |
| RPC `recalculate_customer_metrics` | Llamar post-venta |
| RPC `update_loyalty_level` | Llamar post-venta |
| RPC `update_product_affinity` | Llamar post-venta |
| RPC `adjust_product_stock` | Ajustes manuales de stock |

---
