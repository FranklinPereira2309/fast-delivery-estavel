import { Order, OrderStatus, DeliveryDriver, User, Product } from '../types';

const API_URL = (import.meta as any).env.VITE_API_URL || 'http://localhost:3000/api';
const AUTH_KEY = 'entregador_auth';

export interface BusinessSettings {
    name: string;
    phone: string;
    address: string;
    deliveryFee: string;
}

class DriverDBService {
    private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
        const response = await fetch(`${API_URL}${path}`, {
            ...options,
            headers: {
                'Content-Type': 'application/json',
                ...options.headers,
            },
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.message || 'Erro na requisição');
        }

        return response.json();
    }

    // Auth
    public async login(email: string, password: string): Promise<User> {
        const user = await this.request<User>('/auth/login', {
            method: 'POST',
            body: JSON.stringify({ email, password })
        });
        localStorage.setItem(AUTH_KEY, JSON.stringify(user));
        return user;
    }

    public getCurrentUser(): User | null {
        const session = localStorage.getItem(AUTH_KEY);
        return session ? JSON.parse(session) : null;
    }

    public logout() {
        localStorage.removeItem(AUTH_KEY);
    }

    // Drivers
    public async getDriverProfile(userId: string): Promise<DeliveryDriver> {
        const drivers = await this.request<DeliveryDriver[]>('/drivers');
        // Usually we would have a specific endpoint, but for now we filter
        const driver = drivers.find(d => d.email === userId || d.id === userId);
        if (!driver) throw new Error('Entregador não encontrado');
        return driver;
    }

    // Orders
    public async getOrders(): Promise<Order[]> {
        return this.request<Order[]>('/orders');
    }

    public async updateOrderStatus(orderId: string, status: OrderStatus, user: User, driverId?: string) {
        return this.request(`/orders/${orderId}/status`, {
            method: 'PATCH',
            body: JSON.stringify({ status, driverId, user })
        });
    }

    // Chat
    public async getChatHistory(driverId: string): Promise<any[]> {
        return this.request<any[]>(`/chat/${driverId}`);
    }

    public async sendChatMessage(message: { driverId: string, content: string, senderName: string, isFromDriver: boolean }) {
        return this.request('/chat', {
            method: 'POST',
            body: JSON.stringify(message)
        });
    }

    // Settings & Misc
    public async getSettings(): Promise<BusinessSettings> {
        return this.request<BusinessSettings>('/settings');
    }

    public async getProducts(): Promise<Product[]> {
        return this.request<Product[]>('/products');
    }

    public async getStoreStatus(): Promise<any> {
        return this.request('/public/store-status');
    }
}

export const db = new DriverDBService();
