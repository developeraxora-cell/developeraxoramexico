
import React, { useState } from 'react';
import { User, Role, Branch } from '../types';

interface LayoutProps {
  children: React.ReactNode;
  activeTab: string;
  setActiveTab: (tab: string) => void;
  currentUser: User;
  onLogout: () => void;
  selectedBranchId: string;
  setSelectedBranchId: (id: string) => void;
  branches: Branch[];
  onReset?: () => void;
}

interface NavItem {
  id: string;
  label: string;
  icon: string;
  roles: Role[];
}

interface NavGroup {
  id: string;
  label: string;
  icon: string;
  items: NavItem[];
}

const Layout: React.FC<LayoutProps> = ({
  children, activeTab, setActiveTab, currentUser, onLogout,
  selectedBranchId, setSelectedBranchId, branches, onReset
}) => {
  const [expandedGroups, setExpandedGroups] = useState<string[]>(['materiales', 'concretera', 'logistica']);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const navigation: NavGroup[] = [
    {
      id: 'materiales',
      label: 'Materiales',
      icon: '🏗️',
      items: [
        { id: 'pos', label: 'Caja / Venta', icon: '🛒', roles: [Role.ADMIN, Role.CAJERO, Role.ALMACEN] },
        { id: 'purchases', label: 'Compras / Entradas', icon: '📥', roles: [Role.ADMIN, Role.ALMACEN] },
        { id: 'inventory', label: 'Inventario / Auditoría', icon: '📦', roles: [Role.ADMIN, Role.ALMACEN] },
        { id: 'customers', label: 'Clientes / Crédito', icon: '👥', roles: [Role.ADMIN, Role.ALMACEN, Role.CAJERO] },
        { id: 'reports', label: 'Reportes', icon: '📊', roles: [Role.ADMIN, Role.ALMACEN] },
        { id: 'branches', label: 'Sucursales', icon: '🏢', roles: [Role.ADMIN] },
        { id: 'users', label: 'Personal / Usuarios', icon: '🛡️', roles: [Role.ADMIN] },
      ]
    },
    {
      id: 'concretera',
      label: 'Concretera',
      icon: '🚛',
      items: [
        { id: 'concrete-ops', label: 'Panel de Producción', icon: '🏭', roles: [Role.ADMIN, Role.ALMACEN] },
        { id: 'concrete-fleet', label: 'Control de Ollas', icon: '🚚', roles: [Role.ADMIN, Role.ALMACEN] },
        { id: 'concrete-formulas', label: 'Mezclas y Fórmulas', icon: '🧪', roles: [Role.ADMIN, Role.ALMACEN] },
      ]
    },
    {
      id: 'logistica',
      label: 'Logística',
      icon: '⛽',
      items: [
        { id: 'diesel', label: 'Gestión de Diésel', icon: '🔥', roles: [Role.ADMIN, Role.ALMACEN] },
      ]
    }
  ];

  const toggleGroup = (id: string) => {
    setExpandedGroups(prev =>
      prev.includes(id) ? prev.filter(g => g !== id) : [...prev, id]
    );
  };

  const currentItem = navigation.flatMap(g => g.items).find(i => i.id === activeTab);
  const currentGroup = navigation.find(g => g.items.some(i => i.id === activeTab));

  const isBranchLocked = !!currentUser.branchId && currentUser.role !== Role.ADMIN;
  const activeBranch = branches.find(b => b.id === selectedBranchId);
  const selectableBranches = branches.filter(b => b.isActive !== false);

  return (
    <div className="h-screen w-full flex flex-col md:flex-row bg-slate-50 text-slate-900 overflow-hidden relative">
      {/* Mobile Backdrop */}
      {isMobileMenuOpen && (
        <div
          className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-40 md:hidden"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      <aside className={`
        fixed md:static inset-y-0 left-0 w-72 bg-slate-900 text-white flex flex-col shadow-2xl z-50 
        transition-transform duration-300 ease-in-out
        ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
      `}>
        <div className="p-8 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="bg-orange-600 w-10 h-10 rounded-xl flex items-center justify-center shadow-lg shadow-orange-600/20">
              <span className="text-2xl">⚒️</span>
            </div>
            <div className="flex flex-col">
              <span className="text-xl font-black leading-none tracking-tighter">GRUPO LOPAR</span>
              <span className="text-[9px] text-orange-500 font-bold uppercase tracking-widest mt-1 italic">Industrial OS</span>
            </div>
          </div>
        </div>

        <nav className="flex-1 mt-4 overflow-y-auto no-scrollbar p-3 space-y-4">
          {navigation.map((group) => (
            <div key={group.id} className="space-y-1">
              <button
                onClick={() => toggleGroup(group.id)}
                className="w-full flex items-center justify-between px-4 py-3 text-slate-400 hover:text-white transition-colors group"
              >
                <div className="flex items-center gap-3">
                  <span className="text-xl group-hover:scale-110 transition-transform">{group.icon}</span>
                  <span className="text-xs font-black uppercase tracking-widest">{group.label}</span>
                </div>
                <span className={`text-[10px] transition-transform duration-300 ${expandedGroups.includes(group.id) ? 'rotate-180' : ''}`}>
                  ▼
                </span>
              </button>

              {expandedGroups.includes(group.id) && (
                <div className="space-y-1 ml-2 border-l border-slate-800 pl-2 animate-in slide-in-from-top-2 duration-200">
                  {group.items.filter(item => item.roles.includes(currentUser.role)).map((item) => (
                    <button
                      key={item.id}
                      onClick={() => {
                        setActiveTab(item.id);
                        setIsMobileMenuOpen(false);
                      }}
                      className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm transition-all ${activeTab === item.id
                        ? 'bg-orange-600 text-white font-bold shadow-lg shadow-orange-600/20'
                        : 'text-slate-500 hover:text-slate-200 hover:bg-slate-800/50'
                        }`}
                    >
                      <span className="text-lg">{item.icon}</span>
                      <span className="tracking-tight">{item.label}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </nav>

        <div className="p-6 bg-slate-950 border-t border-slate-800">
          <div className="flex items-center gap-4 mb-6 p-3 bg-slate-900/50 rounded-2xl border border-slate-800">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-orange-400 to-orange-600 flex items-center justify-center font-black text-white">
              {currentUser.name.charAt(0)}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-black text-white truncate uppercase tracking-tighter">{currentUser.name}</p>
              <p className="text-[9px] text-orange-400 font-black uppercase tracking-widest truncate">
                {currentUser.role}
              </p>
            </div>
          </div>

          {currentUser.role === Role.ADMIN && (
            <div className="mb-6 p-4 bg-red-500/5 rounded-2xl border border-red-500/20 space-y-3">
              <p className="text-[8px] font-black text-red-500 uppercase tracking-[0.2em] px-1">Administración de Datos</p>

              <button
                onClick={onReset}
                className="w-full py-3 bg-red-500/20 hover:bg-red-500 text-red-500 hover:text-white transition-all rounded-xl text-[9px] font-black uppercase tracking-widest border border-red-500/30 active:scale-95"
              >
                🗑️ Borrar Historial Local
              </button>

              <button
                onClick={async () => {
                  const confirmReset = window.confirm('⚠️ MANTENIMIENTO: ¿Deseas restablecer los niveles de diésel y borrar el historial?\nEsta acción es irreversible en la base de datos.');
                  if (!confirmReset) return;
                  try {
                    const { supabase: sharedSupabase } = await import('../services/supabaseClient');
                    const supabase = sharedSupabase;

                    // Borrar logs
                    await supabase.from('diesel_logs').delete().not('id', 'is', null);
                    // Reset tanques
                    await supabase.from('diesel_tanks').update({ current_qty: 2500 }).not('id', 'is', null);

                    alert('✅ Logística sincronizada y niveles restablecidos.');
                    window.location.reload();
                  } catch (err: any) {
                    alert('Error: ' + err.message);
                  }
                }}
                className="w-full py-3 bg-slate-800 hover:bg-slate-700 text-white transition-all rounded-xl text-[9px] font-black uppercase tracking-widest shadow-lg shadow-slate-900/20 active:scale-95"
              >
                ⚙️ Reset Administrativo (Nube)
              </button>
            </div>
          )}

          <button
            onClick={onLogout}
            className="w-full py-4 bg-slate-800 hover:bg-red-500/10 hover:text-red-500 transition-all rounded-2xl text-[10px] font-black uppercase tracking-widest text-slate-500 border border-transparent hover:border-red-500/20"
          >
            Cerrar Sesión
          </button>
        </div>
      </aside>

      <main className="flex-1 flex flex-col min-w-0 bg-slate-50 h-full overflow-hidden">
        <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-md px-4 md:px-8 py-3 md:py-5 border-b border-slate-200 flex flex-row justify-between items-center gap-4 shadow-sm shadow-slate-200/50">
          <div className="flex items-center gap-2 md:gap-4">
            {/* Hamburger Menu Toggle */}
            <button
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className="md:hidden w-10 h-10 bg-slate-900 text-white rounded-xl flex items-center justify-center shadow-lg"
            >
              {isMobileMenuOpen ? '✕' : '☰'}
            </button>

            <div className="w-8 h-8 md:w-10 md:h-10 bg-slate-900 rounded-lg md:rounded-xl flex items-center justify-center text-lg md:text-xl shadow-lg">
              {currentItem?.icon || '🏢'}
            </div>
            <div>
              <h1 className="text-xl font-black text-slate-900 uppercase tracking-tighter leading-none">
                {currentItem?.label || 'Escritorio'}
              </h1>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">
                {currentGroup?.label || 'General'}
              </p>
            </div>
          </div>

          <div className={`flex items-center gap-4 ${isBranchLocked ? 'cursor-not-allowed' : ''}`}>
            <div className={`bg-white border-2 rounded-2xl px-5 py-2.5 flex items-center gap-3 shadow-sm transition-all ${isBranchLocked ? 'border-slate-100' : 'border-orange-500 shadow-orange-500/10'}`}>
              <div className="flex flex-col">
                <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-0.5">Ubicación Activa</span>
                <div className="flex items-center gap-1 md:gap-2">
                  <span className="text-sm md:text-lg">🏢</span>
                  <select
                    disabled={isBranchLocked}
                    value={selectedBranchId}
                    onChange={(e) => setSelectedBranchId(e.target.value)}
                    className="bg-transparent font-black text-slate-900 outline-none text-[10px] md:text-xs uppercase tracking-tight cursor-pointer max-w-[100px] md:max-w-none"
                  >
                    {selectableBranches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                </div>
              </div>
              {isBranchLocked ? (
                <div className="bg-slate-100 p-2 rounded-lg text-slate-400" title="Ubicación bloqueada por perfil">🔒</div>
              ) : (
                <div className="bg-green-100 p-2 rounded-lg text-green-600 animate-pulse" title="Ubicación editable (Modo Admin)">🌐</div>
              )}
            </div>

            <div className="hidden lg:flex flex-col items-end">
              <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Sucursal</span>
              <span className="text-sm font-black text-orange-600 uppercase tracking-tighter">{activeBranch?.name}</span>
            </div>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-4 md:p-8">
          <div className="max-w-[1600px] mx-auto pb-32">
            {children}
          </div>
        </div>
      </main>
    </div>
  );
};

export default Layout;
