const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

type ChatRole = 'system' | 'user' | 'assistant';

interface ChatMessage {
  role: ChatRole;
  content: string;
}

interface ChatPayload {
  messages?: ChatMessage[];
  context?: {
    branchName?: string;
    branchId?: string | number | null;
    businessUnit?: string;
    userName?: string;
    lastSql?: string;
  };
}

const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY') ?? '';
const OPENAI_MODEL = Deno.env.get('OPENAI_MODEL') ?? 'gpt-5-mini';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

const buildContext = (context: ChatPayload['context']) => {
  const branchName = context?.branchName || 'Sucursal activa';
  const businessUnit = context?.businessUnit || 'materiales';
  const branchId = context?.branchId ?? 'n/d';
  return [
    'Eres el asistente ejecutivo de GRUPO LOPAR.',
    'Responde en español, directo y con criterio operativo.',
    `Sucursal activa: ${branchName} (branch_id: ${branchId}).`,
    `Módulo activo: ${businessUnit}.`,
    'No preguntes sucursal o módulo si ya están en este contexto.',
    'En toda respuesta de negocio menciona la sucursal y el módulo usados.',
    'Mantén continuidad con el historial: si el usuario dice "eso", "dámelo", "la lista" o "completo", se refiere al último tema útil.',
    context?.lastSql ? `Última SQL exitosa de referencia:\n${context.lastSql}` : '',
  ].filter(Boolean).join('\n');
};

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (request.method !== 'POST') {
    return json({ error: 'Método no permitido' }, 405);
  }
  if (!OPENAI_API_KEY) {
    return json({ error: 'OPENAI_API_KEY no configurada en Supabase secrets.' }, 500);
  }

  let payload: ChatPayload;
  try {
    payload = await request.json();
  } catch {
    return json({ error: 'JSON inválido' }, 400);
  }

  const messages = Array.isArray(payload.messages) ? payload.messages : [];
  if (messages.length === 0) {
    return json({ error: 'Sin mensajes para procesar.' }, 400);
  }

  const input = messages
    .filter((msg) => msg.role === 'user' || msg.role === 'assistant')
    .map((msg) => ({ role: msg.role, content: String(msg.content ?? '') }));

  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      instructions: buildContext(payload.context),
      input,
    }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    return json({
      error: data?.error?.message || `OpenAI respondió ${response.status}`,
    }, 502);
  }

  return json({
    text: data?.output_text ?? '',
    model: OPENAI_MODEL,
    raw_id: data?.id ?? null,
  });
});
