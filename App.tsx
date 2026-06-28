
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import Layout from './components/Layout';
import LoginScreen from './components/Auth/LoginScreen';
import POSScreen from './components/POS/POSScreen';
import InventoryScreen from './components/Inventory/InventoryScreen';
import PhysicalInventoryScreen from './components/Inventory/PhysicalInventoryScreen';
import ProductionScreen from './components/Production/ProductionScreen';
import PurchasesScreen from './components/Inventory/PurchasesScreen';
import DieselScreen from './components/Diesel/DieselScreen';
import CustomerScreen from './components/Customers/CustomerScreen';
import UsersScreen from './components/Users/UsersScreen';
import BranchesScreen from './components/Branches/BranchesScreen';
import ReportsScreen from './components/Reports/ReportsScreen';
import AuditScreen from './components/Audit/AuditScreen';
import ConcretePOSScreen from './components/Concrete/ConcretePOSScreen';
import ConcretePurchasesScreen from './components/Concrete/ConcretePurchasesScreen';
import ConcreteInventoryScreen from './components/Concrete/ConcreteInventoryScreen';
import ConcreteCustomersScreen from './components/Concrete/ConcreteCustomersScreen';
import ConcreteReportsScreen from './components/Concrete/ConcreteReportsScreen';
import CreditAlertsScreen from './components/CreditAlerts/CreditAlertsScreen';
import VinosCustomersScreen from './components/Vinos/VinosCustomersScreen';
import VinosProductsScreen from './components/Vinos/VinosProductsScreen';
import VinosPOSScreen from './components/Vinos/VinosPOSScreen';
import VinosPurchasesScreen from './components/Vinos/VinosPurchasesScreen';
import VinosAuditScreen from './components/Vinos/VinosAuditScreen';
import VinosReportsScreen from './components/Vinos/VinosReportsScreen';
import VinosCampaignsScreen from './components/Vinos/VinosCampaignsScreen';
import ExecutiveDashboardScreen from './components/Executive/ExecutiveDashboardScreen';
import {
  dieselTanksService,
  vehiclesService,
  driversService,
  dieselLogsService,
  subscriptions,
  productsService,
  customersService,
  salesService,
  isSupabaseConfigured,
  branchesService
} from './services/supabaseClient';
import { INITIAL_CUSTOMERS, INITIAL_PRODUCTS, INITIAL_CONVERSIONS } from './constants';
import { Customer, Product, ProductConversion, User, Role, Branch, CustomerPayment, DieselTank, Vehicle, Driver, DieselLog, Sale } from './types';
import { authService } from './services/auth/auth.service';
import { firstAccessibleTab, isFullAccessRole, userCanAccessBranch, userCanAccessTab } from './services/auth/permissions';
import { tabToPath, pathToTab } from './services/auth/routes';
const SESSION_TOKEN_KEY = 'lopar_session_token';

const APP_TAB_ORDER = [
  'executive-dashboard',
  'pos',
  'purchases',
  'inventory',
  'physical-inventory',
  'customers',
  'customer-alerts',
  'reports',
  'audit-internal',
  'production',
  'branches',
  'users',
  'concrete-pos',
  'concrete-purchases',
  'concrete-inventory',
  'concrete-customers',
  'concrete-customer-alerts',
  'concrete-reports',
  'concrete-audit',
  'diesel',
  'transport-pos',
  'transport-purchases',
  'transport-inventory',
  'transport-customers',
  'transport-customer-alerts',
  'transport-audit',
  'transport-reports',
  'vinos-pos',
  'vinos-purchases',
  'vinos-inventory',
  'vinos-customers',
  'vinos-reports',
  'vinos-campaigns',
  'vinos-audit',
];

const PlaceholderModule: React.FC<{ title: string; subtitle: string }> = ({ title, subtitle }) => (
  <div className="space-y-6">
    <div className="rounded-[32px] border border-dashed border-slate-300 bg-white p-10 text-center shadow-sm">
      <p className="text-sm font-black uppercase tracking-[0.26em] text-slate-400">Modulo visible</p>
      <p className="mt-4 text-2xl font-black tracking-tighter text-slate-900">Produccion disponible</p>
      <p className="mt-2 text-sm font-semibold text-slate-500">
        Este submodulo queda visible por ahora, sin funcionalidades cargadas todavia.
      </p>
    </div>
  </div>
);

