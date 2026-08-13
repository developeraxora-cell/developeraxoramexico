export const getDisplaySaleReference = (reference: string | null | undefined) => {
  const value = String(reference ?? '').trim();
  const migratedSaleMatch = value.match(/^MIG-[A-Z0-9-]*VENTA-(\d+)$/i);
  return migratedSaleMatch?.[1] ?? value;
};

export const getDisplayCreditNoteCode = (note: {
  folio?: string | null;
  sale_reference?: string | null;
  inventory_transaction_id?: string | number | null;
}) => {
  const saleReference = String(note.sale_reference ?? '').trim();
  const folio = String(note.folio ?? '').trim();
  const displaySaleReference = getDisplaySaleReference(saleReference);
  const migratedCreditMatch = folio.match(/^MIG-[A-Z0-9-]*CRED-(\d+)$/i);

  if (displaySaleReference && displaySaleReference !== saleReference) {
    return displaySaleReference;
  }

  if (migratedCreditMatch) {
    return migratedCreditMatch[1];
  }

  const upperSaleReference = saleReference.toUpperCase();
  const upperFolio = folio.toUpperCase();
  const isGeneratedLegacyCode =
    upperSaleReference.startsWith('LEG-') ||
    upperFolio.startsWith('LEG-') ||
    upperFolio.startsWith('REP-');

  if (isGeneratedLegacyCode && note.inventory_transaction_id) {
    return String(note.inventory_transaction_id);
  }

  return folio
    || saleReference
    || (note.inventory_transaction_id ? String(note.inventory_transaction_id) : '')
    || '—';
};

export const getSaleDisplayNumber = (
  sale: { id: string | number; reference?: string | null },
  scope?: { branchId?: string | number | null; businessUnit?: string | null }
) => {
  const reference = getDisplaySaleReference(sale.reference);
  const saleId = Number(sale.id);
  const isDegolladoMaterials =
    String(scope?.branchId ?? '') === '1' &&
    String(scope?.businessUnit ?? 'materiales') === 'materiales';

  if (isDegolladoMaterials && Number.isFinite(saleId) && saleId < 7175) {
    return String(sale.id);
  }

  return reference || String(sale.id);
};
