import React, { useEffect, useRef } from 'react';
import { Loader2, Trash2, X } from 'lucide-react';

interface Props {
  inventoryName: string;
  reason: string;
  error: string;
  processing: boolean;
  onReasonChange: (value: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
}

const VinosInventoryDeleteModal: React.FC<Props> = ({ inventoryName, reason, error, processing, onReasonChange, onConfirm, onCancel }) => {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    if (element && !element.open) {
      element.showModal();
      element.querySelector<HTMLTextAreaElement>('textarea')?.focus();
    }
    return () => { if (element?.open) element.close(); };
  }, []);

  return (
    <dialog ref={dialog} aria-labelledby="inventory-delete-title" aria-describedby="inventory-delete-description"
      onCancel={(event) => { event.preventDefault(); if (!processing) onCancel(); }}
      className="fixed left-1/2 top-1/2 m-0 w-[calc(100%_-_2rem)] max-w-sm max-h-[90dvh] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl border border-slate-200 bg-white p-0 text-slate-900 shadow-2xl backdrop:bg-slate-900/60 backdrop:backdrop-blur-sm">
      <form onSubmit={(event) => { event.preventDefault(); if (!processing && reason.trim()) onConfirm(); }}>
        <header className="flex items-center justify-between gap-2 border-b border-slate-200 px-4 py-3">
          <div className="flex min-w-0 items-center gap-2">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-red-50 text-red-500"><Trash2 size={16} /></div>
            <div className="min-w-0">
              <h2 id="inventory-delete-title" className="text-sm font-semibold ">Eliminar inventario</h2>
              <p className="mt-0.5 break-words text-xs text-slate-500">{inventoryName}</p>
            </div>
          </div>
          <button type="button" onClick={onCancel} disabled={processing} title="Cerrar" aria-label="Cerrar"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 focus-visible:ring-2 focus-visible:ring-red-500 disabled:opacity-50"><X size={16} /></button>
        </header>
        <div className="space-y-2.5 px-4 py-3">
          <div>
            <label htmlFor="inventory-delete-reason" className="mb-1 block text-xs font-semibold  text-slate-500">Motivo / observacion <span className="text-red-500">*</span></label>
            <textarea id="inventory-delete-reason" autoFocus required rows={2} value={reason} disabled={processing}
              aria-invalid={Boolean(error)} aria-describedby={error ? 'inventory-delete-error' : undefined}
              onChange={(event) => onReasonChange(event.target.value)} placeholder="Explica por que se elimina..."
              className="block w-full resize-none rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400 disabled:opacity-60" />
          </div>
          <p id="inventory-delete-description" className="rounded-lg bg-red-50 px-3 py-2 text-[11px] text-red-700">Se borraran el inventario y sus capturas. No se puede deshacer.</p>
          {error && <p id="inventory-delete-error" role="alert" className="text-xs text-red-600">{error}</p>}
        </div>
        <footer className="flex gap-2 border-t border-slate-200 bg-slate-50 px-4 py-3">
          <button type="button" onClick={onCancel} disabled={processing} className="flex-1 rounded-xl border border-slate-200 bg-white py-2 text-xs font-semibold  text-slate-600 hover:bg-slate-100 focus-visible:ring-2 focus-visible:ring-slate-500 disabled:opacity-50">Cancelar</button>
          <button type="submit" disabled={processing || !reason.trim()} className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-red-500 py-2 text-xs font-semibold  text-white hover:bg-red-600 focus-visible:ring-2 focus-visible:ring-red-500 disabled:opacity-40">
            {processing && <Loader2 size={13} className="animate-spin" />}
            {processing ? 'Eliminando...' : 'Eliminar'}
          </button>
        </footer>
      </form>
    </dialog>
  );
};

export default VinosInventoryDeleteModal;
