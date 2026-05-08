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

### RPCs activas

- `app_set_user_password(uuid, text)`
- `app_login_user(text, text)`
- `app_validate_session(uuid)`
- `app_logout_user(uuid)`
- `app_build_employee_payload(uuid)`

### Impacto en frontend

- [services/auth/auth.service.ts](/home/carlos-calderon/Escritorio/FreeLancer/developeraxoramexico/services/auth/auth.service.ts)
- [App.tsx](/home/carlos-calderon/Escritorio/FreeLancer/developeraxoramexico/App.tsx)

El login:
- guarda el token de sesión propio
- valida sesión por RPC
- cierra sesión por RPC
- ya no usa `supabase.auth.signInWithPassword()`

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
