import { BusinessUnit, Role, User } from '../../types';

export type PermissionAction = 'view' | 'create' | 'edit' | 'delete' | 'export' | 'admin';

export interface TabPermission {
  businessUnit: BusinessUnit;
  moduleKey: string;
  action?: PermissionAction;
}

export const TAB_PERMISSIONS: Record<string, TabPermission> = {
  pos: { businessUnit: 'materiales', moduleKey: 'sales' },
  purchases: { businessUnit: 'materiales', moduleKey: 'purchases' },
  inventory: { businessUnit: 'materiales', moduleKey: 'products' },
  'physical-inventory': { businessUnit: 'materiales', moduleKey: 'products' },
  customers: { businessUnit: 'materiales', moduleKey: 'customers' },
  'customer-alerts': { businessUnit: 'materiales', moduleKey: 'alerts' },
  reports: { businessUnit: 'materiales', moduleKey: 'reports' },
  audit: { businessUnit: 'materiales', moduleKey: 'audit' },
  'audit-internal': { businessUnit: 'materiales', moduleKey: 'audit' },
  production: { businessUnit: 'materiales', moduleKey: 'production' },
  branches: { businessUnit: 'global', moduleKey: 'branches' },
  users: { businessUnit: 'global', moduleKey: 'users' },

  'concrete-pos': { businessUnit: 'concretera', moduleKey: 'sales' },
  'concrete-purchases': { businessUnit: 'concretera', moduleKey: 'purchases' },
  'concrete-inventory': { businessUnit: 'concretera', moduleKey: 'products' },
  'concrete-customers': { businessUnit: 'concretera', moduleKey: 'customers' },
  'concrete-customer-alerts': { businessUnit: 'concretera', moduleKey: 'alerts' },
  'concrete-reports': { businessUnit: 'concretera', moduleKey: 'reports' },
  'concrete-audit': { businessUnit: 'concretera', moduleKey: 'audit' },
  'concrete-audit-internal': { businessUnit: 'concretera', moduleKey: 'audit' },
  'concrete-production': { businessUnit: 'concretera', moduleKey: 'production' },

  diesel: { businessUnit: 'logistica', moduleKey: 'diesel' },

  'transport-pos':              { businessUnit: 'transporteria', moduleKey: 'sales' },
  'transport-purchases':        { businessUnit: 'transporteria', moduleKey: 'purchases' },
  'transport-inventory':        { businessUnit: 'transporteria', moduleKey: 'products' },
  'transport-customers':        { businessUnit: 'transporteria', moduleKey: 'customers' },
  'transport-customer-alerts':  { businessUnit: 'transporteria', moduleKey: 'alerts' },
  'transport-audit':            { businessUnit: 'transporteria', moduleKey: 'audit' },
  'transport-reports':          { businessUnit: 'transporteria', moduleKey: 'reports' },

  'vinos-customers':            { businessUnit: 'vinos', moduleKey: 'customers' },
  'vinos-inventory':            { businessUnit: 'vinos', moduleKey: 'products' },
  'vinos-pos':                  { businessUnit: 'vinos', moduleKey: 'sales' },
  'vinos-purchases':            { businessUnit: 'vinos', moduleKey: 'purchases' },
  'vinos-audit':                { businessUnit: 'vinos', moduleKey: 'audit' },
  'vinos-reports':              { businessUnit: 'vinos', moduleKey: 'reports' },
  'vinos-campaigns':            { businessUnit: 'vinos', moduleKey: 'campaigns' },
};

export const isFullAccessRole = (role?: Role | string | null) =>
  role === Role.ADMIN || role === Role.SUPERADMIN;

export const buildPermissionKey = (businessUnit: BusinessUnit, moduleKey: string, action: PermissionAction = 'view') =>
  `${businessUnit}.${moduleKey}.${action}`;

export const userCanAccess = (
  user: User | null | undefined,
  businessUnit: BusinessUnit,
  moduleKey: string,
  action: PermissionAction = 'view'
) => {
  if (!user || !user.active) return false;
  if (isFullAccessRole(user.role)) return true;

  // For VINOS_ADMIN: only vinos BU, regardless of DB business_units or permissions
  if (user.role === Role.VINOS_ADMIN) {
    return businessUnit === 'vinos';
  }

  const requiredPermission = buildPermissionKey(businessUnit, moduleKey, action);
  const permissions = user.permissions ?? [];
  if (permissions.length > 0) {
    return permissions.includes(requiredPermission);
  }

  const hasBusinessUnit = (user.businessUnits ?? []).includes(businessUnit);
  if (!hasBusinessUnit) return false;

  return true;
};

export const userCanAccessTab = (user: User | null | undefined, tabId: string) => {
  const permission = TAB_PERMISSIONS[tabId];
  if (!permission) return false;
  return userCanAccess(user, permission.businessUnit, permission.moduleKey, permission.action ?? 'view');
};

export const userCanAccessBranch = (user: User | null | undefined, branch: { id: string; code: string; dbId?: number; name?: string; isActive?: boolean }) => {
  if (!user || !user.active) return false;
  if (isFullAccessRole(user.role)) return true;
  if (branch.isActive === false) return false;

  const allowedDbIds = new Set((user.allowedBranchDbIds ?? []).map((id) => Number(id)).filter(Number.isFinite));
  const allowedCodes = new Set((user.allowedBranchIds ?? []).map((id) => String(id).trim()).filter(Boolean));
  const branchDbId = branch.dbId !== undefined ? Number(branch.dbId) : null;
  const branchId = String(branch.id).trim();
  const branchCode = String(branch.code).trim();
  if (branchDbId !== null && allowedDbIds.has(branchDbId)) return true;
  if (allowedCodes.has(branchId) || allowedCodes.has(branchCode) || allowedCodes.has(String(branchDbId ?? ''))) return true;

  return false;
};

export const firstAccessibleTab = (user: User | null | undefined, tabIds: string[]) =>
  tabIds.find((tabId) => userCanAccessTab(user, tabId)) ?? '';
