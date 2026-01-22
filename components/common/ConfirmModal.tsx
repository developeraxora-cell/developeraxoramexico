import React from 'react';

interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  description?: string;
  icon?: string;
  confirmText?: string;
  cancelText?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

const ConfirmModal: React.FC<ConfirmModalProps> = ({
  isOpen,
  title,
  description,
  icon,
  confirmText = 'Confirmar',
  cancelText = 'Cancelar',
  onConfirm,
  onCancel,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-sm overflow-hidden animate-in zoom-in">
        <div className="bg-amber-500 p-6 text-white flex justify-between items-center">
          <div className="flex items-center gap-3">
            {icon && <span className="text-xl">{icon}</span>}
            <h3 className="text-lg font-black uppercase tracking-tighter">{title}</h3>
          </div>
          <button onClick={onCancel} className="text-2xl font-black">&times;</button>
        </div>
        <div className="p-8 space-y-4">
          {description && <p className="text-sm text-slate-600 font-semibold whitespace-pre-line">{description}</p>}
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={onCancel}
              className="py-3 bg-slate-100 text-slate-600 font-black rounded-xl uppercase tracking-widest text-[10px]"
            >
              {cancelText}
            </button>
            <button
              type="button"
              onClick={onConfirm}
              className="py-3 bg-amber-500 text-white font-black rounded-xl uppercase tracking-widest text-[10px] shadow-lg"
            >
              {confirmText}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ConfirmModal;
