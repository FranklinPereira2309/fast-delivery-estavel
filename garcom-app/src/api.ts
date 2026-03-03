import axios from 'axios';
import { io } from 'socket.io-client';
import type { User, TableSession, Product, BusinessSettings } from './types';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';
const AUTH_KEY = 'delivery_fast_garcom_auth';

const api = axios.create({
    baseURL: API_BASE,
    headers: {
        'Content-Type': 'application/json'
    }
});

api.interceptors.request.use(config => {
    const saved = localStorage.getItem(AUTH_KEY);
    if (saved) {
        // No auth header needed if backend uses session cookies, 
        // but we'll include the user ID as a header for audit purposes if needed.
    }
    return config;
});

api.interceptors.response.use(
    response => response,
    error => {
        let message = 'Erro de conexão com o servidor';

        if (error.response) {
            const status = error.response.status;
            switch (status) {
                case 400: message = 'Dados inválidos ou incompletos'; break;
                case 401: message = 'Acesso não Autorizado'; break;
                case 403: message = 'Você não tem permissão para esta ação'; break;
                case 404: message = 'Recurso solicitado não encontrado'; break;
                case 429: message = 'Muitas tentativas. Tente novamente mais tarde'; break;
                case 500: message = 'Erro interno no servidor. Tente novamente'; break;
                default: message = `Erro inesperado: Status ${status}`;
            }
        } else if (error.message.includes('Network Error')) {
            message = 'Sem conexão com a internet';
        }

        return Promise.reject(new Error(message));
    }
);

export const socket = io(API_BASE.replace('/api', ''), {
    transports: ['websocket']
});

export const db = {
    getCurrentUser: (): User | null => {
        const saved = localStorage.getItem(AUTH_KEY);
        return saved ? JSON.parse(saved).user : null;
    },

    login: async (email: string, pass: string): Promise<User> => {
        const { data } = await api.post<User>('/auth/login', { email, password: pass });
        if (!data.permissions.includes('waiter') && !data.permissions.includes('admin')) {
            throw new Error('Acesso negado: Somente garçons podem acessar este app.');
        }
        localStorage.setItem(AUTH_KEY, JSON.stringify({ user: data, timestamp: Date.now() }));
        return data;
    },

    verifyRecoveryCode: async (email: string, recoveryCode: string): Promise<boolean> => {
        const { data } = await api.post<{ valid: boolean }>('/auth/recovery/verify', { email, recoveryCode });
        return data.valid;
    },

    resetPassword: async (payload: any) => {
        return api.post('/auth/reset-password', payload);
    },

    logout: () => {
        localStorage.removeItem(AUTH_KEY);
    },

    getTables: async (): Promise<TableSession[]> => {
        const { data } = await api.get<TableSession[]>('/tables');
        return data;
    },

    getProducts: async (): Promise<Product[]> => {
        const { data } = await api.get<Product[]>('/products');
        return data;
    },

    getSettings: async (): Promise<BusinessSettings> => {
        const { data } = await api.get<BusinessSettings>('/settings');
        return data;
    },

    saveTableSession: async (session: Partial<TableSession>) => {
        return api.post('/tables', session);
    },

    getClients: async (): Promise<any[]> => {
        const { data } = await api.get<any[]>('/clients');
        return data;
    },

    requestCheckout: async (tableNumber: number, clientId?: string, clientName?: string) => {
        return api.post(`/tables/${tableNumber}/checkout`, { clientId, clientName });
    },

    transferTable: async (from: number, to: number, waiterId: string) => {
        return api.post('/tables/transfer', { from, to, waiterId });
    },

    createOrder: async (order: any) => {
        const user = db.getCurrentUser();
        return api.post('/orders', { user, order });
    },

    getOrders: async (): Promise<any[]> => {
        const { data } = await api.get<any[]>('/orders');
        return data;
    },

    getWaiters: async (): Promise<any[]> => {
        const { data } = await api.get<any[]>('/waiters');
        return data;
    }
};
