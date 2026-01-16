
import React, { useState, useMemo } from 'react';
import { Customer, CustomerPayment, User, Sale } from '../../types';

interface CustomerScreenProps {
  customers: Customer[];
  setCustomers: React.Dispatch<React.SetStateAction<Customer[]>>;
  payments: CustomerPayment[];
  setPayments: React.Dispatch<React.SetStateAction<CustomerPayment[]>>;
  sales: Sale[];
  currentUser: User;
}

const CustomerScreen: React.FC<CustomerScreenProps> = ({ 
  customers, setCustomers, payments, setPayments, sales, currentUser 
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  
  const [formData, setFormData] = useState({ name: '', phone: '', address: '', creditLimit: 0 });
  const [paymentAmount, setPaymentAmount] = useState<number>(0);
  const [paymentMethod, setPaymentMethod] = useState<'EFECTIVO' | 'TARJETA' | 'TRANSFERENCIA'>('EFECTIVO');
  const [paymentNotes, setPaymentNotes] = useState('');

  const filtered = customers.filter(c => 
    c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.address.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleRegisterPayment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCustomer || paymentAmount <= 0) return;

    const newPayment: CustomerPayment = {
      id: `P-${Date.now()}`,
      customerId: selectedCustomer.id,
      amount: paymentAmount,
      method: paymentMethod,
      date: new Date(),
      notes: paymentNotes,
      userId: currentUser.id
    };

    setPayments([newPayment, ...payments]);
    setCustomers(prev => prev.map(c => 
      c.id === selectedCustomer.id ? { ...c, currentDebt: Math.max(0, c.currentDebt - paymentAmount) } : c
    ));
    setIsPaymentModalOpen(false);
    setPaymentAmount(0);
    alert("✅ Abono registrado.");
  };

  // Construir Línea de Tiempo del Expediente
  const ledgerEntries = useMemo(() => {
    if (!selectedCustomer) return [];
    
    const customerSales = sales.filter(s => s.customerId === selectedCustomer.id);
    const customerPayments = payments.filter(p => p.customerId === selectedCustomer.id);

    const entries = [
      ...customerSales.map(s => ({ 
        id: s.id, 
        date: s.date, 
        type: 'VENTA', 
        description: s.paymentMethod === 'CREDITO' ? 'Venta a Crédito' : `Venta Liquida (${s.paymentMethod})`,
        items: s.items,
        amount: s.total, 
        isCharge: s.paymentMethod === 'CREDITO',
        isCredit: false,
        paymentMethod: s.paymentMethod
      })),
      ...customerPayments.map(p => ({ 
        id: p.id, 
        date: p.date, 
        type: 'ABONO', 
        description: `Abono a Cuenta (${p.method})`,
        items: [],
        amount: p.amount, 
        isCharge: false,
        isCredit: true,
        paymentMethod: p.method
      }))
    ].sort((a, b) => b.date.getTime() - a.date.getTime());

    return entries;
  }, [selectedCustomer, sales, payments]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-center gap-4 bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
        <input
          type="text" placeholder="🔍 Buscar cliente..."
          className="w-full md:flex-1 p-3 rounded-xl border border-gray-200 outline-none text-sm"
          value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
        />
        <button onClick={() => setIsCreateModalOpen(true)} className="w-full md:w-auto bg-slate-900 text-white px-6 py-3 rounded-xl font-bold">+ Nuevo Cliente</button>
      </div>

      <div className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden">
        <table className="w-full text-left">
          <thead className="bg-slate-50 border-b border-slate-200 text-[10px] font-black text-slate-400 uppercase tracking-widest">
            <tr>
              <th className="p-4">Cliente</th>
              <th className="p-4 text-right">Límite</th>
              <th className="p-4 text-right">Deuda Actual</th>
              <th className="p-4 text-right">Disponible</th>
              <th className="p-4 text-center">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filtered.map(c => (
              <tr key={c.id} className="hover:bg-slate-50 transition-colors">
                <td className="p-4">
                  <p className="font-bold text-slate-800">{c.name}</p>
                  <p className="text-[10px] text-slate-400">{c.phone}</p>
                </td>
                <td className="p-4 text-right font-mono text-sm">${c.creditLimit.toLocaleString()}</td>
                <td className="p-4 text-right">
                  <span className={`font-black ${c.currentDebt > 0 ? 'text-red-600' : 'text-slate-400'}`}>
                    ${c.currentDebt.toLocaleString()}
                  </span>
                </td>
                <td className="p-4 text-right font-black text-green-600">${(c.creditLimit - c.currentDebt).toLocaleString()}</td>
                <td className="p-4 text-center space-x-2">
                  <button onClick={() => { setSelectedCustomer(c); setIsHistoryModalOpen(true); }} className="bg-slate-100 p-2 rounded-lg" title="Expediente Completo">📄</button>
                  <button onClick={() => { setSelectedCustomer(c); setIsPaymentModalOpen(true); }} className="bg-green-600 text-white px-4 py-1.5 rounded-xl text-[10px] font-black uppercase">Abonar</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* MODAL EXPEDIENTE COMPLETO (LEDGER) */}
      {isHistoryModalOpen && selectedCustomer && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-[40px] shadow-2xl w-full max-w-5xl h-[85vh] overflow-hidden flex flex-col animate-in zoom-in duration-300">
            <div className="bg-slate-900 p-8 text-white flex justify-between items-start">
              <div>
                <h3 className="text-3xl font-black tracking-tighter uppercase">Expediente de Cliente</h3>
                <p className="text-orange-400 font-bold tracking-widest uppercase text-[10px] mt-1">{selectedCustomer.name}</p>
                <div className="flex gap-4 mt-4">
                   <div className="bg-white/5 px-4 py-2 rounded-2xl border border-white/10">
                      <p className="text-[8px] font-black text-slate-500 uppercase">Límite Total</p>
                      <p className="text-lg font-black">${selectedCustomer.creditLimit.toLocaleString()}</p>
                   </div>
                   <div className="bg-white/5 px-4 py-2 rounded-2xl border border-white/10">
                      <p className="text-[8px] font-black text-slate-500 uppercase">Deuda Actual</p>
                      <p className="text-lg font-black text-red-400">${selectedCustomer.currentDebt.toLocaleString()}</p>
                   </div>
                </div>
              </div>
              <button onClick={() => setIsHistoryModalOpen(false)} className="bg-white/10 w-12 h-12 rounded-2xl flex items-center justify-center text-2xl hover:bg-red-500 transition-all">&times;</button>
            </div>

            <div className="flex-1 overflow-y-auto p-8 bg-slate-50">
               <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-6">Estado de Cuenta Detallado</h4>
               <div className="space-y-4">
                 {ledgerEntries.map(entry => (
                   <div key={entry.id} className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm flex flex-col md:flex-row justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                           <span className={`px-3 py-1 rounded-full text-[9px] font-black uppercase ${entry.type === 'VENTA' ? 'bg-orange-100 text-orange-700' : 'bg-green-100 text-green-700'}`}>
                             {entry.type}
                           </span>
                           <span className="text-[10px] text-slate-400 font-bold">{entry.date.toLocaleString()}</span>
                           <span className="text-[9px] font-mono text-slate-300">ID: {entry.id}</span>
                        </div>
                        <h5 className="text-lg font-black text-slate-800 tracking-tight">{entry.description}</h5>
                        
                        {entry.items.length > 0 && (
                          <div className="mt-3 space-y-1">
                            {entry.items.map((item, idx) => (
                              <p key={idx} className="text-xs text-slate-500 flex justify-between max-w-sm">
                                <span>• {item.qty} {item.unitId} de {item.name}</span>
                                <span className="font-bold text-slate-700">${item.subtotal.toLocaleString()}</span>
                              </p>
                            ))}
                          </div>
                        )}
                      </div>
                      
                      <div className="text-right flex flex-col justify-center border-t md:border-t-0 md:border-l border-slate-100 pt-4 md:pt-0 md:pl-8">
                         <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Impacto en Saldo</p>
                         <p className={`text-2xl font-black ${entry.isCharge ? 'text-red-600' : entry.isCredit ? 'text-green-600' : 'text-slate-400'}`}>
                            {entry.isCharge ? '+' : entry.isCredit ? '-' : ''} ${entry.amount.toLocaleString()}
                         </p>
                         <p className="text-[9px] font-bold text-slate-400 uppercase mt-1 italic">
                           {entry.isCharge ? 'Venta cargada a crédito' : entry.isCredit ? 'Abono recibido' : 'Compra pagada al momento'}
                         </p>
                      </div>
                   </div>
                 ))}
                 {ledgerEntries.length === 0 && <div className="text-center py-20 text-slate-300 italic font-bold">Sin movimientos registrados.</div>}
               </div>
            </div>
            
            <div className="p-6 bg-white border-t border-slate-100 flex justify-end">
               <button onClick={() => window.print()} className="bg-slate-900 text-white px-8 py-3 rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl">Imprimir Estado de Cuenta</button>
            </div>
          </div>
        </div>
      )}

      {/* Los modales de Crear y Abonar se mantienen similares con ajustes de estilo */}
      {isPaymentModalOpen && selectedCustomer && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in">
            <div className="bg-green-600 p-6 text-white">
              <h3 className="text-xl font-black uppercase tracking-tighter">Registrar Abono</h3>
              <p className="text-[10px] font-bold uppercase tracking-widest">Para: {selectedCustomer.name}</p>
            </div>
            <form onSubmit={handleRegisterPayment} className="p-8 space-y-6">
              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 flex justify-between items-center">
                <span className="text-[10px] font-black text-slate-400 uppercase">Saldo Actual:</span>
                <span className="text-xl font-black text-red-600">${selectedCustomer.currentDebt.toLocaleString()}</span>
              </div>
              <input type="number" required placeholder="Monto $" className="w-full p-4 bg-gray-50 border-2 border-transparent focus:border-green-500 rounded-2xl outline-none font-black text-3xl text-center" value={paymentAmount} onChange={e => setPaymentAmount(Number(e.target.value))} />
              <button type="submit" className="w-full py-5 bg-green-600 text-white font-black rounded-2xl shadow-xl uppercase tracking-widest text-xs">Confirmar Pago</button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default CustomerScreen;
