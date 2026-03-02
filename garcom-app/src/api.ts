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

    requestCheckout: async (tableNumber: number) => {
        return api.post(`/tables/${tableNumber}/checkout`);
    }
};
