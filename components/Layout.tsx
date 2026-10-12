import AppIcon from './common/AppIcon';

import React, { useEffect, useRef, useState } from 'react';
import { Blocks, LogOut, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
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

const normalizeBranchText = (value?: string | null) =>
  String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase();

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
  const isFullBleedContent = activeTab === 'vinos-pos';

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
      icon: <AppIcon name="trend" />,
      items: [
        { id: 'executive-dashboard', label: 'Reporte Gerencial', icon: <AppIcon name="chart" /> },
      ]
    },
    {
      id: 'materiales',
      label: 'Materiales',
      icon: <AppIcon name="construction" />,
      items: [
        { id: 'pos', label: 'Caja / Venta', icon: <AppIcon name="cart" /> },
        { id: 'purchases', label: 'Compras / Entradas', icon: <AppIcon name="download" /> },
        { id: 'inventory', label: 'Productos', icon: <AppIcon name="package" /> },
        { id: 'physical-inventory', label: 'Inventario', icon: <AppIcon name="clipboard" /> },
        { id: 'customers', label: 'Clientes / Crédito', icon: <AppIcon name="users" /> },
        { id: 'customer-alerts', label: 'Alertas clientes', icon: <AppIcon name="alert" /> },
        { id: 'reports', label: 'Reportes', icon: <AppIcon name="chart" /> },
        { id: 'materials-executive-dashboard', label: 'Reporte Gerencial', icon: <AppIcon name="trend" /> },
        { id: 'audit-internal', label: 'Auditoria', icon: <AppIcon name="clipboard" /> },
        { id: 'production', label: 'Produccion', icon: <AppIcon name="factory" /> },
        { id: 'branches', label: 'Sucursales', icon: <AppIcon name="building" /> },
        { id: 'users', label: 'Personal / Usuarios', icon: <AppIcon name="shield" /> },
      ]
    },
    {
      id: 'concretera',
      label: 'Concretera',
      icon: <Blocks className="crm-icon" aria-hidden="true" />,
      items: [
        { id: 'concrete-pos', label: 'Caja / Venta', icon: <AppIcon name="cart" /> },
        { id: 'concrete-purchases', label: 'Compras / Entradas', icon: <AppIcon name="download" /> },
        { id: 'concrete-inventory', label: 'Productos', icon: <AppIcon name="package" /> },
        { id: 'concrete-customers', label: 'Clientes / Crédito', icon: <AppIcon name="users" /> },
        { id: 'concrete-customer-alerts', label: 'Alertas clientes', icon: <AppIcon name="alert" /> },
        { id: 'concrete-reports', label: 'Reportes', icon: <AppIcon name="chart" /> },
        { id: 'concrete-executive-dashboard', label: 'Reporte Gerencial', icon: <AppIcon name="trend" /> },
        { id: 'concrete-audit', label: 'Auditorias', icon: <AppIcon name="clipboard" /> },
      ]
    },
    {
      id: 'logistica',
      label: 'Logística',
      icon: <AppIcon name="fuel" />,
      items: [
        { id: 'diesel', label: 'Gestión de Diésel', icon: <AppIcon name="fuel" /> },
      ]
    },
    {
      id: 'transporteria',
      label: 'Transportes',
      icon: <AppIcon name="truck" />,
      items: [
        { id: 'transport-pos', label: 'Caja / Venta', icon: <AppIcon name="cart" /> },
        { id: 'transport-purchases', label: 'Compras / Entradas', icon: <AppIcon name="download" /> },
        { id: 'transport-inventory', label: 'Productos', icon: <AppIcon name="package" /> },
        { id: 'transport-customers', label: 'Clientes / Crédito', icon: <AppIcon name="users" /> },
        { id: 'transport-customer-alerts', label: 'Alertas clientes', icon: <AppIcon name="alert" /> },
        { id: 'transport-reports', label: 'Reportes', icon: <AppIcon name="chart" /> },
        { id: 'transport-executive-dashboard', label: 'Reporte Gerencial', icon: <AppIcon name="trend" /> },
        { id: 'transport-audit', label: 'Auditorías', icon: <AppIcon name="clipboard" /> },
      ]
    },
    {
      id: 'vinos',
      label: 'Casa Tahona',
      icon: <AppIcon name="wine" />,
      items: [
        { id: 'vinos-pos', label: 'Caja / Venta', icon: <AppIcon name="cart" /> },
        { id: 'vinos-purchases', label: 'Compras / Entradas', icon: <AppIcon name="download" /> },
        { id: 'vinos-inventory', label: 'Productos', icon: <AppIcon name="package" /> },
        { id: 'vinos-physical-inventory', label: 'Inventario', icon: <AppIcon name="clipboard" /> },
        { id: 'vinos-customers', label: 'Clientes', icon: <AppIcon name="users" /> },
        { id: 'vinos-reports', label: 'Reportes / CRM', icon: <AppIcon name="chart" /> },
        { id: 'vinos-custom-cut', label: 'Corte personalizado', icon: <AppIcon name="print" /> },
        { id: 'vinos-campaigns', label: 'Campañas', icon: <AppIcon name="campaign" /> },
        { id: 'vinos-audit', label: 'Auditorías', icon: <AppIcon name="clipboard" /> },
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
  const isCasaTahonaModule = activeTab.startsWith('vinos-') || currentGroup?.id === 'vinos';
  const casaTahonaBranch = branches.find((branch) => normalizeBranchText(branch.businessUnit) === 'VINOS')
    ?? branches.find((branch) => {
      const label = normalizeBranchText(`${branch.name} ${branch.code}`);
      return label.includes('CASA TAHONA') || label.includes('TAHONA');
    })
    ?? null;
  const selectableBranches = isCasaTahonaModule
    ? (casaTahonaBranch ? [casaTahonaBranch] : activeBranch ? [activeBranch] : [])
    : branches.filter((branch) => userCanAccessBranch(currentUser, branch));
  const branchSelectorValue = isCasaTahonaModule && casaTahonaBranch ? casaTahonaBranch.id : selectedBranchId;
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
    <div className="crm-shell w-full flex flex-col md:flex-row bg-slate-50 text-slate-900 overflow-hidden relative">
      {/* Mobile Backdrop */}
      {isMobileMenuOpen && (
        <div
          className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-40 md:hidden"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      <aside ref={asideRef} className={`
        crm-sidebar fixed md:static shrink-0 inset-y-0 left-0 w-72 text-white flex flex-col z-50 overflow-visible
        transition-transform duration-300 ease-in-out
        md:transition-[width] md:duration-300
        ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
        ${isSidebarCollapsed ? 'md:w-20' : 'md:w-[264px]'}
      `}>
        <div className={`border-b border-slate-800 flex min-h-20 items-center ${isSidebarCollapsed ? 'justify-center p-4' : 'px-5 py-5'}`}>
          <div className={`flex items-center ${isSidebarCollapsed ? 'justify-center' : 'gap-3'}`}>
            <div className="bg-orange-600 w-10 h-10 rounded-xl flex items-center justify-center shadow-lg shadow-orange-600/20 shrink-0">
              <span className="text-2xl"><AppIcon name="construction" /></span>
            </div>
            {!isSidebarCollapsed && (
              <div className="flex flex-col min-w-0">
                <span className="text-base font-semibold leading-none tracking-tight">GRUPO LOPAR</span>
                <span className="text-[11px] text-slate-400 font-medium tracking-wide mt-1.5">Gestión empresarial</span>
              </div>
            )}
          </div>
        </div>

        {!isSidebarCollapsed && <p className="px-6 pt-6 pb-2 text-[10px] font-semibold uppercase tracking-[.16em] text-slate-400">Espacios de trabajo</p>}
        <nav aria-label="Navegación principal" className={`flex-1 min-h-0 overflow-y-auto overflow-x-visible ${isSidebarCollapsed ? 'p-2 pt-5 space-y-2' : 'p-3 space-y-2'}`}>
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
                title={group.label}
                aria-label={group.label}
                aria-expanded={isSidebarCollapsed ? collapsedFlyout?.groupId === group.id : expandedGroups.includes(group.id)}
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
                    ? 'justify-center rounded-xl px-2 py-3 hover:bg-slate-800'
                    : 'justify-between px-4 py-3'
                }`}
              >
                <div className={`flex items-center ${isSidebarCollapsed ? 'justify-center' : 'gap-3'}`}>
                  <span className="text-xl transition-transform group-hover:scale-110">{group.icon}</span>
                  {!isSidebarCollapsed && <span className="text-sm font-medium">{group.label}</span>}
                </div>
                {!isSidebarCollapsed && (
                  <span className={`text-xs transition-transform duration-300 ${expandedGroups.includes(group.id) ? 'rotate-180' : ''}`}>
                    <AppIcon name="chevron" />
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
                            aria-expanded={expandedItems.includes(item.id)}
                            onClick={() => toggleItem(item.id)}
                            className="flex w-full items-center justify-between rounded-xl px-4 py-3 text-sm text-slate-500 transition-all hover:bg-slate-800/50 hover:text-slate-200"
                          >
                            <div className="flex items-center gap-3">
                              <span className="text-lg">{item.icon}</span>
                              <span className="tracking-tight">{item.label}</span>
                            </div>
                            <span className={`text-xs transition-transform duration-300 ${expandedItems.includes(item.id) ? 'rotate-180' : ''}`}>
                              <AppIcon name="chevron" />
                            </span>
                          </button>
                          {expandedItems.includes(item.id) && (
                            <div className="ml-6 space-y-1 border-l border-slate-800 pl-2">
                              {item.children.map((child) => (
                                <button
                                  key={child.id}
                                  aria-current={activeTab === child.id ? 'page' : undefined}
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
                          aria-current={activeTab === item.id ? 'page' : undefined}
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

        <div className={`crm-sidebar-footer ${isSidebarCollapsed ? 'p-2' : 'p-4'} border-t border-slate-800`}>
          <div className={`mb-3 rounded-xl ${isSidebarCollapsed ? 'py-2' : 'p-2'} flex items-center ${isSidebarCollapsed ? 'justify-center' : 'gap-3'}`}>
            <div className="w-10 h-10 shrink-0 rounded-full bg-slate-700 flex items-center justify-center font-semibold text-white ring-1 ring-white/10">
              {currentUser.name.charAt(0)}
            </div>
            {!isSidebarCollapsed && (
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-white truncate  tracking-tight">{currentUser.name}</p>
                <p className="text-[11px] text-orange-400 font-semibold  tracking-wide truncate">
                  {currentUser.role}
                </p>
              </div>
            )}
          </div>

          <button
            onClick={() => void handleLogout()}
            title="Cerrar sesion"
            className="w-full flex items-center justify-center gap-2 hover:bg-white/5 hover:text-white transition-colors rounded-lg text-xs font-medium text-slate-400 py-2.5"
          >
            <LogOut size={16} aria-hidden="true" />
            {!isSidebarCollapsed && 'Cerrar sesión'}
          </button>
        </div>

        <div className="hidden border-t border-slate-800 md:block">
          <button
            type="button"
            onClick={() => {
              setIsSidebarCollapsed((prev) => !prev);
              setCollapsedFlyout(null);
              setPinnedFlyoutGroupId(null);
            }}
            className="flex w-full items-center justify-center gap-2 py-3 text-xs text-slate-400 transition hover:bg-white/5 hover:text-white"
            title={isSidebarCollapsed ? 'Expandir menu' : 'Reducir menu'}
          >
            {isSidebarCollapsed ? <PanelLeftOpen size={18} aria-hidden="true" /> : <><PanelLeftClose size={16} aria-hidden="true" /> Contraer menú</>}
          </button>
        </div>
      </aside>

      {isSidebarCollapsed && collapsedFlyout && collapsedFlyoutGroup && (
        <div
          ref={flyoutRef}
          className="fixed z-[80] hidden w-72 overflow-hidden rounded-xl border border-slate-800 bg-slate-950 shadow-2xl md:block"
          style={{ top: collapsedFlyout.top, left: collapsedFlyout.left }}
          onMouseEnter={() => setCollapsedFlyout(collapsedFlyout)}
          onMouseLeave={() => {
            if (pinnedFlyoutGroupId === collapsedFlyout.groupId) return;
            setCollapsedFlyout(null);
          }}
        >
          <div className="border-b border-slate-800 px-4 py-3">
            <p className="text-xs font-semibold  tracking-[0.22em] text-slate-400">
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
        <header className="crm-topbar shrink-0 sticky top-0 z-30 px-4 md:px-7 py-3 border-b border-slate-200 flex flex-row justify-between items-center gap-4">
          <div className="flex min-w-0 items-center gap-2 md:gap-4">
            {/* Hamburger Menu Toggle */}
            <button
              aria-label={isMobileMenuOpen ? 'Cerrar menú' : 'Abrir menú'}
              aria-expanded={isMobileMenuOpen}
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className="md:hidden w-10 h-10 bg-slate-900 text-white rounded-xl flex items-center justify-center shadow-lg"
            >
              {isMobileMenuOpen ? <AppIcon name="close" /> : <AppIcon name="menu" />}
            </button>

            <div className="hidden md:flex w-10 h-10 bg-orange-50 text-orange-700 border border-orange-100 rounded-xl items-center justify-center text-xl">
              {currentItem?.icon || <AppIcon name="building" />}
            </div>
            <div className="hidden md:block min-w-0">
              <h1 className="truncate text-base font-semibold text-slate-900 tracking-tight leading-tight sm:text-lg">
                {currentItem?.label || 'Escritorio'}
              </h1>
              <p className="mt-1 truncate text-xs font-medium text-slate-500">
                {currentGroup?.label || 'General'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 md:gap-4">
            <div className="hidden min-w-0 items-center gap-3 lg:flex">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-600">
                {currentUser.name
                  .split(/\s+/)
                  .filter(Boolean)
                  .slice(0, 2)
                  .map((part) => part.charAt(0))
                  .join('')}
              </div>
              <p className="max-w-[160px] truncate text-xs font-medium text-slate-600">
                {currentUser.name}
              </p>
            </div>
            <div className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 flex items-center gap-3">
              <div className="flex min-w-0 flex-col">
                <span className="text-[10px] font-medium text-slate-500 mb-0.5">Sucursal activa</span>
                <div className="flex min-w-0 items-center gap-1 md:gap-2">
                  <span className="text-sm md:text-lg"><AppIcon name="building" /></span>
                  <select
                    aria-label="Sucursal activa"
                    value={branchSelectorValue}
                    onChange={(e) => {
                      if (isCasaTahonaModule) return;
                      setSelectedBranchId(e.target.value);
                    }}
                    disabled={isCasaTahonaModule}
                    title={isCasaTahonaModule ? 'Casa Tahona usa una sucursal fija' : 'Cambiar ubicacion'}
                    className={`max-w-[150px] bg-transparent font-semibold text-slate-900 outline-none text-xs md:max-w-[180px] md:text-xs tracking-tight ${
                      isCasaTahonaModule ? 'cursor-not-allowed opacity-80' : 'cursor-pointer'
                    }`}
                  >
                    {selectableBranches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                </div>
              </div>
              <div
                className={`p-2 rounded-lg ${isCasaTahonaModule ? 'bg-orange-100 text-orange-700' : 'bg-emerald-50 text-emerald-700'}`}
                title={isCasaTahonaModule ? 'Ubicación fija para Casa Tahona' : 'Ubicación editable'}
              >
                <AppIcon name="globe" />
              </div>
            </div>
          </div>
        </header>

        <div className={`crm-workspace flex-1 min-h-0 ${isFullBleedContent ? 'overflow-hidden p-0' : 'overflow-y-auto p-4 md:p-7'}`}>
          <div className={isFullBleedContent ? 'h-full min-h-0 flex flex-col max-w-none pb-0' : 'max-w-[1600px] mx-auto pb-12'}>
            {/* Título del módulo en móvil (sale del header en pantallas chicas) */}
            <div className={`md:hidden shrink-0 mb-4 flex items-center gap-3 ${isFullBleedContent ? 'px-4 pt-4' : ''}`}>
              <div className="w-9 h-9 bg-orange-50 text-orange-700 border border-orange-100 rounded-lg flex items-center justify-center text-lg shrink-0">
                {currentItem?.icon || <AppIcon name="building" />}
              </div>
              <div className="min-w-0">
                <h1 className="truncate text-lg font-semibold text-slate-900  tracking-tight leading-none">
                  {currentItem?.label || 'Escritorio'}
                </h1>
                <p className="mt-1 truncate text-xs font-bold text-slate-400  tracking-wide">
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
