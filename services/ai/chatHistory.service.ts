// Persistencia del historial del Asistente IA.
// - Borrador en vivo: localStorage (mientras el usuario escribe).
// - Definitivo: Supabase, guardando los mensajes como STRING (JSON) en `payload`.

import { supabase, isSupabaseConfigured } from '../supabaseClient';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  attachment?: {
    filename: string;
    mimeType: string;
    content: string;
    label: string;
  };
}

export interface ConversationMeta {
  id: string;
  title: string;
  messageCount: number;
  updatedAt: string;
}

export interface SaveConversationInput {
  id?: string | null;
  userId: string;
  businessUnit?: string | null;
  branchId?: string | null;
  messages: ChatMessage[];
  agentId?: string | null;
  agentName?: string | null;
}

const DRAFT_PREFIX = 'lopar_ai_draft_';

// ---------------------------------------------------------------------------
// Borrador en localStorage
// ---------------------------------------------------------------------------

const draftKey = (userId: string, scope = 'default') => `${DRAFT_PREFIX}${userId || 'anon'}_${scope}`;

export function saveDraft(userId: string, messages: ChatMessage[], scope = 'default'): void {
  try {
    if (!messages.length) {
      localStorage.removeItem(draftKey(userId, scope));
      return;
    }
    localStorage.setItem(draftKey(userId, scope), JSON.stringify(messages));
  } catch {
    /* almacenamiento lleno o bloqueado: se ignora */
  }
}

export function loadDraft(userId: string, scope = 'default'): ChatMessage[] {
  try {
    const raw = localStorage.getItem(draftKey(userId, scope));
    return raw ? (JSON.parse(raw) as ChatMessage[]) : [];
  } catch {
    return [];
  }
}

export function clearDraft(userId: string, scope = 'default'): void {
  try {
    localStorage.removeItem(draftKey(userId, scope));
  } catch {
    /* noop */
  }
}

// ---------------------------------------------------------------------------
// Persistencia en Supabase
// ---------------------------------------------------------------------------

function buildTitle(messages: ChatMessage[]): string {
  const firstUser = messages.find((m) => m.role === 'user');
  const firstAssistant = messages.find((m) => m.role === 'assistant');
  const text = (firstUser?.text ?? firstAssistant?.text ?? 'Conversación').trim().replace(/\s+/g, ' ');
  return text.length > 60 ? `${text.slice(0, 57)}…` : text;
}

/**
 * Guarda (inserta o actualiza) una conversación. Devuelve el id resultante,
 * o null si no hay nada que guardar / Supabase no está configurado.
 */
export async function saveConversation(input: SaveConversationInput): Promise<string | null> {
  const meaningful = input.messages.filter((m) => m.text.trim().length);
  if (!isSupabaseConfigured || meaningful.length === 0) return input.id ?? null;

  const payload = JSON.stringify({
    agentId: input.agentId ?? null,
    agentName: input.agentName ?? null,
    messages: input.messages,
  });
  const row = {
    user_id: input.userId,
    business_unit: input.businessUnit ?? null,
    branch_id: input.branchId ?? null,
    title: input.agentName ? `${input.agentName}: ${buildTitle(input.messages)}` : buildTitle(input.messages),
    payload,
    message_count: input.messages.length,
  };

  if (input.id) {
    const { error } = await supabase.from('ai_chat_histories').update(row).eq('id', input.id);
    if (error) throw error;
    return input.id;
  }

  const { data, error } = await supabase
    .from('ai_chat_histories')
    .insert(row)
    .select('id')
    .single();
  if (error) throw error;
  return data?.id ?? null;
}

/** Lista las conversaciones del usuario (más recientes primero). */
export async function listConversations(
  userId: string,
  businessUnit?: string | null,
  agentId?: string | null,
): Promise<ConversationMeta[]> {
  if (!isSupabaseConfigured) return [];
  let query = supabase
    .from('ai_chat_histories')
    .select('id, title, message_count, updated_at, payload')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })
    .limit(100);
  if (businessUnit) query = query.eq('business_unit', businessUnit);

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? [])
    .filter((r: any) => {
      if (!agentId) return true;
      try {
        const payload = JSON.parse(r.payload ?? 'null');
        return payload?.agentId === agentId;
      } catch {
        return false;
      }
    })
    .slice(0, 50)
    .map((r: any) => ({
      id: r.id,
      title: r.title ?? 'Conversación',
      messageCount: r.message_count ?? 0,
      updatedAt: r.updated_at,
    }));
}

/** Carga los mensajes de una conversación (parsea el STRING JSON). */
export async function getConversation(id: string): Promise<ChatMessage[]> {
  if (!isSupabaseConfigured) return [];
  const { data, error } = await supabase
    .from('ai_chat_histories')
    .select('payload')
    .eq('id', id)
    .single();
  if (error) throw error;
  try {
    const parsed = JSON.parse(data?.payload ?? '[]');
    return Array.isArray(parsed) ? parsed as ChatMessage[] : (parsed?.messages ?? []) as ChatMessage[];
  } catch {
    return [];
  }
}

export async function deleteConversation(id: string): Promise<void> {
  if (!isSupabaseConfigured) return;
  const { error } = await supabase.from('ai_chat_histories').delete().eq('id', id);
  if (error) throw error;
}
