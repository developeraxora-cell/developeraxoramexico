
import React, { useEffect, useRef, useState } from 'react';
import { User, Branch, Role } from '../types';
import { userCanAccessBranch, userCanAccessTab } from '../services/auth/permissions';
import AssistantDrawer, { AssistantAgent } from './common/AssistantDrawer';

interface LayoutProps {
  children: React.ReactNode;
  activeTab: string;
  setActiveTab: (tab: string) => void;
  currentUser: User;
  onLogout: () => void | Promise<void>;
  selectedBranchId: string;
  setSelectedBranchId: (id: string) => void;
  branches: Branch[];
  onReset?: () => void;
}

interface NavItem {
  id: string;
  label: string;
  icon: React.ReactNode;
  children?: NavItem[];
}

interface NavGroup {
  id: string;
  label: string;
  icon: React.ReactNode;
  items: NavItem[];
}

interface CollapsedFlyoutState {
  groupId: string;
  top: number;
  left: number;
}

const BrickIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 140 100" width="22" height="22">
    <polygon points="95,40 120,20 120,62 95,82" fill="#A84E20"/>
    <polygon points="10,40 95,40 120,20 35,20" fill="#E8935A"/>
    <polygon points="10,40 95,40 95,82 10,82" fill="#C96A30"/>
    <defs>
      <clipPath id="brickTop">
        <polygon points="10,40 95,40 120,20 35,20"/>
      </clipPath>
    </defs>
    <ellipse cx="44" cy="30" rx="11" ry="7" fill="#7A3010" clipPath="url(#brickTop)"/>
    <ellipse cx="44" cy="30" rx="8" ry="5" fill="#3A1505" clipPath="url(#brickTop)"/>
    <ellipse cx="67" cy="30" rx="11" ry="7" fill="#7A3010" clipPath="url(#brickTop)"/>
    <ellipse cx="67" cy="30" rx="8" ry="5" fill="#3A1505" clipPath="url(#brickTop)"/>
    <ellipse cx="90" cy="30" rx="11" ry="7" fill="#7A3010" clipPath="url(#brickTop)"/>
    <ellipse cx="90" cy="30" rx="8" ry="5" fill="#3A1505" clipPath="url(#brickTop)"/>
  </svg>
);

