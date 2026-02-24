
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

export interface Waiter {
  id: string;
  name: string;
  phone: string;
}

export interface Client {
  id: string;
  name: string;
  phone: string;
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
}

export interface OrderItem {
  uid: string; // ID único da instância do item
  productId: string;
  quantity: number;
  price: number;
  isReady?: boolean;
  readyAt?: string;
  observations?: string;
  tableSessionId?: number;
}

export interface TableSession {
  tableNumber: number;
  status: 'available' | 'occupied' | 'billing';
  items: OrderItem[];
  clientName?: string;
  clientId?: string;
  waiterId?: string;
  startTime: string;
  clientAddress?: string; // Novo: Endereço para cupom de mesa
  clientPhone?: string;   // Novo: Telefone para cupom de mesa
  hasPendingDigital?: boolean;
  pendingReviewItems?: string;
  isOriginDigitalMenu?: boolean;
}

export interface Order {
  id: string;
  clientId: string;
  clientName: string;
  clientAddress?: string;
  clientPhone?: string; // Novo: Telefone no pedido
  items: OrderItem[];
  total: number;
  status: OrderStatus;
  type: SaleType;
  createdAt: string;
  paymentMethod?: string;
  driverId?: string;
  tableNumber?: number;
  waiterId?: string;
  isOriginDigitalMenu?: boolean;
}

export interface AuditLog {
  id: string;
  timestamp: string;
  userId: string;
  userName: string;
  action: 'CREATE_ORDER' | 'EDIT_ORDER' | 'DELETE_ORDER' | 'LOGIN' | 'LOGOUT' | 'STOCK_ADJUST' | 'RECIPE_UPDATE' | 'TABLE_OPEN' | 'TABLE_ADD_ITEM' | 'TABLE_VOID_ITEM' | 'TABLE_BILL_REQUEST' | 'TABLE_DIGITAL_APPROVE' | 'TABLE_DIGITAL_REJECT';
  details: string;
}

export interface DeliveryDriver {
  id: string;
  name: string;
  phone: string;
  email?: string;
  address?: string;
  vehicle: {
    plate: string;
    model: string;
    brand: string;
    type: 'Moto' | 'Carro' | 'Bicicleta';
  };
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