const AppLoading: React.FC<{ message?: string }> = ({ message = 'Cargando...' }) => (
  <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-slate-50">
    <div className="relative h-16 w-16">
      <div className="absolute inset-0 rounded-full border-4 border-orange-100" />
      <div className="absolute inset-0 animate-spin rounded-full border-4 border-transparent border-t-orange-500" />
      <div className="absolute inset-2 rounded-full bg-orange-50" />
    </div>
    <div className="text-center">
      <p className="text-[11px] font-black uppercase tracking-[0.32em] text-orange-500">GRUPO LOPAR</p>
      <p className="mt-2 text-sm font-bold text-slate-500">{message}</p>
    </div>
  </div>
);

const AccessDenied: React.FC = () => (
  <div className="rounded-[28px] border border-slate-200 bg-white p-10 text-center shadow-sm">
    <p className="text-[11px] font-black uppercase tracking-[0.24em] text-red-400">Acceso denegado</p>
    <h2 className="mt-3 text-2xl font-black tracking-tight text-slate-900">No tienes permisos para acceder a este modulo.</h2>
  </div>
);

const App: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const activeTab = pathToTab(location.pathname);
  const setActiveTab = useCallback((tabId: string) => {
    navigate(tabToPath(tabId));
  }, [navigate]);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(isSupabaseConfigured);
  const [globalLoading, setGlobalLoading] = useState(isSupabaseConfigured);
  const [authError, setAuthError] = useState<string | null>(null);
  const [sessionExpiredMessage, setSessionExpiredMessage] = useState<string | null>(null);
  const [sessionExpiresAt, setSessionExpiresAt] = useState<number | null>(null);
  const [branches, setBranches] = useState<Branch[]>([]);
  const branchPreselectedForUserRef = useRef<string | null>(null);
  const [selectedBranchId, setSelectedBranchId] = useState<string>(() => {
    return localStorage.getItem('lopar_selected_branch') || '';
  });

  // Persistir selección de sucursal
  useEffect(() => {
    localStorage.setItem('lopar_selected_branch', selectedBranchId);
  }, [selectedBranchId]);

  const [customers, setCustomers] = useState<Customer[]>(INITIAL_CUSTOMERS);
  const [products, setProducts] = useState<Product[]>(INITIAL_PRODUCTS);
  const [conversions, setConversions] = useState<ProductConversion[]>(INITIAL_CONVERSIONS);
  const [payments, setPayments] = useState<CustomerPayment[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);

  // Estados de Diesel
  const [tanks, setTanks] = useState<DieselTank[]>([
    { id: 't1', branchId: 'B1', name: 'Tanque Matriz', currentQty: 0, maxCapacity: 5000 },
    { id: 't2', branchId: 'B2', name: 'Almacén Norte Dsl', currentQty: 0, maxCapacity: 2000 }
  ]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([
    { id: 'v1', plate: 'MX-4455', description: 'Torton Kenworth #1', active: true },
    { id: 'v2', plate: 'MX-9900', description: 'Plataforma Isuzu #2', active: true }
  ]);
  const [drivers, setDrivers] = useState<Driver[]>([
    { id: 'd1', name: 'Pedro Sánchez', license: 'FED-10029', active: true },
    { id: 'd2', name: 'Arturo Méndez', license: 'EST-99882', active: true }
  ]);
  const [dieselLogs, setDieselLogs] = useState<DieselLog[]>([]);

  const loadSessionUser = useCallback(async (sessionToken?: string | null) => {
    if (!sessionToken) {
      setCurrentUser(null);
      setSessionExpiresAt(null);
      setAuthLoading(false);
      return;
    }

    try {
      const user = await authService.getCurrentUser(sessionToken);
      const startedAt = Number(localStorage.getItem('lopar_session_started_at')) || Date.now();
      localStorage.setItem('lopar_session_started_at', String(startedAt));
      const profileExpiresAt = startedAt + Math.max(1, user.sessionMinutes ?? 480) * 60 * 1000;

      setCurrentUser(user);
      setSessionExpiresAt(profileExpiresAt);
      setAuthError(null);
    } catch (err) {
      setCurrentUser(null);
      setSessionExpiresAt(null);
      setAuthError(err instanceof Error ? err.message : 'No se pudo validar la sesion.');
      await authService.signOut();
    } finally {
      setAuthLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setAuthLoading(false);
      return;
    }

    void loadSessionUser(localStorage.getItem(SESSION_TOKEN_KEY));

    return () => {
      return;
    };
  }, [loadSessionUser]);

  useEffect(() => {
    const handleSessionRefresh = () => {
      void loadSessionUser(localStorage.getItem(SESSION_TOKEN_KEY));
    };

    window.addEventListener('lopar:session-refresh', handleSessionRefresh as EventListener);
    return () => window.removeEventListener('lopar:session-refresh', handleSessionRefresh as EventListener);
  }, [loadSessionUser]);

  useEffect(() => {
    if (!currentUser || !sessionExpiresAt) return;

    const remaining = sessionExpiresAt - Date.now();
    const expire = () => {
      setSessionExpiredMessage('Tu sesion ha expirado. Por favor, inicia sesion nuevamente.');
      void authService.signOut(localStorage.getItem(SESSION_TOKEN_KEY));
    };

    if (remaining <= 0) {
      expire();
      return;
    }

    const timeout = window.setTimeout(expire, remaining);
    return () => window.clearTimeout(timeout);
  }, [currentUser, sessionExpiresAt]);

  // CARGA INICIAL Y SUBSCRIPCIONES REALTIME
  useEffect(() => {
    if (!isSupabaseConfigured || !currentUser) return;

    setGlobalLoading(true);
    loadGlobalData();

    // Suscripciones para sincronización entre dispositivos
    const salesSub = subscriptions.subscribeAll('sales', () => loadGlobalData());
    const stockSub = subscriptions.subscribeAll('product_stocks', () => loadGlobalData());
    const customerSub = subscriptions.subscribeAll('customers', () => loadGlobalData());

    // Suscripciones de Logística Diesel
    const tanksSub = subscriptions.subscribeAll('diesel_tanks', () => loadGlobalData());
    const logsSub = subscriptions.subscribeAll('diesel_logs', () => loadGlobalData());
    const vehicleSub = subscriptions.subscribeAll('vehicles', () => loadGlobalData());
    const driverSub = subscriptions.subscribeAll('drivers', () => loadGlobalData());
    const branchesSub = subscriptions.subscribeAll('branches', () => loadGlobalData());

    return () => {
      salesSub.unsubscribe();
      stockSub.unsubscribe();
      customerSub.unsubscribe();
      tanksSub.unsubscribe();
      logsSub.unsubscribe();
      vehicleSub.unsubscribe();
      driverSub.unsubscribe();
      branchesSub.unsubscribe();
    };
  }, [currentUser?.id]);

  const resolveSelectedBranchId = (nextBranches: Branch[], current: string) => {
    const activeMatch = nextBranches.find(b => b.id === current && b.isActive !== false);
    if (activeMatch) return current;
    const firstActive = nextBranches.find(b => b.isActive !== false);
    return firstActive?.id || nextBranches[0]?.id || '';
  };

  const loadGlobalData = async () => {
    try {
      const results = await Promise.allSettled([
        productsService.getAll(),
        customersService.getAll(),
        salesService.getAll(),
        dieselTanksService.getAll(),
        vehiclesService.getAll(),
        driversService.getAll(),
        dieselLogsService.getAll(100),
        branchesService.getAll()
      ]);
      const [
        prodsRes,
        custsRes,
        slsRes,
        tanksRes,
        vehRes,
        drivRes,
        logsRes,
        branchesRes
      ] = results;

      const prods = prodsRes.status === 'fulfilled' ? prodsRes.value : null;
      const custs = custsRes.status === 'fulfilled' ? custsRes.value : null;
      const sls = slsRes.status === 'fulfilled' ? slsRes.value : null;
      const tanksData = tanksRes.status === 'fulfilled' ? tanksRes.value : null;
      const vehData = vehRes.status === 'fulfilled' ? vehRes.value : null;
      const drivData = drivRes.status === 'fulfilled' ? drivRes.value : null;
      const logsData = logsRes.status === 'fulfilled' ? logsRes.value : null;
      const branchesData = branchesRes.status === 'fulfilled' ? branchesRes.value : null;

      if (prods) {
        setProducts(prods.map((p: any) => ({
          ...p,
          stocks: p.product_stocks.map((s: any) => ({ branchId: String(s.branch_id), qty: Number(s.qty) }))
        })));
      }
      if (custs) setCustomers(custs.map((c: any) => ({
        ...c,
        phone: c.phone ?? '',
        address: c.address ?? '',
        status: c.status ?? 'ACTIVO',
        creditLimit: Number(c.credit_limit ?? 0),
        currentDebt: Number(c.current_debt ?? 0),
      })));
      if (sls) setSales(sls.map((s: any) => ({ ...s, date: new Date(s.date) })));

      if (tanksData) {
        setTanks(tanksData.map((t: any) => ({
          id: t.id,
          branchId: t.branch_id,
          name: t.name,
          currentQty: Number(t.current_qty),
          maxCapacity: Number(t.max_capacity)
        })));
      }
      if (vehData) {
        setVehicles(vehData.map((v: any) => ({
          id: v.id,
          plate: v.plate,
          description: v.description,
          active: v.active
        })));
      }
      if (drivData) {
        setDrivers(drivData.map((d: any) => ({
          id: d.id,
          name: d.name,
          license: d.license,
          active: d.active
        })));
      }
      if (logsData) {
        setDieselLogs(logsData.map((l: any) => ({
          id: l.id,
          type: l.type,
          tankId: l.tank_id,
          amount: Number(l.amount),
          vehicleId: l.vehicle_id || undefined,
          driverId: l.driver_id || undefined,
          odometerReading: l.odometer_reading || undefined,
          createdAt: new Date(l.created_at)
        })));
      }
      if (branchesData) {
        const mappedBranches = branchesData.map((b: any) => ({
            id: b.code,
            code: b.code,
            dbId: Number(b.id),
            name: b.name,
            address: b.address,
            isActive: b.is_active,
            createdAt: b.created_at,
            businessUnit: b.business_unit ?? 'materiales',
        })) as Branch[];
        setBranches(mappedBranches);
        const nextSelected = resolveSelectedBranchId(mappedBranches, selectedBranchId);
        if (nextSelected && nextSelected !== selectedBranchId) {
          setSelectedBranchId(nextSelected);
        }
      }
    } catch (err) {
      console.error("Error syncing data:", err);
    } finally {
      setGlobalLoading(false);
    }
  };

  const handleGlobalReset = async () => {
    const confirm = window.confirm('⚠️ ¿ESTÁS SEGURO? Se borrará todo el historial local y de nube. Esta acción es irreversible.');
    if (confirm) {
      // Aquí se llamaría a una función RPC de Supabase para truncar tablas si fuera necesario
      localStorage.clear();
      window.location.reload();
    }
  };

  const handleLogin = async (identifier: string, password: string) => {
    setAuthError(null);
    setSessionExpiredMessage(null);
    localStorage.setItem('lopar_session_started_at', String(Date.now()));
    const session = await authService.signIn(identifier, password);
    await loadSessionUser(session.session_token);
  };

  const handleLogout = async () => {
    localStorage.removeItem('lopar_session_started_at');
    await authService.signOut(localStorage.getItem(SESSION_TOKEN_KEY));
    setCurrentUser(null);
    navigate('/', { replace: true });
  };

  const activeBranches = useMemo(() => {
    const enabled = branches.filter(b => b.isActive !== false);
    if (!currentUser) return enabled;

    if (isFullAccessRole(currentUser.role)) return enabled;
    const visibleBranches = enabled.filter((branch) => userCanAccessBranch(currentUser, branch));
    return visibleBranches.length > 0 ? visibleBranches : enabled.filter((branch) => currentUser.branchId ? branch.id === currentUser.branchId : false);
  }, [branches, currentUser]);

  useEffect(() => {
    if (!currentUser) return;
    if (!activeTab || !userCanAccessTab(currentUser, activeTab)) {
      const firstTab = firstAccessibleTab(currentUser, APP_TAB_ORDER);
      if (firstTab) navigate(tabToPath(firstTab), { replace: true });
    }
  }, [currentUser?.id, activeTab, navigate]);

  useEffect(() => {
    if (!currentUser || activeBranches.length === 0) return;
    if (
      currentUser.branchId
      && branchPreselectedForUserRef.current !== currentUser.id
      && activeBranches.some((branch) => branch.id === currentUser.branchId)
    ) {
      branchPreselectedForUserRef.current = currentUser.id;
      setSelectedBranchId(currentUser.branchId);
      return;
    }

    const selectedIsAllowed = activeBranches.some((branch) => branch.id === selectedBranchId);
    if (selectedIsAllowed) return;

    const preferred = currentUser.branchId && activeBranches.some((branch) => branch.id === currentUser.branchId)
      ? currentUser.branchId
      : activeBranches[0].id;
    setSelectedBranchId(preferred);
  }, [activeBranches, currentUser, selectedBranchId]);

  if (authLoading) {
    return <AppLoading message="Cargando informacion..." />;
  }

  if (!currentUser) {
    return (
      <LoginScreen
        isSupabaseConfigured={isSupabaseConfigured}
        error={authError}
        expiredMessage={sessionExpiredMessage}
        onLogin={handleLogin}
      />
    );
  }

  if (globalLoading) {
    return <AppLoading message="Cargando informacion..." />;
  }

  const renderContent = () => {
    if (!userCanAccessTab(currentUser, activeTab)) {
      return <AccessDenied />;
    }

    switch (activeTab) {
      case 'executive-dashboard':
        return <ExecutiveDashboardScreen selectedBranchId={selectedBranchId} branches={activeBranches} />;
      case 'pos':
        return <POSScreen key="pos-materiales" products={products} conversions={conversions} selectedBranchId={selectedBranchId} branches={activeBranches} currentUser={currentUser} />;
      case 'purchases':
        return <PurchasesScreen key="purchases-materiales" selectedBranchId={selectedBranchId} currentUser={currentUser} branches={activeBranches} />;
      case 'customers':
        return <CustomerScreen key="customers-materiales" selectedBranchId={selectedBranchId} branches={activeBranches} currentUser={currentUser} />;
      case 'customer-alerts':
        return (
          <CreditAlertsScreen
            key="alerts-materiales"
            selectedBranchId={selectedBranchId}
            branches={activeBranches}
            currentUser={currentUser}
            module="materiales"
          />
        );
      case 'inventory':
        return <InventoryScreen key="inventory-materiales" selectedBranchId={selectedBranchId} currentUser={currentUser} branches={activeBranches} />;
      case 'physical-inventory':
        return <PhysicalInventoryScreen key="physical-inventory-materiales" selectedBranchId={selectedBranchId} currentUser={currentUser} branches={activeBranches} />;
      case 'audit':
      case 'audit-internal':
        return (
          <AuditScreen
            key="audit-materiales"
            selectedBranchId={selectedBranchId}
            branches={activeBranches}
            currentUser={currentUser}
            title=""
            subtitle=""
          />
        );
      case 'production':
        return <ProductionScreen key="production-materiales" selectedBranchId={selectedBranchId} currentUser={currentUser} branches={activeBranches} />;
      case 'concrete-audit':
      case 'concrete-audit-internal':
        return (
          <AuditScreen
            key="audit-concretera"
            selectedBranchId={selectedBranchId}
            branches={activeBranches}
            currentUser={currentUser}
            module="concretera"
            title=""
            subtitle=""
          />
        );
      case 'concrete-production':
        return <PlaceholderModule title="Produccion" subtitle="Concretera" />;
      case 'branches':
        return <BranchesScreen branches={activeBranches} setBranches={setBranches} selectedBranchId={selectedBranchId} setSelectedBranchId={setSelectedBranchId} currentUser={currentUser} />;
      case 'users':
        return <UsersScreen branches={activeBranches} />;
      case 'concrete-pos':
        return <ConcretePOSScreen products={products} conversions={conversions} selectedBranchId={selectedBranchId} branches={activeBranches} currentUser={currentUser} />;
      case 'concrete-purchases':
        return <ConcretePurchasesScreen selectedBranchId={selectedBranchId} currentUser={currentUser} branches={activeBranches} />;
      case 'concrete-customers':
        return <ConcreteCustomersScreen selectedBranchId={selectedBranchId} branches={activeBranches} currentUser={currentUser} />;
      case 'concrete-customer-alerts':
        return (
          <CreditAlertsScreen
            selectedBranchId={selectedBranchId}
            branches={activeBranches}
            currentUser={currentUser}
            module="concretera"
          />
        );
      case 'concrete-inventory':
        return <ConcreteInventoryScreen selectedBranchId={selectedBranchId} currentUser={currentUser} branches={activeBranches} />;
      case 'concrete-reports':
        return <ConcreteReportsScreen selectedBranchId={selectedBranchId} branches={activeBranches} />;
      case 'diesel':
        return <DieselScreen tanks={tanks} setTanks={setTanks} vehicles={vehicles} setVehicles={setVehicles} drivers={drivers} setDrivers={setDrivers} logs={dieselLogs} setLogs={setDieselLogs} currentUser={currentUser} selectedBranchId={selectedBranchId} branches={activeBranches} />;
      case 'reports':
        return <ReportsScreen key="reports-materiales" selectedBranchId={selectedBranchId} branches={activeBranches} businessUnit="materiales" />;
      case 'transport-pos':
        return <POSScreen key="pos-transporteria" products={products} conversions={conversions} selectedBranchId={selectedBranchId} branches={activeBranches} currentUser={currentUser} businessUnit="transporteria" />;
      case 'transport-purchases':
        return <PurchasesScreen key="purchases-transporteria" selectedBranchId={selectedBranchId} currentUser={currentUser} branches={activeBranches} businessUnit="transporteria" />;
      case 'transport-inventory':
        return <InventoryScreen key="inventory-transporteria" selectedBranchId={selectedBranchId} currentUser={currentUser} branches={activeBranches} businessUnit="transporteria" />;
      case 'transport-customers':
        return <CustomerScreen key="customers-transporteria" selectedBranchId={selectedBranchId} branches={activeBranches} currentUser={currentUser} businessUnit="transporteria" />;
      case 'transport-customer-alerts':
        return (
          <CreditAlertsScreen
            key="alerts-transporteria"
            selectedBranchId={selectedBranchId}
            branches={activeBranches}
            currentUser={currentUser}
            module="transporteria"
          />
        );
      case 'transport-audit':
        return (
          <AuditScreen
            key="audit-transporteria"
            selectedBranchId={selectedBranchId}
            branches={activeBranches}
            currentUser={currentUser}
            module="transporteria"
            title=""
            subtitle=""
          />
        );
      case 'transport-reports':
        return <ReportsScreen key="reports-transporteria" selectedBranchId={selectedBranchId} branches={activeBranches} businessUnit="transporteria" />;
      case 'vinos-customers':
        return <VinosCustomersScreen key="customers-vinos" selectedBranchId={selectedBranchId} branches={activeBranches} currentUser={currentUser} />;
      case 'vinos-inventory':
        return <VinosProductsScreen key="inventory-vinos" selectedBranchId={selectedBranchId} branches={activeBranches} currentUser={currentUser} />;
      case 'vinos-pos':
        return <VinosPOSScreen key="pos-vinos" selectedBranchId={selectedBranchId} branches={activeBranches} currentUser={currentUser} />;
      case 'vinos-purchases':
        return <VinosPurchasesScreen key="purchases-vinos" selectedBranchId={selectedBranchId} branches={activeBranches} currentUser={currentUser} />;
      case 'vinos-audit':
        return <VinosAuditScreen key="audit-vinos" selectedBranchId={selectedBranchId} branches={activeBranches} currentUser={currentUser} />;
      case 'vinos-reports':
        return <VinosReportsScreen key="reports-vinos" selectedBranchId={selectedBranchId} branches={activeBranches} currentUser={currentUser} />;
      case 'vinos-campaigns':
        return <VinosCampaignsScreen key="campaigns-vinos" selectedBranchId={selectedBranchId} branches={activeBranches} currentUser={currentUser} />;
      default:
        return <AccessDenied />;
    }
  };

  return (
    <Layout activeTab={activeTab} setActiveTab={setActiveTab} currentUser={currentUser} selectedBranchId={selectedBranchId} setSelectedBranchId={setSelectedBranchId} branches={activeBranches} onLogout={handleLogout} onReset={handleGlobalReset}>
      {renderContent()}
    </Layout>
  );
};

export default App;
