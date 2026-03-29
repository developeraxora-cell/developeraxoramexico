export interface AuditLogRow {
  _id?: string;
  log_id: string;
  branch_id: string;
  branch_name?: string | null;
  user_id: string;
  user_name?: string | null;
  action_type: 'CREAR' | 'ACTUALIZAR' | 'ELIMINAR' | 'VENTA' | 'COMPRA' | 'CREATE' | 'UPDATE' | 'DELETE' | 'SALE' | 'PURCHASE';
  module: 'materiales' | 'concretera' | 'materials';
  entity_type: 'producto' | 'cliente' | 'venta' | 'compra' | 'nota_credito' | 'abono_credito' | 'product' | 'client' | 'sale' | 'purchase';
  entity_id: string;
  description: string;
  justification?: string | null;
  observation?: string | null;
  previous_data?: Record<string, unknown> | null;
  new_data?: Record<string, unknown> | null;
  timestamp: string;
  ip_address?: string | null;
  user_agent?: string | null;
}

export interface AuditLogsPage {
  rows: AuditLogRow[];
  total: number;
  page: number;
  page_size: number;
}

const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL ?? '').trim().replace(/\/+$/, '');
const SUPABASE_ANON_KEY = (import.meta.env.VITE_SUPABASE_ANON_KEY ?? '').trim();
const DEFAULT_AUDIT_API_URL = SUPABASE_URL ? `${SUPABASE_URL}/functions/v1/audit-log` : '';
const AUDIT_API_URL = (import.meta.env.VITE_AUDIT_API_URL ?? DEFAULT_AUDIT_API_URL).trim();

const buildHeaders = () => {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (SUPABASE_ANON_KEY) {
    headers.apikey = SUPABASE_ANON_KEY;
    headers.Authorization = `Bearer ${SUPABASE_ANON_KEY}`;
  }

  return headers;
};

export const auditReadService = {
  isConfigured() {
    return Boolean(AUDIT_API_URL);
  },

  async list(params: {
    module: 'materiales' | 'concretera' | 'materials';
    branch_id?: string | null;
    action_type?: string;
    entity_type?: string;
    search?: string;
    page?: number;
    page_size?: number;
    date_from?: string;
    date_to?: string;
    signal?: AbortSignal;
  }) {
    if (!AUDIT_API_URL) {
      throw new Error('Audit API no configurada.');
    }

    const url = new URL(AUDIT_API_URL);
    url.searchParams.set('module', params.module);
    if (params.branch_id) url.searchParams.set('branch_id', params.branch_id);
    if (params.action_type) url.searchParams.set('action_type', params.action_type);
    if (params.entity_type) url.searchParams.set('entity_type', params.entity_type);
    if (params.search?.trim()) url.searchParams.set('search', params.search.trim());
    if (params.date_from) url.searchParams.set('date_from', params.date_from);
    if (params.date_to) url.searchParams.set('date_to', params.date_to);
    url.searchParams.set('page', String(params.page ?? 1));
    url.searchParams.set('page_size', String(params.page_size ?? 15));

    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: buildHeaders(),
      signal: params.signal,
    });

    const payload = await response.json().catch(() => ({}));

    if (!response.ok || !payload?.ok) {
      throw new Error(payload?.error || 'No se pudo consultar la auditoría.');
    }

    return {
      rows: (payload.rows ?? []) as AuditLogRow[],
      total: Number(payload.total ?? 0),
      page: Number(payload.page ?? 1),
      page_size: Number(payload.page_size ?? 15),
    } as AuditLogsPage;
  },
};
