export type AuditActionType = 'CREAR' | 'ACTUALIZAR' | 'ELIMINAR' | 'VENTA' | 'COMPRA';
export type AuditModule = 'materiales' | 'concretera' | 'transporteria' | 'vinos';
export type AuditEntityType = 'producto' | 'cliente' | 'proveedor' | 'venta' | 'compra' | 'nota_credito' | 'abono_credito' | 'campania' | 'produccion';

export interface AuditLogInput {
  log_id?: string;
  branch_id: string;
  branch_name?: string | null;
  user_id: string;
  user_name?: string | null;
  action_type: AuditActionType;
  module: AuditModule;
  entity_type: AuditEntityType;
  entity_id: string;
  description: string;
  justification?: string | null;
  previous_data?: Record<string, unknown> | null;
  new_data?: Record<string, unknown> | null;
  timestamp?: string;
  ip_address?: string | null;
  user_agent?: string | null;
}

export interface AuditLogDocument extends AuditLogInput {
  log_id: string;
  timestamp: string;
  user_agent: string | null;
}

const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL ?? '').trim().replace(/\/+$/, '');
const SUPABASE_ANON_KEY = (import.meta.env.VITE_SUPABASE_ANON_KEY ?? '').trim();
const DEFAULT_AUDIT_API_URL = SUPABASE_URL ? `${SUPABASE_URL}/functions/v1/audit-log` : '';
const AUDIT_API_URL = (import.meta.env.VITE_AUDIT_API_URL ?? DEFAULT_AUDIT_API_URL).trim();

const createLogId = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `audit-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
};

const buildAuditDocument = (input: AuditLogInput): AuditLogDocument => ({
  ...input,
  log_id: input.log_id ?? createLogId(),
  timestamp: input.timestamp ?? new Date().toISOString(),
  justification: input.justification?.trim() || null,
  previous_data: input.previous_data ?? null,
  new_data: input.new_data ?? null,
  ip_address: input.ip_address ?? null,
  user_agent: input.user_agent ?? (typeof navigator !== 'undefined' ? navigator.userAgent : null),
});

const postAuditDocument = async (document: AuditLogDocument) => {
  if (!AUDIT_API_URL) return false;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (SUPABASE_ANON_KEY) {
    headers.apikey = SUPABASE_ANON_KEY;
    headers.Authorization = `Bearer ${SUPABASE_ANON_KEY}`;
  }

  const response = await fetch(AUDIT_API_URL, {
    method: 'POST',
    headers,
    body: JSON.stringify(document),
    keepalive: true,
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    console.warn('Audit API rejected event:', payload ?? response.statusText, document);
    return false;
  }

  return true;
};

export const requiresAuditJustification = (actionType: AuditActionType) => {
  return actionType === 'ELIMINAR' || actionType === 'ACTUALIZAR';
};

export const requestAuditJustification = (message: string) => {
  if (typeof window === 'undefined') return null;
  const value = window.prompt(message);
  const normalized = value?.trim() ?? '';
  return normalized || null;
};

export const auditService = {
  isConfigured() {
    return Boolean(AUDIT_API_URL);
  },

  build(input: AuditLogInput) {
    return buildAuditDocument(input);
  },

  async write(input: AuditLogInput) {
    try {
      const document = buildAuditDocument(input);
      return await postAuditDocument(document);
    } catch (error) {
      console.warn('Audit logging failed:', error);
      return false;
    }
  },

  enqueue(input: AuditLogInput) {
    const run = () => {
      void auditService.write(input);
    };

    if (typeof queueMicrotask === 'function') {
      queueMicrotask(run);
      return;
    }

    window.setTimeout(run, 0);
  },
};

export const logMaterialsAudit = (
  input: Omit<AuditLogInput, 'module'>
) => {
  auditService.enqueue({
    ...input,
    module: 'materiales',
  });
};

export const logConcreteraAudit = (
  input: Omit<AuditLogInput, 'module'>
) => {
  auditService.enqueue({
    ...input,
    module: 'concretera',
  });
};

export const logTransportAudit = (
  input: Omit<AuditLogInput, 'module'>
) => {
  auditService.enqueue({
    ...input,
    module: 'transporteria',
  });
};

export const logVinosAudit = (
  input: Omit<AuditLogInput, 'module'>
) => {
  auditService.enqueue({
    ...input,
    module: 'vinos',
  });
};

export interface AuditQueryParams {
  module?: AuditModule;
  branch_id?: string;
  action_type?: AuditActionType;
  entity_type?: AuditEntityType;
  user_id?: string;
  search?: string;
  date_from?: string;
  date_to?: string;
  page?: number;
  page_size?: number;
}

export interface AuditQueryRow {
  log_id: string;
  branch_id: string;
  branch_name: string | null;
  user_id: string;
  user_name: string | null;
  action_type: AuditActionType;
  module: AuditModule;
  entity_type: AuditEntityType;
  entity_id: string;
  description: string;
  justification: string | null;
  observation: string | null;
  previous_data?: Record<string, unknown> | null;
  new_data?: Record<string, unknown> | null;
  timestamp: string;
}

export const fetchAuditLogs = async (params: AuditQueryParams): Promise<{ rows: AuditQueryRow[]; total: number; page: number; page_size: number }> => {
  if (!AUDIT_API_URL) return { rows: [], total: 0, page: 1, page_size: 0 };
  const qs = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') qs.set(k, String(v));
  });
  const headers: Record<string, string> = {};
  if (SUPABASE_ANON_KEY) {
    headers.apikey = SUPABASE_ANON_KEY;
    headers.Authorization = `Bearer ${SUPABASE_ANON_KEY}`;
  }
  const res = await fetch(`${AUDIT_API_URL}?${qs.toString()}`, { headers });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.ok) {
    return { rows: [], total: 0, page: 1, page_size: 0 };
  }
  return { rows: json.rows ?? [], total: Number(json.total ?? 0), page: Number(json.page ?? 1), page_size: Number(json.page_size ?? 0) };
};

export const logAuditForModule = (
  module: AuditModule,
  input: Omit<AuditLogInput, 'module'>
) => {
  auditService.enqueue({ ...input, module });
};
