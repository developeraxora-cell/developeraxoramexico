
import React, { useState, useEffect } from 'react';
import Layout from './components/Layout';
import POSScreen from './components/POS/POSScreen';
import InventoryScreen from './components/Inventory/InventoryScreen';
import PurchasesScreen from './components/Inventory/PurchasesScreen';
import DieselScreen from './components/Diesel/DieselScreen';
import CustomerScreen from './components/Customers/CustomerScreen';
import UsersScreen from './components/Users/UsersScreen';
import BranchesScreen from './components/Branches/BranchesScreen';
import ConcreteOps from './components/Concrete/ConcreteOps';
import ConcreteFormulas from './components/Concrete/ConcreteFormulas';
import ConcreteFleet from './components/Concrete/ConcreteFleet';
import {
  dieselTanksService,
  vehiclesService,
  driversService,
  dieselLogsService,
  subscriptions,
  supabase,
  productsService,
  customersService,
  salesService,
  concreteService
} from './services/supabaseClient';
import { INITIAL_CUSTOMERS, INITIAL_PRODUCTS, INITIAL_CONVERSIONS, INITIAL_USERS, INITIAL_BRANCHES } from './constants';
import { Customer, Product, ProductConversion, User, Role, Branch, CustomerPayment, DieselTank, Vehicle, Driver, DieselLog, ConcreteFormula, MixerTruck, ConcreteOrder, Sale, Purchase } from './types';

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState('pos');
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [branches, setBranches] = useState<Branch[]>(() => {
    const saved = localStorage.getItem('lopar_branches');
    return saved ? JSON.parse(saved) : INITIAL_BRANCHES;
  });
  const [selectedBranchId, setSelectedBranchId] = useState<string>(() => {
    return localStorage.getItem('lopar_selected_branch') || INITIAL_BRANCHES[0].id;
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
  const [purchases, setPurchases] = useState<Purchase[]>([]);

  // Estados de Concretera y Diesel
  const [concreteFormulas, setConcreteFormulas] = useState<ConcreteFormula[]>([
    { id: 'f1', name: "f'c 250", description: "Estructural", materials: [{ productId: 'p1', qtyPerM3: 350 }, { productId: 'p3', qtyPerM3: 850 }] },
    { id: 'f2', name: "f'c 150", description: "Firmes", materials: [{ productId: 'p1', qtyPerM3: 250 }, { productId: 'p3', qtyPerM3: 950 }] }
  ]);
  const [mixers, setMixers] = useState<MixerTruck[]>([
    { id: 'm1', plate: 'MIX-101', capacityM3: 7, status: 'DISPONIBLE' },
    { id: 'm2', plate: 'MIX-202', capacityM3: 8, status: 'DISPONIBLE' },
  ]);
  const [concreteOrders, setConcreteOrders] = useState<ConcreteOrder[]>([]);
  const [tanks, setTanks] = useState<DieselTank[]>([
    { id: 't1', branchId: 'b1', name: 'Tanque Matriz', currentQty: 1500, maxCapacity: 5000 },
    { id: 't2', branchId: 'b2', name: 'Almacén Norte Dsl', currentQty: 800, maxCapacity: 2000 }
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
    loadGlobalData();

    // Suscripciones para sincronización entre dispositivos
    const salesSub = subscriptions.subscribeAll('sales', () => loadGlobalData());
    const concreteSub = subscriptions.subscribeAll('concrete_orders', () => loadGlobalData());
    const stockSub = subscriptions.subscribeAll('product_stocks', () => loadGlobalData());
    const customerSub = subscriptions.subscribeAll('customers', () => loadGlobalData());

    // Suscripciones de Logística Diesel
    const tanksSub = subscriptions.subscribeAll('diesel_tanks', () => loadGlobalData());
    const logsSub = subscriptions.subscribeAll('diesel_logs', () => loadGlobalData());
    const vehicleSub = subscriptions.subscribeAll('vehicles', () => loadGlobalData());
    const driverSub = subscriptions.subscribeAll('drivers', () => loadGlobalData());

    return () => {
      salesSub.unsubscribe();
      concreteSub.unsubscribe();
      stockSub.unsubscribe();
      customerSub.unsubscribe();
      tanksSub.unsubscribe();
      logsSub.unsubscribe();
      vehicleSub.unsubscribe();
      driverSub.unsubscribe();
    };
  }, []);

  const loadGlobalData = async () => {
    try {
      const [prods, custs, ords, sls, tanksData, vehData, drivData, logsData] = await Promise.all([
        productsService.getAll(),
        customersService.getAll(),
        concreteService.getOrders(),
        salesService.getAll(),
        dieselTanksService.getAll(),
        vehiclesService.getAll(),
        driversService.getAll(),
        dieselLogsService.getAll(100)
      ]);

      if (prods) {
        setProducts(prods.map((p: any) => ({
          ...p,
          stocks: p.product_stocks.map((s: any) => ({ branchId: s.branch_id, qty: Number(s.qty) }))
        })));
      }
      if (custs) setCustomers(custs.map((c: any) => ({ ...c, creditLimit: Number(c.credit_limit), currentDebt: Number(c.current_debt) })));
      if (sls) setSales(sls.map((s: any) => ({ ...s, date: new Date(s.date) })));
      if (ords) setConcreteOrders(ords.map((o: any) => ({ ...o, scheduledDate: new Date(o.scheduled_date), qtyM3: Number(o.qty_m3) })));

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

  const renderContent = () => {
    switch (activeTab) {
      case 'pos':
        return <POSScreen customers={customers} setCustomers={setCustomers} products={products} setProducts={setProducts} conversions={conversions} selectedBranchId={selectedBranchId} sales={sales} setSales={setSales} currentUser={currentUser} />;
      case 'purchases':
        return <PurchasesScreen products={products} setProducts={setProducts} purchases={purchases} setPurchases={setPurchases} selectedBranchId={selectedBranchId} currentUser={currentUser} />;
      case 'customers':
        return <CustomerScreen customers={customers} setCustomers={setCustomers} payments={payments} setPayments={setPayments} sales={sales} currentUser={currentUser} />;
      case 'inventory':
        return <InventoryScreen products={products} setProducts={setProducts} selectedBranchId={selectedBranchId} currentUser={currentUser} />;
      case 'branches':
        return <BranchesScreen branches={branches} setBranches={setBranches} selectedBranchId={selectedBranchId} setSelectedBranchId={setSelectedBranchId} currentUser={currentUser} />;
      case 'users':
        return <UsersScreen users={users} setUsers={setUsers} branches={branches} />;
      case 'concrete-ops':
        return <ConcreteOps orders={concreteOrders} setOrders={setConcreteOrders} formulas={concreteFormulas} mixers={mixers} setMixers={setMixers} products={products} setProducts={setProducts} customers={customers} selectedBranchId={selectedBranchId} />;
      case 'concrete-fleet':
        return <ConcreteFleet mixers={mixers} setMixers={setMixers} orders={concreteOrders} setOrders={setConcreteOrders} />;
      case 'diesel':
        return <DieselScreen tanks={tanks} setTanks={setTanks} vehicles={vehicles} setVehicles={setVehicles} drivers={drivers} setDrivers={setDrivers} logs={dieselLogs} setLogs={setDieselLogs} currentUser={currentUser} selectedBranchId={selectedBranchId} />;
      default:
        return <POSScreen customers={customers} setCustomers={setCustomers} products={products} setProducts={setProducts} conversions={conversions} selectedBranchId={selectedBranchId} sales={sales} setSales={setSales} currentUser={currentUser} />;
    }
  };

  return (
    <Layout activeTab={activeTab} setActiveTab={setActiveTab} currentUser={currentUser} selectedBranchId={selectedBranchId} setSelectedBranchId={setSelectedBranchId} branches={branches} onLogout={() => setCurrentUser(null)} onReset={handleGlobalReset}>
      {renderContent()}
    </Layout>
  );
};

export default App;
