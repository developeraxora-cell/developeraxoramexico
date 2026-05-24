# Vinos · Campañas

**Estado:** ✅ Hecho · **Ruta:** `/vinos/campanas`
**Archivos:** `components/Vinos/VinosCampaignsScreen.tsx` (765 líneas), `services/vinos/campaigns.service.ts`

## Resumen
Campañas de marketing segmentadas con plantillas de mensaje (WhatsApp) y asistente por pasos.

## Funcionalidades
- Segmentos: En riesgo (EN_RIESGO/PERDIDO), Poco frecuentes (sin comprar en N días), Cumpleaños del mes, Por nivel (Bronce/Plata/Oro/Black), Por estado, Por tipo, Todos.
- Plantillas de mensaje con variables: `{{nombre_cliente}}`, `{{descuento}}`, `{{promocion}}`, `{{fecha_inicio_promocion}}`, `{{fecha_fin_promocion}}` (`renderMessage`).
- Plantillas por segmento: general/promoción, reactivación, "te extrañamos", cumpleaños, cliente preferente.
- Asistente por pasos, selección múltiple de destinatarios, vista previa y estados de envío.

## Pendientes / Notas
- ⚠️ Confirmar si el **envío real** a WhatsApp es automático (API) o genera mensajes/links manuales.
- ⚠️ Disparo automático por cron / alertas de abandono y recomendaciones inteligentes: verificar contra `propuesta-modulo-vino.txt`.
