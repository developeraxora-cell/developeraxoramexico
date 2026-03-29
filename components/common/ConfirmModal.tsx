import React from 'react';

interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  description?: string;
  icon?: string;
  confirmText?: string;
  cancelText?: string;
  noteLabel?: string;
  notePlaceholder?: string;
  noteValue?: string;
  noteRequired?: boolean;
  noteError?: string | null;
  isConfirmDisabled?: boolean;
  isProcessing?: boolean;
  onNoteChange?: (value: string) => void;
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
  noteLabel,
  notePlaceholder = 'Escriba una observación breve',
  noteValue = '',
  noteRequired = false,
  noteError = null,
  isConfirmDisabled = false,
  isProcessing = false,
  onNoteChange,
  onConfirm,
  onCancel,
}) => {
  if (!isOpen) return null;

  const isNoteInvalid = noteRequired && !noteValue.trim();
  const disabled = isConfirmDisabled || isProcessing || isNoteInvalid;

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[120] flex items-center justify-center p-4">
      <div className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in">
        <div className="bg-amber-500 p-6 text-white flex justify-between items-center">
          <div className="flex items-center gap-3">
            {icon && <span className="text-xl">{icon}</span>}
            <h3 className="text-lg font-black uppercase tracking-tighter">{title}</h3>
          </div>
          <button onClick={onCancel} className="text-2xl font-black" disabled={isProcessing}>&times;</button>
        </div>
        <div className="p-8 space-y-4">
          {description && <p className="text-sm text-slate-600 font-semibold whitespace-pre-line">{description}</p>}
          {onNoteChange && (
            <div className="space-y-2">
              <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500">
                {noteLabel ?? (noteRequired ? 'Observación *' : 'Observación')}
              </label>
              <textarea
                rows={3}
                value={noteValue}
                onChange={(event) => onNoteChange(event.target.value)}
                placeholder={notePlaceholder}
                disabled={isProcessing}
                className="w-full p-3 rounded-2xl border border-slate-200 bg-slate-50 text-sm font-semibold text-slate-700 outline-none resize-none focus:ring-2 focus:ring-amber-500"
              />
              {noteError && (
                <p className="text-xs font-bold text-red-600">{noteError}</p>
              )}
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={onCancel}
              disabled={isProcessing}
              className="py-3 bg-slate-100 text-slate-600 font-black rounded-xl uppercase tracking-widest text-[10px]"
            >
              {cancelText}
            </button>
            <button
              type="button"
              onClick={onConfirm}
              disabled={disabled}
              className="py-3 bg-amber-500 text-white font-black rounded-xl uppercase tracking-widest text-[10px] shadow-lg disabled:opacity-50 disabled:shadow-none"
            >
              {isProcessing ? 'Guardando...' : confirmText}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ConfirmModal;
