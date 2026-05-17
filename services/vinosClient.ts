import { createClient, SupabaseClient } from '@supabase/supabase-js';

const vinosUrl = import.meta.env.VITE_SUPABASE_URL_VINOS;
const vinosAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY_VINOS;

export const isVinosConfigured = Boolean(vinosUrl && vinosAnonKey);

if (!isVinosConfigured) {
  console.warn('⚠️ VITE_SUPABASE_URL_VINOS / VITE_SUPABASE_ANON_KEY_VINOS not set');
}

export const supabaseVinos: SupabaseClient = isVinosConfigured
  ? createClient(vinosUrl, vinosAnonKey, { auth: { persistSession: false } })
  : (null as unknown as SupabaseClient);
