import React from 'react';
import { DieselTank } from '../../types';

interface DieselTankCardProps {
  tank: DieselTank;
}

const DieselTankCard: React.FC<DieselTankCardProps> = ({ tank }) => {
  const percentage = (tank.currentQty / tank.maxCapacity) * 100;
  const isCritical = percentage < 15;

  return (
    <div className="bg-white p-4 md:p-8 rounded-[2rem] md:rounded-[3rem] border border-slate-200 shadow-sm relative overflow-hidden group hover:shadow-2xl transition-all duration-700">
      <div className="flex justify-between items-start mb-8">
        <div>
          <span className="text-[10px] font-black text-orange-500 uppercase tracking-[0.2em] mb-1 block">Depósito Estacionario</span>
          <h3 className="text-2xl font-black text-slate-800 uppercase tracking-tighter font-outfit">{tank.name}</h3>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-12 h-12 bg-slate-50 rounded-2xl flex items-center justify-center text-xl shadow-inner border border-slate-100">
            <span className="grayscale-0">⛽</span>
          </div>
        </div>
      </div>

      <div className="relative mx-auto w-48 h-72 bg-slate-100 rounded-[3rem] border-8 border-slate-900 overflow-hidden shadow-[inset_0_10px_30px_rgba(0,0,0,0.1)] group-hover:scale-105 transition-transform duration-500">
        <div
          className={`absolute bottom-0 left-0 right-0 transition-all duration-[2000ms] ease-in-out bg-gradient-to-t ${isCritical ? 'from-red-600 to-red-400' : 'from-orange-500 via-orange-400 to-amber-300'
            }`}
          style={{ height: `${percentage}%` }}
        >
          <div className="absolute -top-5 left-0 w-[200%] h-10 opacity-30">
            <svg viewBox="0 0 120 28" className="w-full h-full animate-diesel-wave fill-current text-white">
              <path d="M0 15 Q30 0 60 15 T120 15 V28 H0 Z" />
            </svg>
          </div>
        </div>

        <div className="absolute inset-0 flex flex-col items-center justify-center z-30 pointer-events-none">
          <div className="bg-slate-900/80 backdrop-blur-sm px-4 py-2 rounded-xl border border-slate-700 shadow-2xl">
            <p className="text-2xl font-mono font-black text-orange-400">
              {percentage.toFixed(1)}%
            </p>
          </div>
          <p className="text-[8px] font-black text-white/50 uppercase tracking-[0.3em] mt-2">Nivel en Tiempo Real</p>
        </div>

        <div className="absolute right-3 inset-y-12 flex flex-col justify-between z-20 opacity-20">
          {[100, 75, 50, 25, 0].map(val => (
            <div key={val} className="flex items-center gap-2">
              <span className="text-[7px] font-black text-slate-900">{val}%</span>
              <div className="w-2 h-0.5 bg-slate-900"></div>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-8 grid grid-cols-2 gap-4">
        <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
          <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Volumen Actual</p>
          <p className="text-xl font-black text-slate-900">{tank.currentQty.toLocaleString()} <span className="text-xs text-slate-400">L</span></p>
        </div>
        <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
          <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Capacidad</p>
          <p className="text-xl font-black text-slate-900">{tank.maxCapacity.toLocaleString()} <span className="text-xs text-slate-400">L</span></p>
        </div>
      </div>
    </div>
  );
};

export default DieselTankCard;
