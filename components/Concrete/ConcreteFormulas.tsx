
import React from 'react';
import { ConcreteFormula, Product } from '../../types';
import { UNITS } from '../../constants';

interface ConcreteFormulasProps {
  formulas: ConcreteFormula[];
  setFormulas: React.Dispatch<React.SetStateAction<ConcreteFormula[]>>;
  products: Product[];
}

const ConcreteFormulas: React.FC<ConcreteFormulasProps> = ({ formulas, setFormulas, products }) => {
  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
        <div>
          <h2 className="text-2xl font-black text-slate-800 uppercase tracking-tighter">Recetario Maestro</h2>
          <p className="text-xs text-slate-400 font-bold uppercase tracking-widest">Dosificación Dinámica por m³</p>
        </div>
        <button className="bg-slate-900 text-white px-8 py-3 rounded-2xl font-black text-[10px] uppercase tracking-widest">+ Nueva Fórmula</button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {formulas.map(formula => (
          <div key={formula.id} className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm hover:shadow-xl transition-all group">
            <div className="flex justify-between items-start mb-6">
              <div>
                <h3 className="text-xl font-black text-slate-900 tracking-tighter uppercase">{formula.name}</h3>
                <p className="text-xs text-slate-400 font-medium italic">{formula.description}</p>
              </div>
              <span className="text-2xl opacity-20 group-hover:opacity-100 transition-opacity">🧪</span>
            </div>

            <div className="space-y-3">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest border-b pb-2">Componentes por Metro Cúbico</p>
              {formula.materials.map(mat => {
                const product = products.find(p => p.id === mat.productId);
                return (
                  <div key={mat.productId} className="flex justify-between items-center bg-slate-50 p-3 rounded-xl border border-slate-100">
                    <span className="text-xs font-bold text-slate-700">{product?.name}</span>
                    <span className="font-black text-slate-900 text-sm">{mat.qtyPerM3} <span className="text-[10px] text-slate-400">{UNITS.find(u => u.id === product?.baseUnitId)?.symbol}</span></span>
                  </div>
                );
              })}
            </div>
            
            <div className="mt-6 pt-6 border-t border-slate-100 flex gap-2">
               <button className="flex-1 py-2 bg-slate-50 text-slate-400 rounded-lg text-[9px] font-black uppercase tracking-widest hover:bg-slate-100">Editar Dosificación</button>
               <button className="px-3 py-2 text-red-300 hover:text-red-500">🗑️</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default ConcreteFormulas;
