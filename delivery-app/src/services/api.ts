import type { BusinessSettings } from '../types';

const API_BASE_URL = (import.meta as any).env.VITE_API_URL || 'http://localhost:3000/api';

class DeliveryApiService {
    private async request<T>(path: string, options: RequestInit = {}, retries = 2): Promise<T> {
        try {
            const token = localStorage.getItem('delivery_app_token');
            const actualToken = (options as any).overrideToken || token;
            const headers = {
                'Content-Type': 'application/json',
                ...(actualToken ? { 'Authorization': `Bearer ${actualToken}` } : {}),
                ...((options.headers as any) || {}),
            };

            const response = await fetch(`${API_BASE_URL}${path}`, {
                ...options,
                headers,
            });

            if (!response.ok) {
                // Tenta novamente se for erro temporário de servidor (502, 503, 504)
                if (retries > 0 && (response.status === 502 || response.status === 503 || response.status === 504)) {
                    await new Promise(r => setTimeout(r, 2000));
                    return this.request(path, options, retries - 1);
                }

                const error = await response.json().catch(() => ({ message: 'Erro desconhecido' }));
                throw new Error(error.error || error.message || 'Erro na requisição');
            }

            return response.json();
        } catch (e) {
            if (retries > 0) {
                // Erro de rede (ex: Failed to fetch) - tenta novamente
                await new Promise(r => setTimeout(r, 2000));
                return this.request(path, options, retries - 1);
            }
            throw e;
        }
    }

    // Auth
    async login(phone: string, pass: string) {
        const data = await this.request<{ client: any, token: string }>('/client-auth/login', {
            method: 'POST',
            body: JSON.stringify({ phone, password: pass }),
        });
        // Responsabilidade de salvar token movida para Login.tsx
        // para permitir validação de mustChangePassword antes do login efetivo
        return data;
    }

    async googleLogin(googleToken: string) {
        const data = await this.request<{ client: any, token: string }>('/client-auth/google', {
            method: 'POST',
            body: JSON.stringify({ googleToken }),
        });
        return data;
    }

    async register(name: string, email: string, phone: string, pass: string, cep?: string, addressNumber?: string, complement?: string, street?: string, neighborhood?: string, city?: string, state?: string) {
        return this.request('/client-auth/register', {
            method: 'POST',
            body: JSON.stringify({ name, email, phone, password: pass, cep, addressNumber, complement, street, neighborhood, city, state }),
        });
    }

    async recoverPassword(email: string, phone: string, newPassword: string) {
        return this.request('/client-auth/recover', {
            method: 'POST',
            body: JSON.stringify({ email, phone, newPassword }),
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
        return this.request<BusinessSettings>(`/settings?t=${Date.now()}`);
    }

    async getStoreStatus() {
        return this.request<{ status: 'online' | 'offline', is_manually_closed: boolean, next_status_change: string | null }>(`/public/store-status?t=${Date.now()}`);
    }

    // Orders
    async createOrder(orderData: any) {
        return this.request('/orders', {
            method: 'POST',
            body: JSON.stringify({
                order: {
                    ...orderData,
                    id: orderData.id || `ORD-APP-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                    isOriginDeliveryApp: true
                }
            }),
        });
    }

    async getMyOrders() {
        const client = JSON.parse(localStorage.getItem('delivery_app_client') || '{}');
        return this.request<any[]>(`/orders/client/my-orders?clientId=${client.id}&t=${Date.now()}`);
    }

    async updateClient(clientId: string, data: any, overrideToken?: string) {
        return this.request<any>(`/client-auth/profile/${clientId}`, {
            method: 'PUT',
            body: JSON.stringify(data),
            overrideToken
        } as RequestInit & { overrideToken?: string });
    }

    async checkPhone(phone: string) {
        return this.request<{ available: boolean }>(`/client-auth/check-phone/${phone}`);
    }

    async checkGoogleAccount(email: string, phone: string) {
        return this.request<{ isGoogle: boolean }>(`/client-auth/check-google-account?email=${email}&phone=${phone}`);
    }

    async getSupportHistory(clientId: string) {
        return this.request<any[]>(`/support?clientId=${clientId}&t=${Date.now()}`);
    }

    async sendSupportMessage(userName: string | null, message: string, clientId?: string, isAdmin: boolean = false) {
        return this.request('/support', {
            method: 'POST',
            body: JSON.stringify({ userName, message, clientId, isAdmin }),
        });
    }

    logout() {
        localStorage.removeItem('delivery_app_token');
        localStorage.removeItem('delivery_app_client');
    }
}

export const api = new DeliveryApiService();
