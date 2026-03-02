
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

export enum SaleType {
    COUNTER = 'COUNTER',
    TABLE = 'TABLE',
    OWN_DELIVERY = 'OWN_DELIVERY',
    THIRD_PARTY = 'THIRD_PARTY'
}

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
    status: 'available' | 'occupied' | 'billing' | 'pending-digital';
    items: OrderItem[];
    clientName?: string;
    waiterId?: string;
    startTime: string;
    hasPendingDigital?: boolean;
    pendingReviewItems?: string;
}

export interface BusinessSettings {
    name: string;
    tableCount: number;
    serviceFeeStatus?: boolean;
    serviceFeePercentage?: number;
}
