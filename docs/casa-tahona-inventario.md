# Inventario fisico de Casa Tahona

## Alcance

Clon del flujo de Materiales > Inventario, disponible en **Casa Tahona > Inventario**
en `/vinos/inventario`. La pantalla original de Materiales no fue modificada.

- Historial de inventarios de Casa Tahona y busqueda por nombre.
- Alta y edicion de nombre, fechas y estado; cierre, reapertura y eliminacion.
- Un inventario activo para Casa Tahona.
- Busqueda de productos por nombre, SKU y codigo de barras (desde tres caracteres).
- Captura manual de cantidad fisica en unidad base, comparada con el stock del sistema.
- Diferencia calculada, observacion obligatoria si hay faltante o sobrante.
- Captura y eliminacion de productos con guardado conjunto y atomico.
- Resumen de productos, coincidencias, faltantes y sobrantes.
- Reporte PDF con encabezado Casa Tahona y detalle de los conteos.
- Eliminacion con modal y motivo obligatorio, registrado en Casa Tahona > Auditoria.

**Registrar un conteo NO ajusta el stock de ventas.** Conserva el comportamiento
del inventario fisico original. Para ajustar existencias sigue disponible el
ajuste manual de Casa Tahona > Productos. Crear productos tambien permanece en
Productos: esta nueva pantalla selecciona productos existentes del catalogo local.

Se retiro el indicador de fiabilidad de anillos asociado a Produccion, tanto de
la pantalla como del PDF. No hay llamadas a Produccion, recetas, ordenes de
fabricacion ni tablas de Materiales.

## Archivos entregados

| Archivo | Responsabilidad |
| --- | --- |
| `components/Vinos/VinosPhysicalInventoryScreen.tsx` | Interfaz clonada, historial, formularios, captura y validaciones |
| `services/vinos/physicalInventory.service.ts` | Inventarios y captura atomica, exclusivamente en Supabase VINOS |
| `services/vinos/physicalInventoryCatalog.service.ts` | Unidades, stock y busqueda del catalogo local VINOS |
| `services/vinos/physicalInventoryPdf.ts` | Generador del reporte sin indicadores de Produccion |
| `vinos_inventario_fisico.sql` | Tablas, restricciones, indices y funcion de guardado |
| `vinos_inventario_fisico_permisos.sql` | Habilita operacion abierta de las dos tablas de inventario para anon/authenticated |
| `App.tsx`, `components/Layout.tsx` | Pantalla, pestana y opcion del menu |
| `services/auth/routes.ts`, `services/auth/permissions.ts` | Ruta y permiso existente de productos VINOS |

## Integraciones necesarias

| Integracion | Uso | Escritura |
| --- | --- | --- |
| `services/vinosClient.ts` | Conexion independiente a Supabase VINOS | Cliente existente |
| `products` de VINOS | Nombre, SKU, codigo de barras y unidad base | No |
| `product_stocks` de VINOS | Stock de referencia local, sumado por producto | No |
| `uoms` de VINOS | Nombre y simbolo de unidad base | No |
| `vinos_physical_inventories` | Cabeceras y estados | Si |
| `vinos_physical_inventory_items` | Conteos, diferencias y observaciones | Si |
| `save_vinos_physical_inventory_capture` | Validar y guardar altas/bajas juntas | Si, solo conteos |
| Sesion y permisos de la aplicacion | Acceso y nombre del operador | Solo nombre en el conteo |
| `pdf-lib`, `services/currency.ts`, `FeedbackModal` | PDF, formatos y mensajes | No |

No se necesita `branches`, ni se consulta una sucursal de otra base. La base
VINOS es exclusiva de Casa Tahona. La columna `branch_id` de las cabeceras es una
etiqueta interna fija de texto, `casa-tahona`, sin clave foranea. El selector de
sucursal no filtra el catalogo ni los conteos de esta base aislada.
Se suma `product_stocks.qty` por producto sin filtrar por sucursal, igual que
Productos cuando no tiene un ID local. Un producto sin stock registrado tiene
referencia cero y tambien puede contarse.
El nombre del operador es una referencia de la sesion existente, no una FK a
usuarios de Materiales ni una autenticacion independiente de Supabase VINOS.

## Instalacion

1. Respaldar y revisar primero en un ambiente de pruebas de Supabase VINOS.
2. Confirmar el esquema existente: `products.id` y
   `uoms.id` UUID; `products.uom_id`, `is_active`, `deleted_at`; `product_stocks.qty`.
3. Ejecutar `vinos_inventario_fisico.sql` en el SQL Editor del proyecto **VINOS**,
   nunca en el proyecto principal de Materiales. El script es transaccional y
   puede repetirse sobre su propio esquema sin borrar datos.
4. Configurar las variables existentes `VITE_SUPABASE_URL_VINOS` y
   `VITE_SUPABASE_ANON_KEY_VINOS`. No se requieren nuevas credenciales.
