export const TAB_PATHS: Record<string, string> = {
  'pos':                      '/materiales/ventas',
  'purchases':                '/materiales/compras',
  'inventory':                '/materiales/productos',
  'customers':                '/materiales/clientes',
  'customer-alerts':          '/materiales/alertas',
  'reports':                  '/materiales/reportes',
  'audit-internal':           '/materiales/auditorias',
  'production':               '/materiales/produccion',
  'branches':                 '/sucursales',
  'users':                    '/usuarios',
  'concrete-pos':             '/concretera/ventas',
  'concrete-purchases':       '/concretera/compras',
  'concrete-inventory':       '/concretera/productos',
  'concrete-customers':       '/concretera/clientes',
  'concrete-customer-alerts': '/concretera/alertas',
  'concrete-reports':         '/concretera/reportes',
  'concrete-audit':           '/concretera/auditorias',
  'diesel':                   '/logistica/diesel',
  'transport-pos':             '/transporteria/ventas',
  'transport-purchases':       '/transporteria/compras',
  'transport-inventory':       '/transporteria/productos',
  'transport-customers':       '/transporteria/clientes',
  'transport-customer-alerts': '/transporteria/alertas',
  'transport-audit':           '/transporteria/auditorias',
  'transport-reports':         '/transporteria/reportes',

  'vinos-customers':           '/vinos/clientes',
  'vinos-inventory':           '/vinos/productos',
  'vinos-pos':                 '/vinos/ventas',
  'vinos-purchases':           '/vinos/compras',
  'vinos-audit':               '/vinos/auditorias',
  'vinos-reports':             '/vinos/reportes',
  'vinos-campaigns':           '/vinos/campanas',
};

export const PATH_TO_TAB: Record<string, string> = Object.fromEntries(
  Object.entries(TAB_PATHS).map(([tab, path]) => [path, tab])
);

export const tabToPath = (tabId: string): string => TAB_PATHS[tabId] ?? '/';
export const pathToTab = (pathname: string): string => PATH_TO_TAB[pathname] ?? '';
