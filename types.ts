
export enum OrderStatus {
  PENDING = 'PENDING',
  PREPARING = 'PREPARING',
  PARTIALLY_READY = 'PARTIALLY_READY',
  READY = 'READY',
  OUT_FOR_DELIVERY = 'OUT_FOR_DELIVERY',
  DELIVERED = 'DELIVERED',
  CANCELLED = 'CANCELLED',
  REOPENED = 'REOPENED'
}

export const OrderStatusLabels: Record<OrderStatus, string> = {
  [OrderStatus.PENDING]: 'PENDENTE',
  [OrderStatus.PREPARING]: 'EM PREPARAÇÃO',
  [OrderStatus.PARTIALLY_READY]: 'PRONTO PARCIALMENTE',
  [OrderStatus.READY]: 'PRONTO',
  [OrderStatus.OUT_FOR_DELIVERY]: 'EM ROTA',
  [OrderStatus.DELIVERED]: 'FINALIZADA',
  [OrderStatus.CANCELLED]: 'CANCELADO',
  [OrderStatus.REOPENED]: 'REABERTA'
};

export enum SaleType {
  COUNTER = 'COUNTER',
  TABLE = 'TABLE',
  OWN_DELIVERY = 'OWN_DELIVERY',
  THIRD_PARTY = 'THIRD_PARTY'
}

export type UnitType = 'G' | 'ML' | 'UN' | 'KG' | 'L';

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
  permissions: string[];
  createdAt: string;
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
  // NFC-e Fields
  ie?: string;
  cscId?: string;
  cscToken?: string;
  isNfeProduction?: boolean;
}

export interface Waiter {
  id: string;
  name: string;
  phone: string;
}

export interface Client {
  id: string;
  name: string;
  phone: string;
  email?: string;
  document?: string;
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
  updatedAt?: string;
  // NFe Status
  nfeStatus?: 'PENDING' | 'EMITTED' | 'ERROR';
  nfeNumber?: string;
  nfeUrl?: string;
  nfeError?: string;
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