const Layout: React.FC<LayoutProps> = ({
  children, activeTab, setActiveTab, currentUser, onLogout,
  selectedBranchId, setSelectedBranchId, branches, onReset
}) => {
  const [expandedGroups, setExpandedGroups] = useState<string[]>([]);
  const [expandedItems, setExpandedItems] = useState<string[]>([]);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [collapsedFlyout, setCollapsedFlyout] = useState<CollapsedFlyoutState | null>(null);
  const [pinnedFlyoutGroupId, setPinnedFlyoutGroupId] = useState<string | null>(null);
  const [isAssistantOpen, setIsAssistantOpen] = useState(false);
  const [assistantPrompt, setAssistantPrompt] = useState('');
  const [assistantAgent, setAssistantAgent] = useState<AssistantAgent | undefined>(undefined);
  const hasInitializedSidebar = useRef(false);
  const lastSidebarUserId = useRef<string | null>(null);
  const hasProcessedInitialTab = useRef(false);
  const asideRef = useRef<HTMLElement | null>(null);
  const flyoutRef = useRef<HTMLDivElement | null>(null);
  const canUseAssistant = currentUser?.role === Role.SOCIO || currentUser?.role === Role.SUPERADMIN;

  const handleLogout = async () => {
    const promises: Promise<unknown>[] = [];
    window.dispatchEvent(new CustomEvent('lopar:assistant-save-session', { detail: { promises } }));
    if (promises.length > 0) await Promise.allSettled(promises);
    await onLogout();
  };

  const navigation: NavGroup[] = [
    {
      id: 'gerencial',
      label: 'Gerencial',
      icon: '📈',
      items: [
        { id: 'executive-dashboard', label: 'Reporte Gerencial', icon: '📊' },
      ]
    },
    {
      id: 'materiales',
      label: 'Materiales',
      icon: '🏗️',
      items: [
        { id: 'pos', label: 'Caja / Venta', icon: '🛒' },
        { id: 'purchases', label: 'Compras / Entradas', icon: '📥' },
        { id: 'inventory', label: 'Productos', icon: '📦' },
        { id: 'physical-inventory', label: 'Inventario', icon: '📋' },
        { id: 'customers', label: 'Clientes / Crédito', icon: '👥' },
        { id: 'customer-alerts', label: 'Alertas clientes', icon: '🚨' },
        { id: 'reports', label: 'Reportes', icon: '📊' },
        { id: 'materials-executive-dashboard', label: 'Reporte Gerencial', icon: '📈' },
        { id: 'audit-internal', label: 'Auditoria', icon: '📋' },
        { id: 'production', label: 'Produccion', icon: '🏭' },
        { id: 'branches', label: 'Sucursales', icon: '🏢' },
        { id: 'users', label: 'Personal / Usuarios', icon: '🛡️' },
      ]
    },
    {
      id: 'concretera',
      label: 'Concretera',
      icon: <BrickIcon />,
      items: [
        { id: 'concrete-pos', label: 'Caja / Venta', icon: '🛒' },
        { id: 'concrete-purchases', label: 'Compras / Entradas', icon: '📥' },
        { id: 'concrete-inventory', label: 'Productos', icon: '📦' },
        { id: 'concrete-customers', label: 'Clientes / Crédito', icon: '👥' },
        { id: 'concrete-customer-alerts', label: 'Alertas clientes', icon: '🚨' },
        { id: 'concrete-reports', label: 'Reportes', icon: '📊' },
        { id: 'concrete-executive-dashboard', label: 'Reporte Gerencial', icon: '📈' },
        { id: 'concrete-audit', label: 'Auditorias', icon: '📋' },
      ]
    },
    {
      id: 'logistica',
      label: 'Logística',
      icon: '⛽',
      items: [
        { id: 'diesel', label: 'Gestión de Diésel', icon: '🔥' },
      ]
    },
    {
      id: 'transporteria',
      label: 'Transportes',
      icon: '🚚',
      items: [
        { id: 'transport-pos', label: 'Caja / Venta', icon: '🛒' },
        { id: 'transport-purchases', label: 'Compras / Entradas', icon: '📥' },
        { id: 'transport-inventory', label: 'Productos', icon: '📦' },
        { id: 'transport-customers', label: 'Clientes / Crédito', icon: '👥' },
        { id: 'transport-customer-alerts', label: 'Alertas clientes', icon: '🚨' },
        { id: 'transport-reports', label: 'Reportes', icon: '📊' },
        { id: 'transport-executive-dashboard', label: 'Reporte Gerencial', icon: '📈' },
        { id: 'transport-audit', label: 'Auditorías', icon: '📋' },
      ]
    },
    {
      id: 'vinos',
      label: 'Casa Tahona',
      icon: '🍷',
      items: [
        { id: 'vinos-pos', label: 'Caja / Venta', icon: '🛒' },
        { id: 'vinos-purchases', label: 'Compras / Entradas', icon: '📥' },
        { id: 'vinos-inventory', label: 'Productos', icon: '📦' },
        { id: 'vinos-customers', label: 'Clientes', icon: '👥' },
        { id: 'vinos-reports', label: 'Reportes / CRM', icon: '📊' },
        { id: 'vinos-campaigns', label: 'Campañas', icon: '📣' },
        { id: 'vinos-audit', label: 'Auditorías', icon: '📋' },
      ]
    }
  ];

  // Mantener el sidebar colapsado en la primera carga; luego respetar navegación del usuario.
  useEffect(() => {
    if (!currentUser?.id) return;
    if (lastSidebarUserId.current !== currentUser.id) {
      lastSidebarUserId.current = currentUser.id;
      hasInitializedSidebar.current = false;
      hasProcessedInitialTab.current = false;
    }
    if (!hasInitializedSidebar.current) {
      hasInitializedSidebar.current = true;
      setExpandedGroups([]);
      setExpandedItems([]);
      return;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser?.id]);

  // Al cambiar de tab, asegurar que su grupo y su padre (si tiene hijos) estén expandidos
  useEffect(() => {
    if (!hasInitializedSidebar.current) return;
    if (!hasProcessedInitialTab.current) {
      hasProcessedInitialTab.current = true;
      return;
    }

    const parentGroup = navigation.find((group) =>
      group.items.some((item) => item.id === activeTab || item.children?.some((child) => child.id === activeTab))
    );
    if (parentGroup) {
      setExpandedGroups((prev) => (prev.includes(parentGroup.id) ? prev : [...prev, parentGroup.id]));
    }

    const parentItem = navigation.flatMap((group) => group.items).find((item) =>
      item.children?.some((child) => child.id === activeTab)
    );
    if (parentItem) {
      setExpandedItems((prev) => (prev.includes(parentItem.id) ? prev : [...prev, parentItem.id]));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  const toggleGroup = (id: string) => {
    if (isSidebarCollapsed) {
      return;
    }
    setExpandedGroups(prev =>
      prev.includes(id) ? prev.filter(g => g !== id) : [...prev, id]
    );
  };

  const toggleItem = (id: string) => {
    setExpandedItems((prev) => (prev.includes(id) ? prev.filter((itemId) => itemId !== id) : [...prev, id]));
  };

  const canRenderItem = (item: NavItem) => {
    if (item.children?.length) {
      return item.children.some((child) => userCanAccessTab(currentUser, child.id));
    }
    return userCanAccessTab(currentUser, item.id);
  };

  const activeBranchName = branches.find(b => b.id === selectedBranchId)?.name?.toUpperCase() ?? '';
  const isDegolladoBranch = activeBranchName.includes('DEGOLLADO');

  const isTransportUser = currentUser?.role === Role.TRANSPORT_USER;

  const visibleNavigation = (() => {
    const built = navigation
      .map((group) => ({
        ...group,
        items: group.items
          .map((item) => item.children
            ? { ...item, children: item.children.filter((child) => userCanAccessTab(currentUser, child.id)) }
            : item
          )
          .filter(canRenderItem),
      }))
      .filter((group) => group.items.length > 0);

    if (!isTransportUser) return built;

    const logisticaGroup = built.find((g) => g.id === 'logistica');
    const logisticaItems = logisticaGroup?.items ?? [];

    return built
      .filter((g) => g.id !== 'logistica')
      .map((g) => {
        if (g.id !== 'transporteria') return g;
        const [first, ...rest] = g.items;
        return { ...g, items: [first, ...logisticaItems, ...rest] };
      });
  })();

  const currentItem = visibleNavigation
    .flatMap((g) => g.items.flatMap((item) => (item.children ? [item, ...item.children] : [item])))
    .find((i) => i.id === activeTab);
  const currentGroup = visibleNavigation.find((g) =>
    g.items.some((i) => i.id === activeTab || i.children?.some((child) => child.id === activeTab))
  );
  const collapsedFlyoutGroup = collapsedFlyout
    ? visibleNavigation.find(group => group.id === collapsedFlyout.groupId) ?? null
    : null;

  const activeBranch = branches.find(b => b.id === selectedBranchId);
  const selectableBranches = branches.filter((branch) => userCanAccessBranch(currentUser, branch));
  const assistantBusinessUnit = ['materiales', 'concretera', 'logistica', 'transporteria', 'vinos'].includes(String(currentGroup?.id))
    ? String(currentGroup?.id)
    : activeBranch?.businessUnit || 'materiales';

  useEffect(() => {
    if (!canUseAssistant && isAssistantOpen) {
      setIsAssistantOpen(false);
    }
  }, [canUseAssistant, isAssistantOpen]);

  useEffect(() => {
    const handleOpenAssistant = (event: Event) => {
      const detail = (event as CustomEvent<{ prompt?: string; agent?: AssistantAgent }>).detail;
      setAssistantPrompt(detail?.prompt ?? '');
      setAssistantAgent(detail?.agent);
      setIsAssistantOpen(true);
    };
    window.addEventListener('lopar:open-assistant', handleOpenAssistant as EventListener);
    return () => window.removeEventListener('lopar:open-assistant', handleOpenAssistant as EventListener);
  }, []);

  useEffect(() => {
    if (!pinnedFlyoutGroupId) return;

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (asideRef.current?.contains(target)) return;
      if (flyoutRef.current?.contains(target)) return;
      setPinnedFlyoutGroupId(null);
      setCollapsedFlyout(null);
    };

    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, [pinnedFlyoutGroupId]);

  return (
    <div className="h-screen w-full flex flex-col md:flex-row bg-slate-50 text-slate-900 overflow-hidden relative">
      {/* Mobile Backdrop */}
      {isMobileMenuOpen && (
        <div
          className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-40 md:hidden"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      <aside ref={asideRef} className={`
        fixed md:static inset-y-0 left-0 w-72 bg-slate-900 text-white flex flex-col shadow-2xl z-50 overflow-visible
        transition-transform duration-300 ease-in-out
        md:transition-[width] md:duration-300
        ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
        ${isSidebarCollapsed ? 'md:w-24' : 'md:w-72'}
      `}>
        <div className={`border-b border-slate-800 ${isSidebarCollapsed ? 'p-4' : 'p-8'}`}>
          <div className={`flex items-center ${isSidebarCollapsed ? 'justify-center' : 'gap-3'}`}>
            <div className="bg-orange-600 w-10 h-10 rounded-xl flex items-center justify-center shadow-lg shadow-orange-600/20 shrink-0">
              <span className="text-2xl">⚒️</span>
            </div>
            {!isSidebarCollapsed && (
              <div className="flex flex-col min-w-0">
                <span className="text-xl font-black leading-none tracking-tighter">GRUPO LOPAR</span>
                <span className="text-[9px] text-orange-500 font-bold uppercase tracking-widest mt-1 italic">Industrial OS</span>
              </div>
            )}
          </div>
        </div>

        <nav className={`flex-1 mt-4 overflow-y-auto overflow-x-visible no-scrollbar ${isSidebarCollapsed ? 'p-2 space-y-2' : 'p-3 space-y-4'}`}>
          {visibleNavigation.map((group) => (
            <div
              key={group.id}
              className="relative space-y-1"
              onMouseEnter={(event) => {
                if (!isSidebarCollapsed) return;
                if (pinnedFlyoutGroupId && pinnedFlyoutGroupId !== group.id) return;
                const rect = event.currentTarget.getBoundingClientRect();
                setCollapsedFlyout({
                  groupId: group.id,
                  top: Math.max(12, rect.top),
                  left: rect.right + 12,
                });
              }}
              onMouseLeave={() => {
                if (!isSidebarCollapsed) return;
                if (pinnedFlyoutGroupId === group.id) return;
                window.setTimeout(() => {
                  setCollapsedFlyout((prev) => (prev?.groupId === group.id ? null : prev));
                }, 80);
              }}
            >
              <button
                onClick={(event) => {
                  if (!isSidebarCollapsed) {
                    toggleGroup(group.id);
                    return;
                  }

                  const rect = event.currentTarget.getBoundingClientRect();
                  if (pinnedFlyoutGroupId === group.id) {
                    setPinnedFlyoutGroupId(null);
                    setCollapsedFlyout(null);
                    return;
                  }

                  setCollapsedFlyout({
                    groupId: group.id,
                    top: Math.max(12, rect.top),
                    left: rect.right + 12,
                  });
                  setPinnedFlyoutGroupId(group.id);
                }}
                className={`w-full flex items-center text-slate-400 hover:text-white transition-colors ${
                  isSidebarCollapsed
                    ? 'justify-center rounded-2xl px-2 py-3 hover:bg-slate-800'
                    : 'justify-between px-4 py-3'
                }`}
              >
                <div className={`flex items-center ${isSidebarCollapsed ? 'justify-center' : 'gap-3'}`}>
                  <span className="text-xl transition-transform group-hover:scale-110">{group.icon}</span>
                  {!isSidebarCollapsed && <span className="text-xs font-black uppercase tracking-widest">{group.label}</span>}
                </div>
                {!isSidebarCollapsed && (
                  <span className={`text-[10px] transition-transform duration-300 ${expandedGroups.includes(group.id) ? 'rotate-180' : ''}`}>
                    ▼
                  </span>
                )}
              </button>

              {!isSidebarCollapsed && expandedGroups.includes(group.id) && (
                <div className="space-y-1 ml-2 border-l border-slate-800 pl-2 animate-in slide-in-from-top-2 duration-200">
                  {group.items.map((item) => (
                    <div key={item.id} className="space-y-1">
                      {item.children ? (
                        <>
                          <button
                            type="button"
                            onClick={() => toggleItem(item.id)}
                            className="flex w-full items-center justify-between rounded-xl px-4 py-3 text-sm text-slate-500 transition-all hover:bg-slate-800/50 hover:text-slate-200"
                          >
                            <div className="flex items-center gap-3">
                              <span className="text-lg">{item.icon}</span>
                              <span className="tracking-tight">{item.label}</span>
                            </div>
                            <span className={`text-[10px] transition-transform duration-300 ${expandedItems.includes(item.id) ? 'rotate-180' : ''}`}>
                              ▼
                            </span>
                          </button>
                          {expandedItems.includes(item.id) && (
                            <div className="ml-6 space-y-1 border-l border-slate-800 pl-2">
                              {item.children.map((child) => (
                                <button
                                  key={child.id}
                                  onClick={() => {
                                    setActiveTab(child.id);
                                    setIsMobileMenuOpen(false);
                                  }}
                                  className={`flex w-full items-center gap-3 rounded-xl px-4 py-3 text-sm transition-all ${
                                    activeTab === child.id
                                      ? 'bg-orange-600 text-white font-bold shadow-lg shadow-orange-600/20'
                                      : 'text-slate-500 hover:text-slate-200 hover:bg-slate-800/50'
                                  }`}
                                >
                                  <span className="text-lg">{child.icon}</span>
                                  <span className="tracking-tight">{child.label}</span>
                                </button>
                              ))}
                            </div>
                          )}
                        </>
                      ) : (
                        <button
                          onClick={() => {
                            setActiveTab(item.id);
                            setIsMobileMenuOpen(false);
                          }}
                          title={item.label}
                          className={`w-full flex items-center rounded-xl text-sm transition-all gap-3 px-4 py-3 ${
                            activeTab === item.id
                              ? 'bg-orange-600 text-white font-bold shadow-lg shadow-orange-600/20'
                              : 'text-slate-500 hover:text-slate-200 hover:bg-slate-800/50'
                          }`}
                        >
                          <span className="text-lg">{item.icon}</span>
                          <span className="tracking-tight">{item.label}</span>
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </nav>

        <div className={`${isSidebarCollapsed ? 'p-3' : 'p-6'} bg-slate-950 border-t border-slate-800`}>
          <div className={`mb-6 rounded-2xl border border-slate-800 bg-slate-900/50 ${isSidebarCollapsed ? 'p-2' : 'p-3'} flex items-center ${isSidebarCollapsed ? 'justify-center' : 'gap-4'}`}>
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-orange-400 to-orange-600 flex items-center justify-center font-black text-white">
              {currentUser.name.charAt(0)}
            </div>
            {!isSidebarCollapsed && (
              <div className="flex-1 min-w-0">
                <p className="text-xs font-black text-white truncate uppercase tracking-tighter">{currentUser.name}</p>
                <p className="text-[9px] text-orange-400 font-black uppercase tracking-widest truncate">
                  {currentUser.role}
                </p>
              </div>
            )}
          </div>

          <button
            onClick={() => void handleLogout()}
            title="Cerrar sesion"
            className={`w-full bg-slate-800 hover:bg-red-500/10 hover:text-red-500 transition-all rounded-2xl text-[10px] font-black uppercase tracking-widest text-slate-500 border border-transparent hover:border-red-500/20 ${
              isSidebarCollapsed ? 'px-0 py-4' : 'py-4'
            }`}
          >
            {isSidebarCollapsed ? '⎋' : 'Cerrar Sesión'}
          </button>
        </div>

        <div className="hidden border-t border-slate-800 bg-[#0d2742] md:block">
          <button
            type="button"
            onClick={() => {
              setIsSidebarCollapsed((prev) => !prev);
              setCollapsedFlyout(null);
              setPinnedFlyoutGroupId(null);
            }}
            className="flex w-full items-center justify-center py-3 text-xl text-slate-200 transition hover:bg-[#13385c] hover:text-white"
            title={isSidebarCollapsed ? 'Expandir menu' : 'Reducir menu'}
          >
            {isSidebarCollapsed ? '›' : '‹'}
          </button>
        </div>
      </aside>

      {isSidebarCollapsed && collapsedFlyout && collapsedFlyoutGroup && (
        <div
          ref={flyoutRef}
          className="fixed z-[80] hidden w-72 overflow-hidden rounded-2xl border border-slate-800 bg-slate-950 shadow-2xl md:block"
          style={{ top: collapsedFlyout.top, left: collapsedFlyout.left }}
          onMouseEnter={() => setCollapsedFlyout(collapsedFlyout)}
          onMouseLeave={() => {
            if (pinnedFlyoutGroupId === collapsedFlyout.groupId) return;
            setCollapsedFlyout(null);
          }}
        >
          <div className="border-b border-slate-800 px-4 py-3">
            <p className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-400">
              {collapsedFlyoutGroup.label}
            </p>
          </div>
          <div className="space-y-1 p-2">
            {collapsedFlyoutGroup.items.map((item) => (
              <div key={item.id} className="space-y-1">
                {item.children ? (
                  <>
                    <div className="flex items-center justify-between rounded-xl px-4 py-3 text-left text-sm text-slate-300">
                      <div className="flex items-center gap-3">
                        <span className="text-lg">{item.icon}</span>
                        <span className="tracking-tight">{item.label}</span>
                      </div>
                    </div>
                    <div className="ml-6 space-y-1 border-l border-slate-800 pl-2">
                      {item.children.map((child) => (
                        <button
                          key={child.id}
                          onClick={() => {
                            setActiveTab(child.id);
                            setCollapsedFlyout(null);
                            setPinnedFlyoutGroupId(null);
                            setIsMobileMenuOpen(false);
                          }}
                          className={`flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-sm transition-all ${
                            activeTab === child.id
                              ? 'bg-orange-600 text-white font-bold shadow-lg shadow-orange-600/20'
                              : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                          }`}
                        >
                          <span className="text-lg">{child.icon}</span>
                          <span className="tracking-tight">{child.label}</span>
                        </button>
                      ))}
                    </div>
                  </>
                ) : (
                  <button
                    onClick={() => {
                      setActiveTab(item.id);
                      setCollapsedFlyout(null);
                      setPinnedFlyoutGroupId(null);
                      setIsMobileMenuOpen(false);
                    }}
                    className={`flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-sm transition-all ${
                      activeTab === item.id
                        ? 'bg-orange-600 text-white font-bold shadow-lg shadow-orange-600/20'
                        : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                    }`}
                  >
                    <span className="text-lg">{item.icon}</span>
                    <span className="tracking-tight">{item.label}</span>
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <main className="flex-1 flex flex-col min-w-0 bg-slate-50 h-full overflow-hidden">
        <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-md px-4 md:px-8 py-3 md:py-5 border-b border-slate-200 flex flex-row justify-between items-center gap-4 shadow-sm shadow-slate-200/50">
          <div className="flex min-w-0 items-center gap-2 md:gap-4">
            {/* Hamburger Menu Toggle */}
            <button
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className="md:hidden w-10 h-10 bg-slate-900 text-white rounded-xl flex items-center justify-center shadow-lg"
            >
              {isMobileMenuOpen ? '✕' : '☰'}
            </button>

            <div className="hidden md:flex w-10 h-10 bg-slate-900 rounded-xl items-center justify-center text-xl shadow-lg">
              {currentItem?.icon || '🏢'}
            </div>
            <div className="hidden md:block min-w-0">
              <h1 className="truncate text-base font-black text-slate-900 uppercase tracking-tighter leading-none sm:text-lg md:text-xl">
                {currentItem?.label || 'Escritorio'}
              </h1>
              <p className="mt-1 truncate text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                {currentGroup?.label || 'General'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 md:gap-4">
            <div className="bg-white border-2 rounded-2xl px-3 py-2 md:px-5 md:py-2.5 flex items-center gap-2 md:gap-3 shadow-sm transition-all border-orange-500 shadow-orange-500/10">
              <div className="flex min-w-0 flex-col">
                <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-0.5">Ubicación Activa</span>
                <div className="flex min-w-0 items-center gap-1 md:gap-2">
                  <span className="text-sm md:text-lg">🏢</span>
                  <select
                    value={selectedBranchId}
                    onChange={(e) => setSelectedBranchId(e.target.value)}
                    className="max-w-[92px] bg-transparent font-black text-slate-900 outline-none text-[10px] md:max-w-[180px] md:text-xs uppercase tracking-tight cursor-pointer"
                  >
                    {selectableBranches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                </div>
              </div>
              <div className="bg-green-100 p-2 rounded-lg text-green-600 animate-pulse" title="Ubicación editable">🌐</div>
            </div>
            {canUseAssistant && (
              <button
                onClick={() => {
                  setAssistantPrompt('');
                  setAssistantAgent(undefined);
                  setIsAssistantOpen(true);
                }}
                title="Asistente IA"
                aria-label="Abrir asistente IA"
                className="group relative flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-900 text-orange-400 shadow-lg shadow-slate-900/20 transition-all hover:bg-slate-800 hover:text-orange-300 hover:shadow-orange-500/20 md:h-11 md:w-11"
              >
                <span className="absolute right-1 top-1 h-2 w-2 animate-pulse rounded-full bg-orange-500 ring-2 ring-slate-900" />
                <svg className="h-6 w-6 transition-transform group-hover:scale-110" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 3.5V6" />
                  <circle cx="12" cy="2.6" r="1" fill="currentColor" stroke="none" />
                  <rect x="4" y="6" width="16" height="12" rx="3.5" />
                  <path d="M2 11v3M22 11v3" />
                  <circle cx="9" cy="12" r="1.3" fill="currentColor" stroke="none" />
                  <circle cx="15" cy="12" r="1.3" fill="currentColor" stroke="none" />
                  <path d="M9.5 15.2h5" />
                </svg>
              </button>
            )}
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-4 md:p-8">
          <div className="max-w-[1600px] mx-auto pb-32">
            {/* Título del módulo en móvil (sale del header en pantallas chicas) */}
            <div className="md:hidden mb-4 flex items-center gap-3">
              <div className="w-9 h-9 bg-slate-900 rounded-lg flex items-center justify-center text-lg shadow-lg shrink-0">
                {currentItem?.icon || '🏢'}
              </div>
              <div className="min-w-0">
                <h1 className="truncate text-lg font-black text-slate-900 uppercase tracking-tighter leading-none">
                  {currentItem?.label || 'Escritorio'}
                </h1>
                <p className="mt-1 truncate text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                  {currentGroup?.label || 'General'}
                </p>
              </div>
            </div>
            {children}
          </div>
        </div>
      </main>

      {canUseAssistant && (
        <AssistantDrawer
          isOpen={isAssistantOpen}
          onClose={() => setIsAssistantOpen(false)}
          branchName={activeBranch?.name}
          userName={currentUser?.name?.split(' ')[0]}
          userId={currentUser?.id}
          businessUnit={assistantBusinessUnit}
          branchId={selectedBranchId}
          initialPrompt={assistantPrompt}
          agent={assistantAgent}
        />
      )}
    </div>
  );
};

export default Layout;
