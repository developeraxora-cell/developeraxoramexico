import { supabaseVinos } from '../vinosClient';

export interface Product {
  id: string; name: string; sku: string | null; barcode: string | null; base_uom_id: string | null;
}
export interface Uom { id: string; code: string; name: string }
export const CASA_TAHONA_INVENTORY_SCOPE = 'casa-tahona';

export const catalogService = {
  async listStock() {
    if (!supabaseVinos) throw new Error('Configura la conexion Supabase de Casa Tahona antes de usar Inventario.');
    const { data, error } = await supabaseVinos.from('product_stocks')
      .select('product_id,qty');
    if (error) throw new Error(error.message);
    const totals = new Map<string, number>();
    for (const row of data ?? []) {
      totals.set(row.product_id, (totals.get(row.product_id) ?? 0) + Number(row.qty ?? 0));
    }
    return [...totals].map(([product_id, qty_base]) => ({ product_id, qty_base }));
  },
  async listUoms(): Promise<Uom[]> {
    const { data, error } = await supabaseVinos.from('uoms').select('id,name,symbol');
    if (error) throw new Error(error.message);
    return (data ?? []).map((row) => ({ id: row.id, name: row.name, code: row.symbol || row.name }));
  },
  async searchProducts(term: string, limit = 20): Promise<Product[]> {
    // Bound filters prevent search text from becoming PostgREST filter syntax.
    const pattern = `%${term.replace(/[\\%_]/g, '\\$&')}%`;
    const results = await Promise.all(['name', 'sku', 'barcode'].map((field) =>
      supabaseVinos.from('products').select('id,name,sku,barcode,uom_id')
        .eq('is_active', true).is('deleted_at', null)
        .ilike(field, pattern).order('name').limit(limit)
    ));
    const unique = new Map<string, Product>();
    for (const result of results) {
      if (result.error) throw new Error(result.error.message);
      for (const row of result.data ?? []) unique.set(row.id, {
        id: row.id, name: row.name, sku: row.sku, barcode: row.barcode, base_uom_id: row.uom_id,
      });
    }
    return [...unique.values()].sort((a, b) => a.name.localeCompare(b.name)).slice(0, limit);
  },
};
