import React from 'react';
import AppIcon from './AppIcon';

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
    <div role="dialog" aria-modal="true" aria-label={title} className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[120] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in">
        <div className="crm-dialog-heading p-5 flex justify-between items-center gap-4">
          <div className="flex items-center gap-3">
            <span className="crm-dialog-icon"><AppIcon name={icon || 'warning'} /></span>
            <h3 className="text-lg font-semibold  tracking-tight">{title}</h3>
          </div>
          <button onClick={onCancel} aria-label="Cerrar confirmación" className="crm-dialog-close" disabled={isProcessing}><AppIcon name="close" /></button>
        </div>
        <div className="p-8 space-y-4">
          {description && <p className="text-sm text-slate-600 font-semibold whitespace-pre-line">{description}</p>}
          {onNoteChange && (
            <div className="space-y-2">
              <label className="block text-xs font-semibold  tracking-wide text-slate-500">
                {noteLabel ?? (noteRequired ? 'Observación *' : 'Observación')}
              </label>
              <textarea
                rows={3}
                value={noteValue}
                onChange={(event) => onNoteChange(event.target.value)}
                placeholder={notePlaceholder}
                disabled={isProcessing}
                className="w-full p-3 rounded-xl border border-slate-200 bg-slate-50 text-sm font-semibold text-slate-700 outline-none resize-none focus:ring-2 focus:ring-amber-500"
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
              className="py-3 bg-slate-100 text-slate-600 font-semibold rounded-xl  tracking-wide text-xs"
            >
              {cancelText}
            </button>
            <button
              type="button"
              onClick={onConfirm}
              disabled={disabled}
                className="py-3 bg-slate-900 hover:bg-slate-800 text-white font-semibold rounded-xl text-sm disabled:opacity-50"
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
