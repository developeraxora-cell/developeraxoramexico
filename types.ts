
export enum Role {
  ADMIN = 'ADMIN',
  CAJERO = 'CAJERO',
  ALMACEN = 'ALMACEN'
}

export interface Branch {
  id: string;
  code: string;
  name: string;
  address: string;
  dbId?: number;
  isActive?: boolean;
  createdAt?: string;
}

export interface User {
  id: string;
  name: string;
  username: string;
  role: Role;
  active: boolean;
  branchId?: string;
}

export interface Unit {
  id: string;
  name: string;
  symbol: string;
  isStandard?: boolean;
}

export interface BranchStock {
  branchId: string;
  qty: number;
}

export interface Product {
  id: string;
  sku: string;
  name: string;
  category: string;
  baseUnitId: string;
  allowsDecimals: boolean;
  standardLengthM?: number;
  minStock: number;
  maxStock: number;
  stocks: BranchStock[];
  costPerBaseUnit: number;
  pricePerBaseUnit: number;
}

export interface PurchaseItem {
  productId: string;
  qty: number;
  cost: number;
  subtotal: number;
}

export interface Purchase {
  id: string;
  supplier: string;
  invoiceNumber: string;
  items: PurchaseItem[];
  total: number;
  date: Date;
  branchId: string;
  userId: string;
}

export interface ProductConversion {
  id: string;
  productId: string;
  fromUnitId: string;
  toUnitId: string;
  factor: number;
}

export interface CartItem {
  id: string;
  productId: string;
  name: string;
  qty: number;
  unitId: string;
  unitPrice: number;
  qtyBase: number;
  subtotal: number;
}

export interface Sale {
  id: string;
  customerId?: string;
  items: CartItem[];
  total: number;
  paymentMethod: 'EFECTIVO' | 'TARJETA' | 'CREDITO';
  date: Date;
  branchId: string;
  userId: string;
}

export interface Customer {
  id: string;
  name: string;
  phone: string;
  address: string;
  creditLimit: number;
  currentDebt: number;
  status: 'ACTIVO' | 'INACTIVO';
}

export interface CustomerPayment {
  id: string;
  customerId: string;
  amount: number;
  method: 'EFECTIVO' | 'TARJETA' | 'TRANSFERENCIA';
  date: Date;
  notes?: string;
  userId: string;
}

export interface ConcreteFormula {
  id: string;
  name: string;
  description: string;
  materials: {
    productId: string;
    qtyPerM3: number;
  }[];
}

export type MixerStatus = 'DISPONIBLE' | 'CARGANDO' | 'EN_RUTA' | 'REGRESANDO' | 'MANTENIMIENTO';

export interface MixerTruck {
  id: string;
  plate: string;
  capacityM3: number;
  status: MixerStatus;
  currentOrderId?: string;
}

export type ConcreteOrderStatus = 'PENDIENTE' | 'PRODUCIENDO' | 'EN_TRANSITO' | 'ENTREGADO' | 'CANCELADO';

export interface ConcreteOrder {
  id: string;
  customerId: string;
  formulaId: string;
  qtyM3: number;
  branchId: string;
  scheduledDate: Date;
  status: ConcreteOrderStatus;
  mixerId?: string;
  totalAmount: number;
}

export interface DieselTank {
  id: string;
  branchId: string;
  name: string;
  currentQty: number;
  maxCapacity: number;
}

export interface Vehicle {
  id: string;
  plate: string;
  description: string;
  active: boolean;
}

export interface Driver {
  id: string;
  name: string;
  license: string;
  active: boolean;
}

export interface DieselLog {
  id: string;
  type: 'CARGA' | 'RECEPCION';
  tankId: string;
  amount: number;
  costPerLiter?: number;
  totalCost?: number;
  supplier?: string;
  invoiceNumber?: string;
  vehicleId?: string;
  driverId?: string;
  odometerReading?: number;
  userId: string;
  createdAt: Date;
  notes?: string;
  status?: string;
  deleteObservation?: string;
}

export type AuditReason = 'CONTEO_CORRECTO' | 'MERMA' | 'DERECHO_CORTE' | 'DAÑO' | 'ERROR_VENTA' | 'ROBO' | 'OTRO';

export interface AuditItem {
  productId: string;
  snapshotQty: number; 
  physicalQty: number;  
  reason?: AuditReason;
  notes?: string;
}

export interface InventoryAudit {
  id: string;
  branchId: string;
  startTime: Date;
  status: 'EN_PROCESO' | 'FINALIZADO' | 'CANCELADO';
  items: AuditItem[];
  userId: string;
}
