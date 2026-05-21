import { supabaseVinos, isVinosConfigured } from '../vinosClient';

const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL ?? '').trim().replace(/\/+$/, '');
const SUPABASE_ANON_KEY = (import.meta.env.VITE_SUPABASE_ANON_KEY ?? '').trim();
const WHATSAPP_URL = SUPABASE_URL ? `${SUPABASE_URL}/functions/v1/whatsapp-send` : '';

export type SegmentType = 'AT_RISK' | 'INFREQUENT' | 'LOYALTY' | 'CUSTOMER_TYPE' | 'STATUS' | 'BIRTHDAY' | 'ALL' | 'MANUAL';
export type CampaignStatus = 'BORRADOR' | 'ENVIADA' | 'FINALIZADA' | 'CANCELADA';
export type PromotionStatus = 'ACTIVA' | 'USADA' | 'VENCIDA' | 'CANCELADA';

export interface SegmentConfig {
  levels?: string[];
  types?: string[];
  statuses?: string[];
  days?: number;
  customer_ids?: string[];
  recipient_ids?: string[];   // lista final (segmento + agregados manualmente)
}

export interface Campaign {
  id: string;
  name: string;
  segment_type: SegmentType;
  segment_config: SegmentConfig;
  discount_percent: number;
  valid_from: string;
  valid_to: string;
  message_template: string;
  status: CampaignStatus;
  total_recipients: number;
  sent_count: number;
  failed_count: number;
  branch_id: number | null;
  created_by: string | null;
  created_by_name: string | null;
  created_at: string;
  sent_at: string | null;
}

export interface CreateCampaignInput {
  name: string;
  segment_type: SegmentType;
  segment_config: SegmentConfig;
  recipient_ids: string[];   // lista final de clientes
  discount_percent: number;
  valid_from: string;
  valid_to: string;
  message_template: string;
  branch_id: number | null;
  created_by: string;
  created_by_name: string;
}

export interface Recipient {
  id: string;
  name: string;
  phone: string | null;
  loyalty_level: string;
  status: string;
  last_purchase_date: string | null;
}

export interface Promotion {
  id: string;
  code: string;
  campaign_id: string | null;
  customer_id: string | null;
  discount_percent: number;
  valid_from: string;
  valid_to: string;
  status: PromotionStatus;
  used_at: string | null;
  sale_id: string | null;
  created_at: string;
  customer_name?: string;
  campaign_name?: string;
}

// ─── helpers ─────────────────────────────────────────────────

function formatDate(iso: string): string {
  // YYYY-MM-DD → DD/MM/YYYY
  const [y, m, d] = (iso ?? '').slice(0, 10).split('-');
  return d && m && y ? `${d}/${m}/${y}` : iso;
}

export function renderMessage(template: string, vars: {
  nombre_cliente: string; promocion: string; fecha_inicio: string; fecha_fin: string; descuento: number;
}): string {
  return (template ?? '')
    .replace(/\{\{\s*nombre_cliente\s*\}\}/gi, vars.nombre_cliente)
    .replace(/\{\{\s*promocion\s*\}\}/gi, vars.promocion)
    .replace(/\{\{\s*fecha_inicio_promocion\s*\}\}/gi, formatDate(vars.fecha_inicio))
    .replace(/\{\{\s*fecha_fin_promocion\s*\}\}/gi, formatDate(vars.fecha_fin))
    .replace(/\{\{\s*descuento\s*\}\}/gi, `${vars.descuento}%`);
}

const CODE_PREFIX = 'TAHONA';

function randomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let suffix = '';
  for (let i = 0; i < 6; i += 1) suffix += chars[Math.floor(Math.random() * chars.length)];
  return `${CODE_PREFIX}-${suffix}`;
}