5. Para el acceso abierto solicitado, ejecutar `vinos_inventario_fisico_permisos.sql`.
   Habilita SELECT/INSERT/UPDATE/DELETE y politicas RLS permisivas para `anon` y
   `authenticated`, solo en las dos tablas del inventario, ademas de EXECUTE en
   la funcion de captura. No modifica los permisos del catalogo ni otras tablas.
   La funcion sigue siendo `SECURITY INVOKER`: requiere que el cliente ya pueda
   leer `products` y `uoms`, igual que el resto de Casa Tahona.
   Cualquiera con la URL y clave publica VINOS podra leer/modificar/eliminar
   inventarios directamente por API, incluso fuera de la interfaz. La sesion
   propia de la app no restringe este acceso a nivel de base de datos.
   Las politicas restrictivas personalizadas existentes, si las hay, se conservan.
6. El acceso reutiliza `vinos.products.view`, igual que el inventario original.
   ADMIN, SUPERADMIN y VINOS_ADMIN siguen sus reglas existentes. No se crean roles.
7. Ejecutar `npm run build` y desplegar normalmente. Para prueba local:
   `npm run dev -- --host 127.0.0.1 --port 3001`.

## Reglas y prueba funcional

Las cantidades aceptan cero y hasta tres decimales, sin negativos ni valores
vacios. Las fechas finales no pueden preceder a la inicial. La base calcula la
diferencia; los nombres/unidades guardados se obtienen del catalogo VINOS.
El guardado bloquea la cabecera y rechaza inventarios cerrados, productos que no
esten activos en el catalogo VINOS, productos repetidos y eliminaciones de otro inventario. Si una fila
falla, se revierte todo el lote, incluidas las eliminaciones.

1. Crear inventario activo; intentar otro activo para Casa Tahona (rechazo).
2. Buscar un producto local y capturar cantidades iguales, menores y mayores.
3. Guardar una diferencia sin observacion (rechazo); agregarla y guardar.
4. Recargar y comprobar el detalle; verificar que `product_stocks.qty` no cambio.
5. Quitar una fila y guardar; generar PDF y revisar encabezado y totales.
6. Cerrar: la captura queda de solo lectura. Reabrir para continuar.
7. Confirmar que funciona sin tabla `branches` y sin consultar la base de Materiales.
8. Verificar que Materiales > Inventario mantiene su comportamiento original.

El SQL se entrega para instalarlo; no se ejecuta contra las bases remotas desde
este cambio. La independencia es respecto de Materiales/Produccion, no respecto
del catalogo, sesion ni infraestructura existentes de Casa Tahona.

## Verificacion tecnica

- Servicios: `node tests/vinosPhysicalInventory.test.cjs` (seis pruebas con cliente simulado).
- Eliminacion auditada: `node tests/vinosPhysicalInventoryDeletion.test.cjs`.
- SQL: `psql -h HOST_LOCAL -p PUERTO -U USUARIO -d BASE_TEMPORAL_VACIA -f tests/vinosPhysicalInventory.sql`.
  Este archivo crea tablas de catalogo de prueba: nunca ejecutarlo en una base real.
  Comprueba instalacion repetida sin tabla `branches`, restricciones, catalogo local, stock
  intacto, cierre, rollback atomico y eliminacion en cascada.
- Interfaz: flujo probado con datos simulados en Chrome a 1440 y 390 pixeles;
  captura, validacion de observacion, guardado y modo de solo lectura al cerrar.
- PDF: prueba de 80 productos para comprobar paginacion y fechas.
- `npm run build` genera la aplicacion. El chequeo global `tsc --noEmit` tiene
  errores preexistentes en otros modulos; revisar aparte antes de exigir ese
  comando como requisito global de despliegue.

## Auditoria de eliminaciones

La eliminacion pide una observacion obligatoria en un modal. Guarda usuario,
motivo, cabecera y productos contados en la auditoria existente, entidad
`inventario`, accion `ELIMINAR`, modulo `vinos`. El filtro Inventarios del modulo
de Auditoria permite consultar estos eventos y ver el motivo en su detalle.

Actualizar/desplegar `supabase/functions/audit-log/index.ts` en el proyecto que
sirve la API de auditoria existente (por defecto el Supabase principal, no VINOS).
Si se usa `VITE_AUDIT_API_URL`, actualizar ese backend para aceptar `inventario`.
La funcion actualizada admite tambien el alias `inventory`. No requiere otro SQL.

El registro se confirma ANTES de borrar. Si auditoria falla o no esta configurada,
se conserva el inventario y se muestra el error en el modal. El evento dice
"Eliminacion autorizada": si despues falla el borrado, la autorizacion queda
registrada sin afirmar que la eliminacion se completo. Ambos sistemas son
independientes y no hay una transaccion distribuida. Cada reintento puede registrar
otra autorizacion. Los accesos abiertos por API de los scripts de permisos pueden
evadir este flujo de interfaz; no representan auditoria forzada a nivel de base.
