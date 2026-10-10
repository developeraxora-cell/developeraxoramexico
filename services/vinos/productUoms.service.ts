import { supabaseVinos } from '../vinosClient';

const PRODUCT_BATCH_SIZE = 50;
const PAGE_SIZE = 200;

export async function fetchProductUoms<Row>(productIds: string[], columns: string): Promise<Row[]> {
  const ids = [...new Set(productIds)];
  const rows: Row[] = [];

  // Bound the URL size independently of the number of products in the catalog.
  for (let start = 0; start < ids.length; start += PRODUCT_BATCH_SIZE) {
    const batch = ids.slice(start, start + PRODUCT_BATCH_SIZE);
    for (let offset = 0; ; offset += PAGE_SIZE) {
      const { data, error } = await supabaseVinos
        .from('product_uoms')
        .select(columns)
        .in('product_id', batch)
        .order('id')
        .range(offset, offset + PAGE_SIZE - 1);
      if (error) throw error;
      if (!data) throw new Error('La consulta de unidades no devolvio datos.');
      rows.push(...(data as unknown as Row[]));
      if (data.length < PAGE_SIZE) break;
    }
  }

  return rows;
}
