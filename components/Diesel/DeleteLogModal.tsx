import React from 'react';

interface DeleteLogModalProps {
  isOpen: boolean;
  isLoading: boolean;
  observation: string;
  onObservationChange: (value: string) => void;
  onCancel: () => void;
  onConfirm: (e: React.FormEvent) => void;
}

const DeleteLogModal: React.FC<DeleteLogModalProps> = ({
  isOpen,
  isLoading,
  observation,
  onObservationChange,
  onCancel,
  onConfirm,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-sm overflow-hidden animate-in zoom-in">
        <div className="bg-red-600 p-6 text-white flex justify-between items-center">
          <h3 className="text-lg font-black uppercase tracking-tighter">Eliminar Registro</h3>
          <button onClick={onCancel} className="text-2xl font-black">&times;</button>
        </div>
        <form onSubmit={onConfirm} className="p-8 space-y-4">
          <p className="text-xs text-slate-500 font-bold">
            Este registro se marcara como eliminado y quedara auditado.
          </p>
          <textarea
            required
            rows={4}
            placeholder="Observacion de eliminacion"
            className="w-full p-4 bg-slate-50 rounded-xl font-bold text-sm border-2 border-transparent focus:border-red-500 outline-none"
            value={observation}
            onChange={e => onObservationChange(e.target.value)}
          />
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={onCancel}
              className="py-3 bg-slate-100 text-slate-600 font-black rounded-xl uppercase tracking-widest text-[10px]"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isLoading}
              className="py-3 bg-red-600 text-white font-black rounded-xl uppercase tracking-widest text-[10px] shadow-lg"
            >
              {isLoading ? 'Procesando...' : 'Confirmar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default DeleteLogModal;
