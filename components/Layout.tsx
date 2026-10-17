import AppIcon from './common/AppIcon';

import React, { useEffect, useState } from 'react';
import { Blocks, ChevronDown, ChevronRight, LogOut, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
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

const normalizeBranchText = (value?: string | null) =>
  String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase();

const Layout: React.FC<LayoutProps> = ({
  children, activeTab, setActiveTab, currentUser, onLogout,
  selectedBranchId, setSelectedBranchId, branches, onReset
}) => {
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isAssistantOpen, setIsAssistantOpen] = useState(false);
  const [assistantPrompt, setAssistantPrompt] = useState('');
  const [assistantAgent, setAssistantAgent] = useState<AssistantAgent | undefined>(undefined);
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

  // Navigation selection is presentation state; routes and access rules stay authoritative.
  useEffect(() => {
    setWorkspaceId(null);
  }, [activeTab, currentUser?.id]);

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
  const workspace = visibleNavigation.find((group) => group.id === workspaceId)
    ?? currentGroup ?? visibleNavigation[0];
  const workspaceItems = workspace?.items.flatMap((item) => item.children ?? [item]) ?? [];

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

  return (
    <div className="crm-shell flex w-full overflow-hidden">
      <a href="#crm-content" className="crm-skip-link">Ir al contenido</a>
      {isMobileMenuOpen && (
        <div className="fixed inset-0 z-40 bg-slate-950/30 backdrop-blur-sm md:hidden" onClick={() => setIsMobileMenuOpen(false)} />
      )}
      <aside className={`crm-sidebar fixed inset-y-0 left-0 z-50 flex shrink-0 flex-col md:static ${isMobileMenuOpen ? 'crm-sidebar-open translate-x-0' : '-translate-x-full md:translate-x-0'} ${isSidebarCollapsed ? 'crm-sidebar-compact' : ''}`}>
        <div className="crm-brand">
          <span className="crm-brand-mark"><Blocks size={22} aria-hidden="true" /></span>
          {!isSidebarCollapsed && <div className="min-w-0"><p className="crm-brand-name">Lopar</p><p className="crm-brand-caption">Gestión empresarial</p></div>}
          <button className="crm-icon-button ml-auto md:hidden" aria-label="Cerrar menú" onClick={() => setIsMobileMenuOpen(false)}><AppIcon name="close" /></button>
        </div>

        <div className="crm-workspace-picker">
          {!isSidebarCollapsed && <label htmlFor="crm-workspace-select" className="crm-eyebrow">Unidad de negocio</label>}
          <div className="crm-workspace-select">
            <span className="crm-workspace-symbol">{workspace?.icon ?? <AppIcon name="building" />}</span>
            <select id="crm-workspace-select" aria-label="Unidad de negocio" title={workspace?.label} value={workspace?.id ?? ''} onChange={(event) => setWorkspaceId(event.target.value)}>
              {visibleNavigation.map((group) => <option key={group.id} value={group.id}>{group.label}</option>)}
            </select>
            {!isSidebarCollapsed && <ChevronDown size={14} aria-hidden="true" className="pointer-events-none" />}
          </div>
        </div>

        <nav className="crm-navigation" aria-label={`Navegación de ${workspace?.label ?? 'módulos'}`}>
          {!isSidebarCollapsed && <p className="crm-eyebrow px-3 pb-2">Navegación</p>}
          {workspaceItems.map((item) => (
            <button key={item.id} title={item.label} aria-label={item.label} aria-current={activeTab === item.id ? 'page' : undefined}
              onClick={() => { setActiveTab(item.id); setIsMobileMenuOpen(false); }}
              className="crm-nav-item">
              <span className="crm-nav-icon">{item.icon}</span>
              {!isSidebarCollapsed && <><span className="flex-1 text-left">{item.label}</span>{activeTab === item.id && <span className="crm-active-dot" />}</>}
            </button>
          ))}
        </nav>

        <div className="crm-sidebar-footer">
          <div className="crm-profile">
            <span className="crm-avatar">{currentUser.name.charAt(0)}</span>
            {!isSidebarCollapsed && <div className="min-w-0 flex-1"><p className="truncate text-xs font-semibold text-slate-800">{currentUser.name}</p><p className="mt-0.5 truncate text-[11px] text-slate-500">{currentUser.role}</p></div>}
            {!isSidebarCollapsed && <button onClick={() => void handleLogout()} title="Cerrar sesión" aria-label="Cerrar sesión" className="crm-icon-button"><LogOut size={16} aria-hidden="true" /></button>}
          </div>
          {isSidebarCollapsed && <button onClick={() => void handleLogout()} title="Cerrar sesión" aria-label="Cerrar sesión" className="crm-icon-button mx-auto"><LogOut size={16} aria-hidden="true" /></button>}
          <button type="button" className="crm-collapse hidden md:flex" title={isSidebarCollapsed ? 'Expandir menú' : 'Contraer menú'} aria-label={isSidebarCollapsed ? 'Expandir menú' : 'Contraer menú'} onClick={() => setIsSidebarCollapsed((previous) => !previous)}>
            {isSidebarCollapsed ? <PanelLeftOpen size={16} aria-hidden="true" /> : <><PanelLeftClose size={16} aria-hidden="true" /><span>Contraer menú</span></>}
          </button>
        </div>
      </aside>

      <main className="crm-main flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className="crm-topbar flex shrink-0 items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <button className="crm-icon-button md:hidden" aria-label="Abrir menú" aria-expanded={isMobileMenuOpen} onClick={() => { setIsSidebarCollapsed(false); setIsMobileMenuOpen(!isMobileMenuOpen); }}><AppIcon name="menu" /></button>
            <span className="hidden text-slate-500 md:inline-flex">{currentGroup?.icon}</span>
            <span className="hidden text-xs text-slate-500 sm:block">{currentGroup?.label ?? 'General'}</span>
            <ChevronRight size={13} aria-hidden="true" className="hidden text-slate-400 sm:block" />
            <h1 className="truncate text-sm font-medium text-slate-800">{currentItem?.label ?? 'Escritorio'}</h1>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            <div className="crm-branch-select">
              <AppIcon name="building" />
              <select aria-label="Sucursal activa" value={branchSelectorValue} onChange={(event) => { if (isCasaTahonaModule) return; setSelectedBranchId(event.target.value); }}
                disabled={isCasaTahonaModule} title={isCasaTahonaModule ? 'Casa Tahona usa una sucursal fija' : 'Cambiar ubicación'}>
                {selectableBranches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
              </select>
            </div>
            <span className="crm-avatar hidden sm:flex" title={currentUser.name}>{currentUser.name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part.charAt(0)).join('')}</span>
          </div>
        </header>
        <div id="crm-content" tabIndex={-1} className={`crm-workspace min-h-0 flex-1 ${isFullBleedContent ? 'overflow-hidden' : 'overflow-y-auto'}`}>
          <div className={isFullBleedContent ? 'h-full min-h-0 flex flex-col' : 'crm-page-content'}>
            {children}
          </div>
        </div>
      </main>

      {canUseAssistant && <AssistantDrawer isOpen={isAssistantOpen} onClose={() => setIsAssistantOpen(false)}
        branchName={activeBranch?.name} userName={currentUser?.name?.split(' ')[0]} userId={currentUser?.id}
        businessUnit={assistantBusinessUnit} branchId={selectedBranchId} initialPrompt={assistantPrompt} agent={assistantAgent} />}
    </div>
  );
};

export default Layout;