// Genera N códigos únicos: sin repetir entre sí ni contra los ya existentes en DB
async function generateUniqueCodes(count: number): Promise<string[]> {
  const result = new Set<string>();
  while (result.size < count) {
    const needed = count - result.size;
    const candidates: string[] = [];
    for (let i = 0; i < needed; i += 1) candidates.push(randomCode());
    const unique = [...new Set(candidates)].filter(c => !result.has(c));
    const { data } = await supabaseVinos.from('promotions').select('code').in('code', unique);
    const taken = new Set((data ?? []).map((r: { code: string }) => r.code));
    unique.forEach(c => { if (!taken.has(c)) result.add(c); });
  }
  return [...result];
}

// ─── service ─────────────────────────────────────────────────

export const vinosCampaignsService = {
  async list(branchId: number | null): Promise<Campaign[]> {
    if (!isVinosConfigured) return [];
    let q = supabaseVinos
      .from('campaigns')
      .select('*')
      .is('deleted_at', null)
      .order('created_at', { ascending: false });
    if (branchId) q = q.eq('branch_id', branchId);
    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []) as Campaign[];
  },

  async resolveRecipients(segmentType: SegmentType, config: SegmentConfig, branchId: number | null): Promise<Recipient[]> {
    if (!isVinosConfigured) return [];
    let q = supabaseVinos
      .from('customers')
      .select('id, name, phone, loyalty_level, status, last_purchase_date, customer_types, birthday')
      .eq('is_active', true);
    if (branchId) q = q.eq('branch_id', branchId);

    switch (segmentType) {
      case 'AT_RISK':
        q = q.in('status', ['EN_RIESGO', 'PERDIDO']);
        break;
      case 'INFREQUENT': {
        const days = config.days ?? 30;
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - days);
        q = q.lt('last_purchase_date', cutoff.toISOString().slice(0, 10));
        break;
      }
      case 'LOYALTY':
        if (config.levels?.length) q = q.in('loyalty_level', config.levels);
        break;
      case 'STATUS':
        if (config.statuses?.length) q = q.in('status', config.statuses);
        break;
      case 'CUSTOMER_TYPE':
        if (config.types?.length) q = q.overlaps('customer_types', config.types);
        break;
      case 'BIRTHDAY':
        q = q.not('birthday', 'is', null);
        break;
      case 'MANUAL':
        if (config.customer_ids?.length) q = q.in('id', config.customer_ids);
        else return [];
        break;
      case 'ALL':
      default:
        break;
    }

    const { data, error } = await q.order('name', { ascending: true });
    if (error) throw error;
    let rows = (data ?? []) as (Recipient & { birthday?: string | null })[];
    // Cumpleaños: filtrar por mes actual (no soportado en query)
    if (segmentType === 'BIRTHDAY') {
      const month = new Date().getMonth() + 1;
      rows = rows.filter(r => r.birthday && Number(String(r.birthday).slice(5, 7)) === month);
    }
    return rows as Recipient[];
  },

  async create(input: CreateCampaignInput): Promise<Campaign> {
    if (!isVinosConfigured) throw new Error('DB vinos no configurada');
    const { data, error } = await supabaseVinos
      .from('campaigns')
      .insert({
        name: input.name,
        segment_type: input.segment_type,
        segment_config: { ...input.segment_config, recipient_ids: input.recipient_ids },
        discount_percent: input.discount_percent,
        valid_from: input.valid_from,
        valid_to: input.valid_to,
        message_template: input.message_template,
        branch_id: input.branch_id,
        created_by: input.created_by,
        created_by_name: input.created_by_name,
        total_recipients: input.recipient_ids.length,
        status: 'BORRADOR',
      })
      .select()
      .single();
    if (error) throw error;
    return data as Campaign;
  },

  // Clientes finales de una campaña (lista persistida; fallback a resolver el segmento)
  async listRecipients(campaign: Campaign): Promise<Recipient[]> {
    if (!isVinosConfigured) return [];
    const ids = campaign.segment_config?.recipient_ids ?? [];
    if (ids.length === 0) return this.resolveRecipients(campaign.segment_type, campaign.segment_config, campaign.branch_id);
    const { data, error } = await supabaseVinos
      .from('customers')
      .select('id, name, phone, loyalty_level, status, last_purchase_date')
      .in('id', ids);
    if (error) throw error;
    return (data ?? []) as Recipient[];
  },

  async update(id: string, patch: Partial<CreateCampaignInput>): Promise<void> {
    if (!isVinosConfigured) throw new Error('DB vinos no configurada');
    const { error } = await supabaseVinos.from('campaigns').update(patch).eq('id', id);
    if (error) throw error;
  },

  async softDelete(id: string, note: string): Promise<void> {
    if (!isVinosConfigured) throw new Error('DB vinos no configurada');
    const { data: camp } = await supabaseVinos.from('campaigns').select('status').eq('id', id).single();
    if (camp?.status !== 'BORRADOR') throw new Error('No se puede eliminar una campaña ya enviada.');
    const { error } = await supabaseVinos
      .from('campaigns')
      .update({ deleted_at: new Date().toISOString(), delete_note: note })
      .eq('id', id);
    if (error) throw error;
  },

  // Genera una promoción por destinatario, renderiza el mensaje y lo envía por WhatsApp.
  async sendCampaign(campaignId: string): Promise<{ total: number; sent: number; failed: number }> {
    if (!isVinosConfigured) throw new Error('DB vinos no configurada');

    const { data: campaign, error: cErr } = await supabaseVinos
      .from('campaigns').select('*').eq('id', campaignId).single();
    if (cErr || !campaign) throw new Error('Campaña no encontrada');
    const camp = campaign as Campaign;
    if (camp.status !== 'BORRADOR') throw new Error('La campaña ya fue enviada.');

    const recipients = await this.listRecipients(camp);
    if (recipients.length === 0) throw new Error('La campaña no tiene clientes.');

    // 1. Generar promociones (una por cliente, código único garantizado)
    const codes = await generateUniqueCodes(recipients.length);
    const promoRows = recipients.map((r, i) => ({
      code: codes[i],
      campaign_id: camp.id,
      customer_id: r.id,
      discount_percent: camp.discount_percent,
      valid_from: camp.valid_from,
      valid_to: camp.valid_to,
      status: 'ACTIVA' as PromotionStatus,
    }));
    const { data: insertedPromos, error: pErr } = await supabaseVinos
      .from('promotions').insert(promoRows).select('id, code, customer_id');
    if (pErr) throw pErr;
    const promoByCustomer = new Map<string, { id: string; code: string }>();
    (insertedPromos ?? []).forEach((p: { id: string; code: string; customer_id: string }) =>
      promoByCustomer.set(p.customer_id, { id: p.id, code: p.code }));

    // 2. Crear registros de envío (PENDING) + mensaje renderizado
    const sendRows = recipients.map(r => {
      const promo = promoByCustomer.get(r.id);
      const message = renderMessage(camp.message_template, {
        nombre_cliente: r.name,
        promocion: promo?.code ?? '',
        fecha_inicio: camp.valid_from,
        fecha_fin: camp.valid_to,
        descuento: camp.discount_percent,
      });
      return {
        campaign_id: camp.id,
        promotion_id: promo?.id ?? null,
        customer_id: r.id,
        channel: 'WHATSAPP',
        message_sent: message,
        whatsapp_number: r.phone,
        status: 'PENDING' as const,
      };
    });
    const { data: insertedSends, error: sErr } = await supabaseVinos
      .from('campaign_sends').insert(sendRows).select('id, customer_id, message_sent, whatsapp_number');
    if (sErr) throw sErr;

    // 3. Enviar por WhatsApp (UltraMsg vía Edge Function)
    const messages = (insertedSends ?? [])
      .filter((s: { whatsapp_number: string | null }) => s.whatsapp_number)
      .map((s: { id: string; whatsapp_number: string; message_sent: string }) => ({
        id: s.id, to: s.whatsapp_number, body: s.message_sent,
      }));

    let results: Array<{ id: string; ok: boolean; provider_message_id?: string; error?: string }> = [];
    if (messages.length > 0 && WHATSAPP_URL) {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      // El anon key es formato nuevo (sb_publishable_...), no es JWT: solo va en apikey.
      // Mandarlo como Authorization Bearer hace que el gateway lo rechace como "Invalid JWT".
      if (SUPABASE_ANON_KEY) headers.apikey = SUPABASE_ANON_KEY;
      const res = await fetch(WHATSAPP_URL, { method: 'POST', headers, body: JSON.stringify({ messages }) });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(String(json?.error || 'Error al enviar WhatsApp.'));
      results = Array.isArray(json.results) ? json.results : [];
    }

    // 4. Actualizar estado de cada envío
    const nowIso = new Date().toISOString();
    for (const r of results) {
      await supabaseVinos.from('campaign_sends').update({
        status: r.ok ? 'SENT' : 'FAILED',
        sent_at: r.ok ? nowIso : null,
        provider_message_id: r.provider_message_id ?? null,
        error_message: r.ok ? null : (r.error ?? 'Error desconocido'),
      }).eq('id', r.id);
    }
    // Envíos sin teléfono → FAILED
    const noPhoneIds = (insertedSends ?? [])
      .filter((s: { whatsapp_number: string | null }) => !s.whatsapp_number)
      .map((s: { id: string }) => s.id);
    if (noPhoneIds.length > 0) {
      await supabaseVinos.from('campaign_sends').update({
        status: 'FAILED', error_message: 'Cliente sin teléfono',
      }).in('id', noPhoneIds);
    }

    const sent = results.filter(r => r.ok).length;
    const failed = recipients.length - sent;

    // 5. Cerrar campaña
    await supabaseVinos.from('campaigns').update({
      status: 'ENVIADA', sent_at: nowIso, sent_count: sent, failed_count: failed,
    }).eq('id', camp.id);

    return { total: recipients.length, sent, failed };
  },

  async listSends(campaignId: string): Promise<Array<{
    id: string; customer_id: string; message_sent: string; whatsapp_number: string | null;
    status: string; error_message: string | null; sent_at: string | null; customer_name?: string;
  }>> {
    if (!isVinosConfigured) return [];
    const { data, error } = await supabaseVinos
      .from('campaign_sends')
      .select('id, customer_id, message_sent, whatsapp_number, status, error_message, sent_at, customer:customers(name)')
      .eq('campaign_id', campaignId)
      .order('created_at', { ascending: true });
    if (error) throw error;
    return (data ?? []).map((s: { customer?: { name?: string } | { name?: string }[] | null } & Record<string, unknown>) => {
      const cust = Array.isArray(s.customer) ? s.customer[0] : s.customer;
      return { ...(s as object), customer_name: cust?.name } as never;
    });
  },

  async listPromotions(filters: { campaignId?: string; status?: PromotionStatus; branchId?: number | null } = {}): Promise<Promotion[]> {
    if (!isVinosConfigured) return [];
    let q = supabaseVinos
      .from('promotions')
      .select('*, customer:customers!promotions_customer_id_fkey(name), campaign:campaigns(name)')
      .order('created_at', { ascending: false });
    if (filters.campaignId) q = q.eq('campaign_id', filters.campaignId);
    if (filters.status) q = q.eq('status', filters.status);
    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []).map((p: { customer?: { name?: string } | { name?: string }[] | null; campaign?: { name?: string } | { name?: string }[] | null } & Record<string, unknown>) => {
      const cust = Array.isArray(p.customer) ? p.customer[0] : p.customer;
      const camp = Array.isArray(p.campaign) ? p.campaign[0] : p.campaign;
      return { ...(p as object), customer_name: cust?.name, campaign_name: camp?.name } as never;
    });
  },
};
