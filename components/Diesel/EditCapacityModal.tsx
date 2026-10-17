import React from 'react';

interface EditCapacityModalProps {
  isOpen: boolean;
  isLoading: boolean;
  value: number;
  onChange: (value: number) => void;
  onCancel: () => void;
  onSubmit: (e: React.FormEvent) => void;
}

const EditCapacityModal: React.FC<EditCapacityModalProps> = ({
  isOpen,
  isLoading,
  value,
  onChange,
  onCancel,
  onSubmit,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden animate-in zoom-in">
        <div className="crm-form-header p-6 flex justify-between items-center">
          <h3 className="text-lg font-semibold  tracking-tight">Editar Capacidad Máxima</h3>
          <button onClick={onCancel} className="text-2xl font-semibold">&times;</button>
        </div>
        <form onSubmit={onSubmit} className="p-8 space-y-4">
          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-400  tracking-wide ml-1">Capacidad Máxima (L)</label>
            <input
              type="number"
              required
              min={1}
              className="w-full p-4 bg-slate-50 rounded-xl font-semibold text-center text-lg border-2 border-transparent focus:border-brand-500 outline-none"
              value={value || ''}
              onChange={e => onChange(Number(e.target.value))}
            />
          </div>
          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-4 bg-brand-500 text-white font-semibold rounded-xl  tracking-wide text-xs shadow-lg"
          >
            {isLoading ? 'Guardando...' : 'Actualizar Capacidad'}
          </button>
        </form>
      </div>
    </div>
  );
};

export default EditCapacityModal;
