import React from 'react';

export type FeedbackType = 'success' | 'error' | 'alert' | 'loading';

interface FeedbackModalProps {
  isOpen: boolean;
  type: FeedbackType;
  title: string;
  description?: string;
  onClose?: () => void;
}

const FeedbackModal: React.FC<FeedbackModalProps> = ({
  isOpen,
  type,
  title,
  description,
  onClose,
}) => {
  if (!isOpen) return null;

  const isBlocking = type === 'loading';

  const config = {
    success: {
      icon: '✅',
      accent: 'bg-green-600',
      text: 'text-green-700',
    },
    error: {
      icon: '❌',
      accent: 'bg-red-600',
      text: 'text-red-700',
    },
    alert: {
      icon: '⚠️',
      accent: 'bg-amber-500',
      text: 'text-amber-700',
    },
    loading: {
      icon: '⏳',
      accent: 'bg-slate-700',
      text: 'text-slate-700',
    },
  } as const;

  const style = config[type];

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-200">
        <div className={`${style.accent} p-6 text-white flex justify-between items-center`}>
          <div className="flex items-center gap-3">
            <span className="text-2xl">{style.icon}</span>
            <div>
              <h3 className="text-lg font-black uppercase tracking-tighter">{title}</h3>
              {description && <p className="text-xs text-white/80">{description}</p>}
            </div>
          </div>
          {!isBlocking && onClose && (
            <button onClick={onClose} className="bg-white/10 w-10 h-10 rounded-xl text-xl font-black">
              ×
            </button>
          )}
        </div>
        <div className="p-6">
          <p className={`text-sm font-semibold ${style.text}`}>
            {description || 'Procesando...'}
          </p>
          {!isBlocking && onClose && (
            <div className="mt-6 flex justify-end">
              <button
                onClick={onClose}
                className="px-6 py-3 rounded-2xl bg-slate-900 text-white text-[10px] font-black uppercase tracking-widest"
              >
                Aceptar
              </button>
            </div>
          )}
          {isBlocking && (
            <div className="mt-6 flex items-center gap-3 text-slate-500 text-xs font-bold uppercase tracking-widest">
              <span className="w-2.5 h-2.5 rounded-full bg-slate-400 animate-pulse" />
              Espere un momento...
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default FeedbackModal;
