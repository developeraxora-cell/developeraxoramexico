// WhatsApp masivo vía UltraMsg (https://ultramsg.com)
// Recibe lista de mensajes y los envía uno por uno con la instancia configurada.
// Secrets requeridos (supabase secrets set):
//   ULTRAMSG_INSTANCE_ID   ej. instance12345
//   ULTRAMSG_TOKEN         token de la instancia

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const INSTANCE_ID = Deno.env.get('ULTRAMSG_INSTANCE_ID') ?? '';
const TOKEN = Deno.env.get('ULTRAMSG_TOKEN') ?? '';

interface OutgoingMessage {
  id: string;        // id del campaign_send asociado (para mapear el resultado)
  to: string;        // teléfono; se normaliza a solo dígitos
  body: string;      // mensaje ya renderizado
}

interface SendResult {
  id: string;
  ok: boolean;
  provider_message_id?: string;
  error?: string;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function normalizePhone(raw: string): string {
  return (raw ?? '').replace(/\D/g, '');
}

async function sendOne(msg: OutgoingMessage): Promise<SendResult> {
  const phone = normalizePhone(msg.to);
  if (!phone) return { id: msg.id, ok: false, error: 'Teléfono vacío o inválido' };

  const url = `https://api.ultramsg.com/${INSTANCE_ID}/messages/chat`;
  const form = new URLSearchParams();
  form.set('token', TOKEN);
  form.set('to', phone);
  form.set('body', msg.body);

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form.toString(),
    });
    const data = await res.json().catch(() => ({}));
    // UltraMsg responde { sent: "true", message: "ok", id: <n> } o { error: "..." }
    const sent = data?.sent === true || data?.sent === 'true';
    if (sent) {
      return { id: msg.id, ok: true, provider_message_id: String(data?.id ?? '') };
    }
    return { id: msg.id, ok: false, error: data?.error ?? data?.message ?? `HTTP ${res.status}` };
  } catch (e) {
    return { id: msg.id, ok: false, error: e instanceof Error ? e.message : 'Error de red' };
  }
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (request.method !== 'POST') {
    return json({ error: 'Método no permitido' }, 405);
  }
  if (!INSTANCE_ID || !TOKEN) {
    return json({ error: 'UltraMsg no configurado (faltan ULTRAMSG_INSTANCE_ID / ULTRAMSG_TOKEN)' }, 500);
  }

  let payload: { messages?: OutgoingMessage[] };
  try {
    payload = await request.json();
  } catch {
    return json({ error: 'JSON inválido' }, 400);
  }

  const messages = Array.isArray(payload.messages) ? payload.messages : [];
  if (messages.length === 0) return json({ error: 'Sin mensajes para enviar' }, 400);

  const results: SendResult[] = [];
  for (const msg of messages) {
    results.push(await sendOne(msg));
    // pequeño respiro para no saturar la instancia
    await new Promise(r => setTimeout(r, 250));
  }

  const sent = results.filter(r => r.ok).length;
  return json({ total: results.length, sent, failed: results.length - sent, results });
});
