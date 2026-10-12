import AppIcon from './AppIcon';
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
      icon: <AppIcon name="success" />,
      accent: 'bg-green-600',
      text: 'text-green-700',
    },
    error: {
      icon: <AppIcon name="error" />,
      accent: 'bg-red-600',
      text: 'text-red-700',
    },
    alert: {
      icon: <AppIcon name="warning" />,
      accent: 'bg-amber-700',
      text: 'text-amber-700',
    },
    loading: {
      icon: <AppIcon name="loading" />,
      accent: 'bg-slate-700',
      text: 'text-slate-700',
    },
  } as const;

  const style = config[type];
  const defaultDescription = type === 'loading'
    ? 'Procesando...'
    : type === 'success'
      ? 'Operación realizada correctamente.'
      : type === 'alert'
        ? 'Revisa la información e intenta nuevamente.'
        : 'No se pudo completar la operación.';

  return (
    <div role="dialog" aria-modal="true" aria-label={title} className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[120] flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm overflow-hidden animate-in fade-in zoom-in duration-200">
        <div className="crm-dialog-heading px-5 py-4 flex justify-between items-center gap-3">
          <div className="flex items-center gap-3">
            <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-xl text-white ${style.accent}`}>{style.icon}</span>
            <div>
              <h3 className="text-base font-semibold  tracking-tight">{title}</h3>
            </div>
          </div>
          {!isBlocking && onClose && (
            <button onClick={onClose} aria-label="Cerrar aviso" className="crm-dialog-close">
              <AppIcon name="close" />
            </button>
          )}
        </div>
        <div className="p-5">
          <p className={`text-sm font-semibold leading-relaxed ${style.text}`}>
            {description || defaultDescription}
          </p>
          {!isBlocking && onClose && (
            <div className="mt-5 flex justify-end">
              <button
                onClick={onClose}
                className="px-5 py-2.5 rounded-xl bg-slate-900 text-white text-xs font-semibold  tracking-wide"
              >
                Aceptar
              </button>
            </div>
          )}
          {isBlocking && (
            <div className="mt-6 flex items-center gap-3 text-slate-500 text-xs font-bold  tracking-wide">
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
