import type { BusinessSettings } from '../types';

const API_BASE_URL = (import.meta as any).env.VITE_API_URL || 'http://localhost:3000/api';

class DeliveryApiService {
    private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
        const token = localStorage.getItem('delivery_app_token');
        const headers = {
            'Content-Type': 'application/json',
            ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
            ...((options.headers as any) || {}),
        };

        const response = await fetch(`${API_BASE_URL}${path}`, {
            ...options,
            headers,
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({ message: 'Erro desconhecido' }));
            throw new Error(error.message || 'Erro na requisição');
        }

        return response.json();
    }

    // Auth
    async login(phone: string, pass: string) {
        const data = await this.request<{ client: any, token: string }>('/client-auth/login', {
            method: 'POST',
            body: JSON.stringify({ phone, password: pass }),
        });
        localStorage.setItem('delivery_app_token', data.token);
        localStorage.setItem('delivery_app_client', JSON.stringify(data.client));
        return data;
    }

    async register(name: string, email: string, phone: string, pass: string, cep?: string, complement?: string) {
        return this.request('/client-auth/register', {
            method: 'POST',
            body: JSON.stringify({ name, email, phone, password: pass, cep, complement }),
        });
    }

    // Catalog
    async getProducts() {
        return this.request<any[]>('/products');
    }

    async getCategories() {
        const products = await this.getProducts();
        const categories = Array.from(new Set(products.map(p => p.category)));
        return ['Todos', ...categories];
    }

    // Store Status
    // Settings
    async getSettings() {
        return this.request<BusinessSettings>('/settings');
    }

    async getStoreStatus() {
        return this.request<{ status: string, is_manually_closed: boolean }>('/maintenance/status');
    }

    // Orders
    async createOrder(orderData: any) {
        return this.request('/orders', {
            method: 'POST',
            body: JSON.stringify({ ...orderData, isOriginDeliveryApp: true }),
        });
    }

    async getMyOrders() {
        const client = JSON.parse(localStorage.getItem('delivery_app_client') || '{}');
        return this.request<any[]>(`/orders/client/${client.id}`);
    }

    logout() {
        localStorage.removeItem('delivery_app_token');
        localStorage.removeItem('delivery_app_client');
    }
}

export const api = new DeliveryApiService();
