import React from 'react';

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
  warning: { header: 'bg-amber-500', button: 'bg-amber-500' },
};

const StatusModal: React.FC<StatusModalProps> = ({ isOpen, type, title, description, icon, onClose }) => {
  if (!isOpen) return null;

  const styles = typeStyles[type];

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-sm overflow-hidden animate-in zoom-in">
        <div className={`${styles.header} p-6 text-white flex justify-between items-center`}>
          <div className="flex items-center gap-3">
            {icon && <span className="text-xl">{icon}</span>}
            <h3 className="text-lg font-black uppercase tracking-tighter">{title}</h3>
          </div>
          {onClose && type !== 'loading' && (
            <button onClick={onClose} className="text-2xl font-black">&times;</button>
          )}
        </div>
        <div className="p-8 space-y-4">
          {description && <p className="text-sm text-slate-600 font-semibold">{description}</p>}
          {onClose && type !== 'loading' && (
            <button
              type="button"
              onClick={onClose}
              className={`w-full py-3 ${styles.button} text-white font-black rounded-xl uppercase tracking-widest text-[10px] shadow-lg`}
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
