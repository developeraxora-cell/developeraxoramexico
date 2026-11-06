export const getConcreteSaleDisplayNumber = (sale: {
  id: string | number;
  reference?: string | null;
}) => {
  const reference = String(sale.reference ?? '').trim();
  return /^\d+$/.test(reference) ? reference : String(sale.id);
};
