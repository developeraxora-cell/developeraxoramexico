
import { ProductConversion } from '../types';

/**
 * Algoritmo de conversión principal.
 * Transforma una cantidad de una unidad origen a una unidad destino basándose en el producto.
 */
export const convert = (
  qty: number,
  fromUnitId: string,
  toUnitId: string,
  productId: string,
  conversions: ProductConversion[]
): number => {
  if (fromUnitId === toUnitId) return qty;

  // 1. Buscar conversión directa para este producto
  const direct = conversions.find(
    c => c.productId === productId && c.fromUnitId === fromUnitId && c.toUnitId === toUnitId
  );
  if (direct) return qty * direct.factor;

  // 2. Buscar conversión inversa para este producto
  const inverse = conversions.find(
    c => c.productId === productId && c.fromUnitId === toUnitId && c.toUnitId === fromUnitId
  );
  if (inverse) return qty / inverse.factor;

  // 3. Conversiones Globales Estándar (Fallback)
  // Tonelada -> KG
  if (fromUnitId === 'u2' && toUnitId === 'u1') return qty * 1000;
  if (fromUnitId === 'u1' && toUnitId === 'u2') return qty / 1000;

  console.warn(`No se encontró ruta de conversión de ${fromUnitId} a ${toUnitId} para el producto ${productId}`);
  return qty; // Fallback seguro
};

/**
 * Obtiene el precio ajustado según la unidad.
 * Si el precio base es por KG y vendemos un Bulto (50kg), el precio es base * 50.
 */
export const getPriceForUnit = (
  basePrice: number,
  baseUnitId: string,
  targetUnitId: string,
  productId: string,
  conversions: ProductConversion[]
): number => {
  if (baseUnitId === targetUnitId) return basePrice;
  const factor = convert(1, targetUnitId, baseUnitId, productId, conversions);
  return basePrice * factor;
};
