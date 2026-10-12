import React from 'react';
import AppIcon from './AppIcon';

export type StatusType = 'success' | 'loading' | 'error' | 'warning';

interface StatusModalProps {
  isOpen: boolean;
  type: StatusType;
  title: string;
  description?: string;
  icon?: string;
  onClose?: () => void;
}

const typeStyles: Record<StatusType, { header: string; button: string }> = {
  success: { header: 'bg-green-600', button: 'bg-green-600' },
  loading: { header: 'bg-slate-900', button: 'bg-slate-900' },
  error: { header: 'bg-red-600', button: 'bg-red-600' },
  warning: { header: 'bg-amber-600', button: 'bg-amber-700' },
};

const StatusModal: React.FC<StatusModalProps> = ({ isOpen, type, title, description, icon, onClose }) => {
  if (!isOpen) return null;

  const styles = typeStyles[type];

  return (
    <div role="dialog" aria-modal="true" aria-label={title} className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden animate-in zoom-in">
        <div className="crm-dialog-heading p-5 flex justify-between items-center gap-4">
          <div className="flex items-center gap-3">
            <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-xl text-white ${styles.header}`}><AppIcon name={icon || type} /></span>
            <h3 className="text-lg font-semibold  tracking-tight">{title}</h3>
          </div>
          {onClose && type !== 'loading' && (
            <button onClick={onClose} aria-label="Cerrar aviso" className="crm-dialog-close"><AppIcon name="close" /></button>
          )}
        </div>
        <div className="p-8 space-y-4">
          {description && <p className="text-sm text-slate-600 font-semibold">{description}</p>}
          {onClose && type !== 'loading' && (
            <button
              type="button"
              onClick={onClose}
              className={`w-full py-3 ${styles.button} text-white font-semibold rounded-xl  tracking-wide text-xs shadow-lg`}
            >
              OK
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default StatusModal;
