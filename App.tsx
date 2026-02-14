
import React, { useState, useEffect } from 'react';
import Layout from './components/Layout';
import POSScreen from './components/POS/POSScreen';
import InventoryScreen from './components/Inventory/InventoryScreen';
import PurchasesScreen from './components/Inventory/PurchasesScreen';
import DieselScreen from './components/Diesel/DieselScreen';
import CustomerScreen from './components/Customers/CustomerScreen';
import UsersScreen from './components/Users/UsersScreen';
import BranchesScreen from './components/Branches/BranchesScreen';
import ReportsScreen from './components/Reports/ReportsScreen';
import ConcretePOSScreen from './components/Concrete/ConcretePOSScreen';
import ConcretePurchasesScreen from './components/Concrete/ConcretePurchasesScreen';
import ConcreteInventoryScreen from './components/Concrete/ConcreteInventoryScreen';
import ConcreteCustomersScreen from './components/Concrete/ConcreteCustomersScreen';
import ConcreteReportsScreen from './components/Concrete/ConcreteReportsScreen';
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
import { INITIAL_CUSTOMERS, INITIAL_PRODUCTS, INITIAL_CONVERSIONS, INITIAL_USERS } from './constants';
import { Customer, Product, ProductConversion, User, Role, Branch, CustomerPayment, DieselTank, Vehicle, Driver, DieselLog, Sale } from './types';

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState('pos');
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [selectedBranchId, setSelectedBranchId] = useState<string>(() => {
    return localStorage.getItem('lopar_selected_branch') || '';
  });

  // Persistir selección de sucursal
  useEffect(() => {
    localStorage.setItem('lopar_selected_branch', selectedBranchId);
  }, [selectedBranchId]);

  const [users, setUsers] = useState<User[]>(INITIAL_USERS);
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

  // CARGA INICIAL Y SUBSCRIPCIONES REALTIME
  useEffect(() => {
    if (!isSupabaseConfigured) return;

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
  }, []);

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
            createdAt: b.created_at
        })) as Branch[];
        setBranches(mappedBranches);
        const nextSelected = resolveSelectedBranchId(mappedBranches, selectedBranchId);
        if (nextSelected && nextSelected !== selectedBranchId) {
          setSelectedBranchId(nextSelected);
        }
      }
    } catch (err) {
      console.error("Error syncing data:", err);
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

  const handleLogin = (username: string) => {
    const user = users.find(u => u.username === username);
    if (user) {
      setCurrentUser(user);
      if (user.branchId) setSelectedBranchId(user.branchId);
      setActiveTab('pos');
    }
  };

  if (!currentUser) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
        <div className="bg-white p-10 rounded-3xl shadow-2xl w-full max-w-md text-center animate-in zoom-in">
          <span className="text-6xl block mb-6">⚒️</span>
          <h1 className="text-3xl font-black text-slate-900 uppercase tracking-tighter mb-8">GRUPO LOPAR</h1>
          {!isSupabaseConfigured && (
            <div className="mb-6 rounded-2xl border border-orange-200 bg-orange-50 px-4 py-3 text-sm text-orange-800">
              Configura `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` en `.env.local` para habilitar sincronizacion.
            </div>
          )}
          <div className="space-y-4">
            {users.map(u => (
              <button key={u.id} onClick={() => handleLogin(u.username)} className="w-full p-4 rounded-2xl border-2 border-slate-100 hover:border-orange-500 hover:bg-orange-50 transition-all flex items-center justify-between group">
                <div className="text-left">
                  <p className="font-bold text-slate-800">{u.name}</p>
                  <p className="text-[10px] font-black text-slate-400 uppercase">{u.role}</p>
                </div>
                <span>➡️</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  const activeBranches = branches.filter(b => b.isActive !== false);

  const renderContent = () => {
    switch (activeTab) {
      case 'pos':
        return <POSScreen products={products} conversions={conversions} selectedBranchId={selectedBranchId} branches={activeBranches} currentUser={currentUser} />;
      case 'purchases':
        return <PurchasesScreen selectedBranchId={selectedBranchId} currentUser={currentUser} branches={activeBranches} />;
      case 'customers':
        return <CustomerScreen selectedBranchId={selectedBranchId} branches={activeBranches} currentUser={currentUser} />;
      case 'inventory':
        return <InventoryScreen selectedBranchId={selectedBranchId} currentUser={currentUser} branches={activeBranches} />;
      case 'branches':
        return <BranchesScreen branches={branches} setBranches={setBranches} selectedBranchId={selectedBranchId} setSelectedBranchId={setSelectedBranchId} currentUser={currentUser} />;
      case 'users':
        return <UsersScreen users={users} setUsers={setUsers} branches={branches} />;
      case 'concrete-pos':
        return <ConcretePOSScreen products={products} conversions={conversions} selectedBranchId={selectedBranchId} branches={activeBranches} currentUser={currentUser} />;
      case 'concrete-purchases':
        return <ConcretePurchasesScreen selectedBranchId={selectedBranchId} currentUser={currentUser} branches={activeBranches} />;
      case 'concrete-customers':
        return <ConcreteCustomersScreen selectedBranchId={selectedBranchId} branches={activeBranches} currentUser={currentUser} />;
      case 'concrete-inventory':
        return <ConcreteInventoryScreen selectedBranchId={selectedBranchId} currentUser={currentUser} branches={activeBranches} />;
      case 'concrete-reports':
        return <ConcreteReportsScreen selectedBranchId={selectedBranchId} branches={activeBranches} />;
      case 'diesel':
        return <DieselScreen tanks={tanks} setTanks={setTanks} vehicles={vehicles} setVehicles={setVehicles} drivers={drivers} setDrivers={setDrivers} logs={dieselLogs} setLogs={setDieselLogs} currentUser={currentUser} selectedBranchId={selectedBranchId} branches={branches} />;
      case 'reports':
        return <ReportsScreen selectedBranchId={selectedBranchId} branches={activeBranches} />;
      default:
        return <POSScreen products={products} conversions={conversions} selectedBranchId={selectedBranchId} branches={activeBranches} currentUser={currentUser} />;
    }
  };

  return (
    <Layout activeTab={activeTab} setActiveTab={setActiveTab} currentUser={currentUser} selectedBranchId={selectedBranchId} setSelectedBranchId={setSelectedBranchId} branches={activeBranches} onLogout={() => setCurrentUser(null)} onReset={handleGlobalReset}>
      {renderContent()}
    </Layout>
  );
};

export default App;
