
import { Unit, Product, ProductConversion, Customer, User, Role, Branch } from './types';

export const INITIAL_BRANCHES: Branch[] = [
  { id: 'b1', name: 'Matriz Centro', address: 'Av. Principal 123' },
  { id: 'b2', name: 'Sucursal Norte', address: 'Calle 45 x 10' },
];

export const UNITS: Unit[] = [
  { id: 'u1', name: 'Kilogramo', symbol: 'kg', isStandard: true },
  { id: 'u2', name: 'Tonelada', symbol: 'ton', isStandard: true },
  { id: 'u3', name: 'Bulto', symbol: 'blt' },
  { id: 'u4', name: 'Metro', symbol: 'm', isStandard: true },
  { id: 'u5', name: 'Pieza', symbol: 'pza' },
  { id: 'u6', name: 'Litro', symbol: 'L', isStandard: true },
];

export const INITIAL_USERS: User[] = [
  { id: 'u-1', name: 'Administrador Principal', username: 'admin', role: Role.ADMIN, active: true },
  { id: 'u-2', name: 'Cajero Matutino (Matriz)', username: 'cajero1', role: Role.CAJERO, active: true, branchId: 'b1' },
  { id: 'u-3', name: 'Encargado Norte', username: 'almacen1', role: Role.ALMACEN, active: true, branchId: 'b2' },
];

export const INITIAL_PRODUCTS: Product[] = [
  {
    id: 'p1',
    sku: 'CEM-TOL-50',
    name: 'Cemento Tolteca Gris',
    category: 'Materiales',
    baseUnitId: 'u1',
    allowsDecimals: true,
    minStock: 1000,
    maxStock: 20000,
    stocks: [
      { branchId: 'b1', qty: 5000 },
      { branchId: 'b2', qty: 1200 },
      { branchId: 'b3', qty: 15000 }
    ],
    costPerBaseUnit: 3.2,
    pricePerBaseUnit: 4.5
  },
  {
    id: 'p2',
    sku: 'VAR-38-12',
    name: 'Varilla Corrugada 3/8',
    category: 'Acero',
    baseUnitId: 'u4',
    allowsDecimals: true,
    standardLengthM: 12,
    minStock: 240,
    maxStock: 2400,
    stocks: [
      { branchId: 'b1', qty: 600 },
      { branchId: 'b2', qty: 45 },
      { branchId: 'b3', qty: 2000 }
    ],
    costPerBaseUnit: 25.0,
    pricePerBaseUnit: 38.0
  },
  {
    id: 'p3',
    sku: 'ARE-GRN',
    name: 'Arena de Mina',
    category: 'Materiales',
    baseUnitId: 'u1',
    allowsDecimals: true,
    minStock: 5000,
    maxStock: 50000,
    stocks: [
      { branchId: 'b1', qty: 15000 },
      { branchId: 'b2', qty: 8000 },
      { branchId: 'b3', qty: 40000 }
    ],
    costPerBaseUnit: 0.8,
    pricePerBaseUnit: 1.5
  }
];

export const INITIAL_CONVERSIONS: ProductConversion[] = [
  { id: 'c1', productId: 'p1', fromUnitId: 'u3', toUnitId: 'u1', factor: 50 },
  { id: 'c2', productId: 'p1', fromUnitId: 'u2', toUnitId: 'u1', factor: 1000 },
  { id: 'c3', productId: 'p2', fromUnitId: 'u5', toUnitId: 'u4', factor: 12 },
  { id: 'c4', productId: 'p3', fromUnitId: 'u2', toUnitId: 'u1', factor: 1000 },
];

export const INITIAL_CUSTOMERS: Customer[] = [
  { id: 'cust1', name: 'Juan Pérez - Constructor', phone: '555-0101', address: 'Calle 50 #123 x 45 y 47, Col. Centro', creditLimit: 50000, currentDebt: 12500, status: 'ACTIVO' },
  { id: 'cust2', name: 'María López - Acabados', phone: '555-0202', address: 'Av. Itzaes #400 x 59, Col. García Ginerés', creditLimit: 20000, currentDebt: 0, status: 'ACTIVO' },
  { id: 'cust3', name: 'Ingeniería Civil SA', phone: '555-0303', address: 'Parque Industrial Umán, Lote 15', creditLimit: 100000, currentDebt: 95000, status: 'ACTIVO' },
];
