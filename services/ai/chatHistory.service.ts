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
}

const DRAFT_PREFIX = 'lopar_ai_draft_';

// ---------------------------------------------------------------------------
// Borrador en localStorage
// ---------------------------------------------------------------------------

const draftKey = (userId: string) => `${DRAFT_PREFIX}${userId || 'anon'}`;

export function saveDraft(userId: string, messages: ChatMessage[]): void {
  try {
    if (!messages.length) {
      localStorage.removeItem(draftKey(userId));
      return;
    }
    localStorage.setItem(draftKey(userId), JSON.stringify(messages));
  } catch {
    /* almacenamiento lleno o bloqueado: se ignora */
  }
}

export function loadDraft(userId: string): ChatMessage[] {
  try {
    const raw = localStorage.getItem(draftKey(userId));
    return raw ? (JSON.parse(raw) as ChatMessage[]) : [];
  } catch {
    return [];
  }
}

export function clearDraft(userId: string): void {
  try {
    localStorage.removeItem(draftKey(userId));
  } catch {
    /* noop */
  }
}

// ---------------------------------------------------------------------------
// Persistencia en Supabase
// ---------------------------------------------------------------------------

function buildTitle(messages: ChatMessage[]): string {
  const firstUser = messages.find((m) => m.role === 'user');
  const text = (firstUser?.text ?? 'Conversación').trim().replace(/\s+/g, ' ');
  return text.length > 60 ? `${text.slice(0, 57)}…` : text;
}

/**
 * Guarda (inserta o actualiza) una conversación. Devuelve el id resultante,
 * o null si no hay nada que guardar / Supabase no está configurado.
 */
export async function saveConversation(input: SaveConversationInput): Promise<string | null> {
  const meaningful = input.messages.filter((m) => m.text.trim().length);
  if (!isSupabaseConfigured || meaningful.length === 0) return input.id ?? null;

  const payload = JSON.stringify(input.messages);
  const row = {
    user_id: input.userId,
    business_unit: input.businessUnit ?? null,
    branch_id: input.branchId ?? null,
    title: buildTitle(input.messages),
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
): Promise<ConversationMeta[]> {
  if (!isSupabaseConfigured) return [];
  let query = supabase
    .from('ai_chat_histories')
    .select('id, title, message_count, updated_at')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })
    .limit(50);
  if (businessUnit) query = query.eq('business_unit', businessUnit);

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).map((r: any) => ({
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
    return JSON.parse(data?.payload ?? '[]') as ChatMessage[];
  } catch {
    return [];
  }
}

export async function deleteConversation(id: string): Promise<void> {
  if (!isSupabaseConfigured) return;
  const { error } = await supabase.from('ai_chat_histories').delete().eq('id', id);
  if (error) throw error;
}
