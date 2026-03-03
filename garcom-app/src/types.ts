
export type OrderStatus = 'PENDING' | 'PREPARING' | 'PARTIALLY_READY' | 'READY' | 'OUT_FOR_DELIVERY' | 'DELIVERED' | 'CANCELLED' | 'REOPENED';
export type SaleType = 'COUNTER' | 'TABLE' | 'OWN_DELIVERY' | 'THIRD_PARTY';

export interface User {
    id: string;
    name: string;
    email: string;
    password?: string;
    phone?: string;
    recoveryCode?: string;
    mustChangePassword?: boolean;
    active: boolean;
    permissions: string[];
    waiterId?: string;
}

export interface Waiter {
    id: string;
    name: string;
    phone: string;
    email?: string;
    active: boolean;
}

export interface Product {
    id: string;
    name: string;
    price: number;
    category: string;
    imageUrl: string;
    stock: number;
}

export interface OrderItem {
    uid: string;
    productId: string;
    product?: Product;
    quantity: number;
    price: number;
    observations?: string;
    isReady?: boolean;
}

export interface TableSession {
    tableNumber: number;
    status: 'available' | 'occupied' | 'billing' | 'pending_digital';
    items: OrderItem[];
    clientName?: string;
    waiterId?: string;
    waiter?: Waiter;
    clientId?: string;
    startTime: string;
    hasPendingDigital?: boolean;
    pendingReviewItems?: string;
}

export interface BusinessSettings {
    name: string;
    tableCount: number;
    serviceFeeStatus?: boolean;
    serviceFeePercentage?: number;
    waiterPrivacyEnabled?: boolean;
    waiterPrivacyTimer?: number;
}

export interface Order {
    id?: string;
    clientId: string;
    clientName: string;
    clientPhone?: string;
    clientAddress?: string;
    items: OrderItem[];
    total: number;
    status: OrderStatus;
    type: SaleType;
    waiterId?: string;
    waiter?: Waiter;
    tableNumber?: number;
    deliveryFee?: number;
    appliedServiceFee?: number;
    paymentMethod?: string;
    createdAt?: string;
}

export interface StoreStatus {
    status: 'online' | 'offline';
    is_manually_closed: boolean;
    next_status_change: string | null;
}
