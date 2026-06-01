import { isSupabaseConfigured } from '../supabaseClient';
import { OllamaMessage, QueryDebug } from './ollama.service';
import { ToolContext } from './aiTools.service';

export const isOpenAIProviderEnabled =
  (import.meta.env.VITE_AI_PROVIDER as string | undefined)?.toLowerCase() === 'openai';

const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim().replace(/\/+$/, '') || '';
const SUPABASE_ANON_KEY = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim() || '';

interface RunOpenAIOptions {
  onToken: (chunk: string, full: string) => void;
  onStatus?: (label: string) => void;
  onQuery?: (info: QueryDebug) => void;
  ctx: ToolContext;
  signal?: AbortSignal;
}

export async function runOpenAIAgent(
  { onToken, onStatus, ctx, signal }: RunOpenAIOptions,
  history: OllamaMessage[],
): Promise<string> {
  if (!isSupabaseConfigured) {
    throw new Error('Supabase no está configurado.');
  }
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error('Faltan VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY.');
  }

  onStatus?.('Consultando OpenAI…');
  const response = await fetch(`${SUPABASE_URL}/functions/v1/ai-chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({
      messages: history
        .filter((msg) => msg.role === 'user' || msg.role === 'assistant')
        .map((msg) => ({ role: msg.role, content: msg.content })),
      context: {
        branchName: ctx.branchName,
        branchId: ctx.branchId ?? ctx.branchCode ?? null,
        businessUnit: ctx.businessUnit || 'materiales',
        lastSql: ctx.lastSql,
      },
    }),
    signal,
  });

  if (signal?.aborted) {
    throw new DOMException('Operación cancelada', 'AbortError');
  }

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error((data as any)?.error || `No se pudo consultar OpenAI (${response.status}).`);
  }

  const text = String((data as any)?.text ?? '').trim();
  if (text) onToken(text, text);
  return text;
}
