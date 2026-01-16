
import React, { useState, useMemo } from 'react';
import { Product, CartItem, ProductConversion, Customer, Sale, User } from '../../types';
import { UNITS } from '../../constants';
import { convert, getPriceForUnit } from '../../services/conversionEngine';

interface POSProps {
  customers: Customer[];
  setCustomers: React.Dispatch<React.SetStateAction<Customer[]>>;
  products: Product[];
  setProducts: React.Dispatch<React.SetStateAction<Product[]>>;
  conversions: ProductConversion[];
  selectedBranchId: string;
  sales: Sale[];
  setSales: React.Dispatch<React.SetStateAction<Sale[]>>;
  currentUser: User;
}

const POSScreen: React.FC<POSProps> = ({ 
  customers, setCustomers, products, setProducts, conversions, selectedBranchId, sales, setSales, currentUser 
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('');
  const [paymentMethod, setPaymentMethod] = useState<'EFECTIVO' | 'TARJETA' | 'CREDITO'>('EFECTIVO');

  const selectedCustomer = useMemo(() => 
    customers.find(c => c.id === selectedCustomerId), 
  [selectedCustomerId, customers]);

  const cartTotal = cart.reduce((acc, curr) => acc + curr.subtotal, 0);
  const availableCredit = selectedCustomer ? (selectedCustomer.creditLimit - selectedCustomer.currentDebt) : 0;
  const canAffordCredit = selectedCustomer && availableCredit >= cartTotal;

  const handleCheckout = () => {
    if (cart.length === 0) return;
    
    if (paymentMethod === 'CREDITO') {
      if (!selectedCustomer) {
        alert("⚠️ Debe seleccionar un cliente para vender a crédito.");
        return;
      }
      if (!canAffordCredit) {
        alert("❌ Crédito insuficiente.");
        return;
      }
    }

    // 1. Crear Registro de Venta
    const newSale: Sale = {
      id: `V-${Date.now()}`,
      customerId: selectedCustomerId || undefined,
      items: [...cart],
      total: cartTotal,
      paymentMethod: paymentMethod,
      date: new Date(),
      branchId: selectedBranchId,
      userId: currentUser.id
    };

    // 2. Actualizar Stock y Deuda si es Crédito
    setProducts(prev => prev.map(p => {
      const cartItem = cart.find(ci => ci.productId === p.id);
      if (cartItem) {
        return {
          ...p,
          stocks: p.stocks.map(s => s.branchId === selectedBranchId ? { ...s, qty: s.qty - cartItem.qtyBase } : s)
        };
      }
      return p;
    }));

    if (paymentMethod === 'CREDITO' && selectedCustomerId) {
      setCustomers(prev => prev.map(c => 
        c.id === selectedCustomerId ? { ...c, currentDebt: c.currentDebt + cartTotal } : c
      ));
    }

    setSales([newSale, ...sales]);
    alert(`✅ Venta completada (${paymentMethod})`);
    setCart([]);
    setSelectedCustomerId('');
    setPaymentMethod('EFECTIVO');
  };

  const addToCart = (product: Product) => {
    if (cart.find(i => i.productId === product.id)) return;
    const branchStock = product.stocks.find(s => s.branchId === selectedBranchId)?.qty || 0;
    if (branchStock <= 0) {
      alert("⚠️ Sin stock en esta sucursal.");
      return;
    }
    const newItem: CartItem = {
      id: Math.random().toString(36).substr(2, 9),
      productId: product.id,
      name: product.name,
      qty: 1,
      unitId: product.baseUnitId,
      unitPrice: product.pricePerBaseUnit,
      qtyBase: 1,
      subtotal: product.pricePerBaseUnit
    };
    setCart([...cart, newItem]);
  };

  const updateCartItem = (itemId: string, updates: Partial<CartItem>) => {
    setCart(prev => prev.map(item => {
      if (item.id !== itemId) return item;
      const product = products.find(p => p.id === item.productId)!;
      let newQty = updates.qty !== undefined ? updates.qty : item.qty;
      let newUnitId = updates.unitId !== undefined ? updates.unitId : item.unitId;
      const qtyBase = convert(newQty, newUnitId, product.baseUnitId, product.id, conversions);
      const branchStock = product.stocks.find(s => s.branchId === selectedBranchId)?.qty || 0;
      
      if (qtyBase > branchStock) {
        alert("⚠️ Stock insuficiente.");
        return item;
      }

      const unitPrice = getPriceForUnit(product.pricePerBaseUnit, product.baseUnitId, newUnitId, product.id, conversions);
      return { ...item, qty: newQty, unitId: newUnitId, qtyBase, unitPrice, subtotal: newQty * unitPrice };
    }));
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 h-[calc(100vh-180px)]">
      <div className="lg:col-span-7 flex flex-col gap-4">
        {/* Selector de Cliente */}
        <div className="bg-white p-4 rounded-xl border-2 border-slate-100 flex items-center gap-4 shadow-sm">
          <div className="flex-1">
            <label className="text-[10px] font-black text-gray-400 block mb-1 uppercase tracking-widest">Identificar Cliente (Opcional)</label>
            <select 
              className="w-full bg-gray-50 border-none outline-none font-bold text-slate-700 p-2 rounded-lg cursor-pointer"
              value={selectedCustomerId}
              onChange={(e) => setSelectedCustomerId(e.target.value)}
            >
              <option value="">👤 Público General (Mostrador)</option>
              {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          {selectedCustomer && (
            <div className="px-4 border-l border-slate-100 text-right animate-in fade-in">
              <p className="text-[9px] font-black text-slate-400 uppercase">Límite Disponible</p>
              <p className={`text-xl font-black ${canAffordCredit ? 'text-green-600' : 'text-red-600'}`}>
                ${availableCredit.toLocaleString()}
              </p>
            </div>
          )}
        </div>

        <input
          type="text"
          placeholder="🔍 Buscar material o SKU..."
          className="w-full p-4 rounded-xl border-2 border-gray-200 focus:border-orange-500 outline-none text-lg shadow-sm"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 overflow-y-auto pr-2">
          {products.filter(p => p.name.toLowerCase().includes(searchTerm.toLowerCase())).map(product => {
            const branchStock = product.stocks.find(s => s.branchId === selectedBranchId)?.qty || 0;
            return (
              <button key={product.id} onClick={() => addToCart(product)} className={`bg-white p-4 rounded-2xl border-2 border-transparent hover:border-orange-500 hover:shadow-lg transition-all text-left flex flex-col justify-between ${branchStock <= 0 ? 'opacity-50' : ''}`}>
                <div>
                  <h3 className="font-bold text-slate-800">{product.name}</h3>
                  <p className="text-xs text-gray-400 font-mono">{product.sku}</p>
                </div>
                <div className="mt-4 flex justify-between items-end">
                  <span className="text-xl font-black text-slate-900">${product.pricePerBaseUnit.toFixed(2)}</span>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-500">
                    Stock: {branchStock.toLocaleString()}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <div className="lg:col-span-5 bg-white rounded-3xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden">
        <div className="p-4 bg-slate-900 text-white flex justify-between items-center">
          <h2 className="font-black text-xs uppercase tracking-widest">Carrito de Venta</h2>
          <button onClick={() => setCart([])} className="text-[9px] bg-red-500/20 px-2 py-1 rounded text-red-200 uppercase font-black">Vaciar</button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {cart.map(item => (
            <div key={item.id} className="p-4 bg-slate-50 rounded-2xl border border-slate-100 relative group">
              <button onClick={() => setCart(cart.filter(i => i.id !== item.id))} className="absolute -top-2 -right-2 bg-slate-800 text-white rounded-full w-6 h-6 text-xs flex items-center justify-center shadow-lg">×</button>
              <p className="font-bold text-sm text-slate-800 mb-2">{item.name}</p>
              <div className="flex gap-2">
                <input type="number" value={item.qty} onChange={(e) => updateCartItem(item.id, { qty: Number(e.target.value) })} className="w-20 p-2 border-2 border-slate-200 rounded-lg text-center font-black" />
                <select value={item.unitId} onChange={(e) => updateCartItem(item.id, { unitId: e.target.value })} className="flex-1 p-2 border-2 border-slate-200 rounded-lg text-xs font-bold">
                  <option value={products.find(p => p.id === item.productId)?.baseUnitId}>{UNITS.find(u => u.id === products.find(p => p.id === item.productId)?.baseUnitId)?.symbol}</option>
                  {conversions.filter(c => c.productId === item.productId).map(c => <option key={c.id} value={c.fromUnitId}>{UNITS.find(u => u.id === c.fromUnitId)?.symbol}</option>)}
                </select>
                <span className="font-black text-slate-900 ml-auto flex items-center">${item.subtotal.toFixed(2)}</span>
              </div>
            </div>
          ))}
        </div>

        <div className="p-6 bg-slate-900 text-white border-t border-slate-800">
          <div className="grid grid-cols-3 gap-2 mb-6">
            {['EFECTIVO', 'TARJETA', 'CREDITO'].map(m => (
              <button 
                key={m} 
                onClick={() => {
                  if (m === 'CREDITO' && !selectedCustomerId) {
                    alert("⚠️ Seleccione un cliente para habilitar crédito.");
                    return;
                  }
                  setPaymentMethod(m as any);
                }}
                className={`py-3 text-[10px] font-black rounded-xl border-2 transition-all ${paymentMethod === m ? 'bg-orange-500 border-orange-400 text-white shadow-lg' : 'bg-slate-800 border-slate-700 text-slate-500'}`}
              >
                {m}
              </button>
            ))}
          </div>

          <div className="flex justify-between items-end mb-6">
            <div>
              <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Total a Pagar</p>
              <p className="text-4xl font-black text-orange-400 tracking-tighter">${cartTotal.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</p>
            </div>
          </div>

          <button 
            disabled={cart.length === 0 || (paymentMethod === 'CREDITO' && !canAffordCredit)}
            onClick={handleCheckout}
            className={`w-full py-5 rounded-2xl font-black text-xl shadow-2xl transition-all ${cart.length > 0 && !(paymentMethod === 'CREDITO' && !canAffordCredit) ? 'bg-orange-500 active:scale-95' : 'bg-slate-800 text-slate-600'}`}
          >
            {paymentMethod === 'CREDITO' && !canAffordCredit ? '❌ CRÉDITO EXCEDIDO' : '✅ FINALIZAR VENTA'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default POSScreen;
