import React from 'react';
import { AlertCircle, CheckCircle2, X } from 'lucide-react';

export type ToastType = 'success' | 'error';

interface ToastProps {
  type: ToastType;
  message: string;
  onClose: () => void;
}

const Toast: React.FC<ToastProps> = ({ type, message, onClose }) => {
  const isSuccess = type === 'success';
  const Icon = isSuccess ? CheckCircle2 : AlertCircle;
  const title = isSuccess ? 'Listo' : 'Atención';
  const colors = isSuccess
    ? {
        border: 'border-emerald-200',
        bg: 'bg-emerald-50',
        iconBg: 'bg-emerald-600',
        title: 'text-emerald-900',
        text: 'text-emerald-700',
      }
    : {
        border: 'border-red-200',
        bg: 'bg-red-50',
        iconBg: 'bg-red-600',
        title: 'text-red-900',
        text: 'text-red-700',
      };

  return (
    <div
      role="status"
      aria-live="polite"
      className={`fixed right-5 top-5 z-[140] w-[calc(100vw-2.5rem)] max-w-[460px] rounded-2xl border ${colors.border} bg-white shadow-2xl shadow-slate-900/15 ring-1 ring-slate-900/5`}
    >
      <div className={`flex items-start gap-3 rounded-2xl ${colors.bg} px-4 py-3`}>
        <div className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${colors.iconBg} text-white shadow-sm`}>
          <Icon size={17} />
        </div>
        <div className="min-w-0 flex-1">
          <p className={`text-[11px] font-black uppercase tracking-widest ${colors.title}`}>{title}</p>
          <p className={`mt-0.5 max-w-full whitespace-normal break-words text-sm font-semibold leading-snug ${colors.text}`}>
            {message}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="shrink-0 rounded-lg p-1 text-slate-400 transition-colors hover:bg-white/70 hover:text-slate-700"
          aria-label="Cerrar notificación"
        >
          <X size={15} />
        </button>
      </div>
    </div>
  );
};

export default Toast;
