
export const OrderStatus = {
  PENDING: 'PENDING',
  PREPARING: 'PREPARING',
  PARTIALLY_READY: 'PARTIALLY_READY',
  READY: 'READY',
  OUT_FOR_DELIVERY: 'OUT_FOR_DELIVERY',
  DELIVERED: 'DELIVERED',
  CANCELLED: 'CANCELLED',
  REOPENED: 'REOPENED'
} as const;
export type OrderStatus = (typeof OrderStatus)[keyof typeof OrderStatus];

export const OrderStatusLabels: Record<OrderStatus, string> = {
  PENDING: 'PENDENTE',
  PREPARING: 'EM PREPARAÇÃO',
  PARTIALLY_READY: 'PRONTO PARCIALMENTE',
  READY: 'PRONTO',
  OUT_FOR_DELIVERY: 'EM ROTA',
  DELIVERED: 'FINALIZADA',
  CANCELLED: 'CANCELADO',
  REOPENED: 'REABERTA'
};

export const SaleType = {
  COUNTER: 'COUNTER',
  TABLE: 'TABLE',
  OWN_DELIVERY: 'OWN_DELIVERY',
  THIRD_PARTY: 'THIRD_PARTY'
} as const;
export type SaleType = (typeof SaleType)[keyof typeof SaleType];

export const UnitType = {
  G: 'G',
  ML: 'ML',
  UN: 'UN',
  KG: 'KG',
  L: 'L'
} as const;
export type UnitType = (typeof UnitType)[keyof typeof UnitType];

export interface InventoryItem {
  id: string;
  name: string;
  unit: UnitType;
  quantity: number;
  minStock: number;
  cost: number;
}

export interface RecipeItem {
  inventoryItemId: string;
  quantity: number;
  wasteFactor: number;
}

export interface User {
  id: string;
  name: string;
  email: string;
  password: string;
  phone?: string;
  recoveryCode?: string;
  mustChangePassword?: boolean;
  active: boolean;
  permissions: string[];
  createdAt: string;
  waiterId?: string | null;
}

export interface BusinessSettings {
  key: string;
  name: string;
  cnpj: string;
  address: string;
  phone: string;
  deliveryFee: string;
  tableCount: number;
  restaurantLat?: number;
  restaurantLng?: number;
  geofenceRadius: number;
  isManuallyClosed: boolean;
  operatingHours: string;
  orderTimeoutMinutes: number;
  maxChange?: number;
  serviceFeeStatus?: boolean;
  serviceFeePercentage?: number;
  // NFC-e Fields
  ie?: string;
  cscId?: string;
  cscToken?: string;
  isNfeProduction?: boolean;
  enableNfcEmission?: boolean;
  waiterPrivacyEnabled?: boolean;
  waiterPrivacyTimer?: number;
  enableDeliveryApp?: boolean;
  enableDigitalMenu?: boolean;
  enableWaiterApp?: boolean;
  enableDriverApp?: boolean;
  autoCloseTime?: string;
}

export interface Waiter {
  id: string;
  name: string;
  phone: string;
  email?: string;
  active: boolean;
}

export interface Client {
  id: string;
  name: string;
  phone: string;
  email?: string;
  pin?: string;
  document?: string;
  cep?: string;
  street?: string;
  addressNumber?: string;
  neighborhood?: string;
  city?: string;
  state?: string;
  complement?: string;
  addresses: string[];
  totalOrders: number;
  lastOrderDate?: string;
}

export interface Product {
  id: string;
  name: string;
  price: number;
  category: string;
  stock: number;
  imageUrl: string;
  recipe?: RecipeItem[];
  // Tax Fields
  ncm?: string;
  cfop?: string;
  cest?: string;
}

export interface OrderItem {
  uid: string;
  id?: string;
  orderId?: string;
  tableSessionId?: number;
  productId: string;
  quantity: number;
  price: number;
  isReady?: boolean;
  readyAt?: string;
  observations?: string;
}

export interface TableSession {
  tableNumber: number;
  status: 'available' | 'occupied' | 'billing' | 'pending-digital';
  items: OrderItem[];
  clientName?: string;
  clientPhone?: string;
  clientEmail?: string;
  clientDocument?: string;
  clientId?: string;
  waiterId?: string;
  startTime: string;
  clientAddress?: string;
  hasPendingDigital?: boolean;
  pendingReviewItems?: string;
  isOriginDigitalMenu?: boolean;
  updatedAt?: Date;
}

export interface Order {
  id: string;
  clientId?: string;
  clientName: string;
  clientAddress?: string;
  clientPhone?: string;
  clientEmail?: string;
  clientDocument?: string;
  items: OrderItem[];
  total: number;
  status: OrderStatus;
  type: SaleType;
  createdAt: string;
  paymentMethod?: string;
  driverId?: string;
  deliveryDriverId?: string;
  assignedAt?: string;
  deliveryFee?: number;
  tableNumber?: number;
  waiterId?: string;
  isOriginDigitalMenu?: boolean;
  isOriginDeliveryApp?: boolean;
  updatedAt?: string;
  // NFe Status
  nfeStatus?: 'PENDING' | 'EMITTED' | 'ERROR';
  nfeNumber?: string;
  nfeUrl?: string;
  nfeError?: string;
  // Payment Breakdown for Cash Management
  splitAmount1?: number;
  appliedServiceFee?: number;
}

export interface AuditLog {
  id: string;
  timestamp: string;
  userId: string;
  userName: string;
  action: string;
  details: string;
}

export interface DeliveryDriver {
  id: string;
  name: string;
  phone: string;
  email?: string;
  address?: string;
  vehiclePlate: string;
  vehicleModel: string;
  vehicleBrand: string;
  vehicleType: 'Moto' | 'Carro' | 'Bicicleta';
  status: 'AVAILABLE' | 'BUSY' | 'OFFLINE';
  active: boolean;
}

export interface InventoryMovement {
  id: string;
  timestamp: string;
  inventoryItemId: string;
  inventoryItem?: InventoryItem;
  type: 'INPUT' | 'OUTPUT' | 'ADJUSTMENT';
  quantity: number;
  reason: string;
  orderId?: string;
}

export type RejectionType = 'AUTO' | 'MANUAL';

export interface OrderRejection {
  id: string;
  timestamp: string;
  orderId: string;
  driverId: string;
  type: RejectionType;
  reason?: string;
}

export interface CashSession {
  id: string;
  openedAt: string;
  openedBy: string;
  openedByName: string;
  initialBalance: number;
  closedAt?: string;
  closedBy?: string;
  closedByName?: string;
  status: 'OPEN' | 'CLOSED';

  // Recorded by User at closing
  reportedCash?: number;
  reportedPix?: number;
  reportedCredit?: number;
  reportedDebit?: number;
  reportedOthers?: number;

  // Calculated by System
  systemCash?: number;
  systemPix?: number;
  systemCredit?: number;
  systemDebit?: number;
  systemOthers?: number;
  systemFiado?: number;
  totalSales?: number;
  orphanSales?: number;
  difference?: number;
  observations?: string;
}

export type ReceivableStatus = 'PENDING' | 'PAID';

export interface Receivable {
  id: string;
  clientId: string;
  orderId: string;
  amount: number;
  dueDate: string;
  status: ReceivableStatus;
  paymentMethod?: string;
  observations?: string;
  createdAt: string;
  paidAt?: string;
}

