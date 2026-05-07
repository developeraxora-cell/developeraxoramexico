import { supabase } from '../supabaseClient';
import { BusinessUnit, Role, User } from '../../types';

interface AuthPayloadRow {
  session_token: string;
  user_id: string;
  email?: string | null;
  full_name?: string | null;
  username?: string | null;
  role_key?: string | null;
  active?: boolean | null;
  default_branch_id?: number | null;
  session_minutes?: number | null;
  allowed_branch_ids?: string[] | null;
  allowed_branch_db_ids?: number[] | null;
  business_units?: BusinessUnit[] | null;
  permissions?: string[] | null;
  expires_at?: string | null;
}

const SESSION_TOKEN_KEY = 'lopar_session_token';

const normalizeRole = (value?: string | null): Role => {
  const key = String(value ?? '').trim().toUpperCase();
  if (key === 'SUPERADMIN' || key === 'SUPER_ADMIN') return Role.SUPERADMIN;
  if (key === 'ADMIN' || key === 'ADMINISTRADOR') return Role.ADMIN;
  if (key === 'SOCIO') return Role.SOCIO;
  if (key === 'MATERIALS_USER' || key === 'MATERIAL_USER' || key === 'USUARIO_MATERIALES') return Role.MATERIALS_USER;
  if (key === 'CONCRETE_USER' || key === 'CONCRETERA_USER' || key === 'USUARIO_CONCRETERA') return Role.CONCRETE_USER;
  if (key === 'ALMACEN' || key === 'ALMACENISTA') return Role.ALMACEN;
  return Role.CAJERO;
};

const normalizeBusinessUnit = (value: unknown): BusinessUnit | null => {
  const key = String(value ?? '').trim().toLowerCase();
  if (key === 'materiales' || key === 'concretera' || key === 'logistica' || key === 'global') return key;
  return null;
};

const buildUserFromPayload = (payload: AuthPayloadRow): User => {
  const role = normalizeRole(payload.role_key);
  const allowedBranchDbIds = Array.from(new Set((payload.allowed_branch_db_ids ?? []).map((id) => Number(id)).filter(Number.isFinite)));
  const allowedBranchIds = Array.from(new Set((payload.allowed_branch_ids ?? []).map((id) => String(id)).filter(Boolean)));
  const businessUnits = Array.from(new Set((payload.business_units ?? []).map((unit) => normalizeBusinessUnit(unit)).filter(Boolean) as BusinessUnit[]));

  return {
    id: payload.user_id,
    authUserId: payload.user_id,
    email: payload.email ?? '',
    name: payload.full_name || payload.email || 'Usuario',
    username: payload.username || payload.email || payload.user_id,
    role,
    active: payload.active !== false,
    branchId: allowedBranchIds.length === 1 ? allowedBranchIds[0] : undefined,
    allowedBranchIds,
    allowedBranchDbIds,
    businessUnits,
    permissions: payload.permissions ?? [],
    sessionMinutes: Number(payload.session_minutes ?? 480),
  };
};

export const authService = {
  async signIn(identifier: string, password: string) {
    const { data, error } = await supabase.rpc('app_login_user', {
      p_identifier: identifier.trim(),
      p_password: password,
    });

    if (error) throw error;
    const payload = Array.isArray(data) ? data[0] : data;
    if (!payload?.session_token) {
      throw new Error('No se pudo iniciar sesion.');
    }

    localStorage.setItem(SESSION_TOKEN_KEY, String(payload.session_token));
    return payload as AuthPayloadRow;
  },

  async signOut(sessionToken?: string | null) {
    const token = sessionToken || localStorage.getItem(SESSION_TOKEN_KEY);
    if (token) {
      await supabase.rpc('app_logout_user', { p_session_token: token });
    }
    localStorage.removeItem(SESSION_TOKEN_KEY);
  },

  async getSessionToken() {
    return localStorage.getItem(SESSION_TOKEN_KEY);
  },

  async getCurrentUser(sessionToken: string): Promise<User> {
    const { data, error } = await supabase.rpc('app_validate_session', {
      p_session_token: sessionToken,
    });

    if (error) {
      throw new Error('No se pudo validar la sesion.');
    }

    const payload = Array.isArray(data) ? data[0] : data;
    if (!payload?.user_id) {
      throw new Error('La sesion no es valida o ya expiro.');
    }

    return buildUserFromPayload(payload as AuthPayloadRow);
  },
};

