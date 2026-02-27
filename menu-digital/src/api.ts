import axios from 'axios';
import { io } from 'socket.io-client';
import { Product } from './types';

const IS_DEV = import.meta.env.DEV;
const host = window.location.hostname;
const defaultApiPort = IS_DEV ? '3000' : window.location.port;
const defaultApiStr = defaultApiPort ? `:${defaultApiPort}` : '';
const fallbackUrl = `http://${host}${defaultApiStr}/api`;

const BASE_URL = import.meta.env.VITE_API_URL || fallbackUrl;
const API_URL = BASE_URL.endsWith('/public') ? BASE_URL : `${BASE_URL}/public`;
const SOCKET_URL = BASE_URL.replace('/api', '');

// Configuração do axios para incluir o token de sessão se existir
axios.interceptors.request.use((config) => {
    // Busca o token do localStorage baseado na mesa se possível, ou um global
    // Para simplificar, vamos tentar buscar 'sessionToken_MesaX'
    const tableNum = new URLSearchParams(window.location.search).get('mesa');
    if (tableNum) {
        const token = localStorage.getItem(`sessionToken_${tableNum}`);
        if (token) {
            config.headers.Authorization = `Bearer ${token}`;
        }
    }
    return config;
});

export const socket = io(SOCKET_URL, {
    autoConnect: true,
    reconnection: true,
});

export const MOCK_CATEGORIES = ['Lanches', 'Porções', 'Bebidas', 'Sobremesas', 'Pizzas']; // Temporário, idealmente também viria do BD.

export interface OrderPayload {
    tableNumber: number;
    items: { productId: string; quantity: number }[];
    observations?: string;
    clientName?: string;
    clientLat?: number;
    clientLng?: number;
}

export interface StoreStatus {
    status: 'online' | 'offline';
    is_manually_closed: boolean;
    next_status_change: string | null;
}

export const fetchStoreStatus = async (): Promise<StoreStatus> => {
    try {
        const response = await axios.get(`${API_URL}/store-status`);
        return response.data;
    } catch (error) {
        console.error('Error fetching store status', error);
        return { status: 'online', is_manually_closed: false, next_status_change: null };
    }
};

export const fetchProducts = async (): Promise<Product[]> => {
    try {
        const response = await axios.get(`${API_URL}/products`);
        return response.data;
    } catch (error) {
        console.error('Error fetching products', error);
        return [];
    }
};

export const verifyTable = async (tableNumber: string): Promise<{ tableNumber: number, status: string, clientName: string | null, pin?: string, sessionToken?: string, isOwner?: boolean }> => {
    try {
        const response = await axios.get(`${API_URL}/tables/${tableNumber}/verify`);
        return response.data;
    } catch (error: any) {
        console.error('Error verifying table', error);
        // Propaga o erro caso a mesa não exista ou esteja bloqueada (403, 404, 401)
        throw error.response?.data || { message: 'Erro desconhecido' };
    }
};

export const validatePin = async (tableNumber: string, pin: string): Promise<{ sessionToken: string }> => {
    try {
        const response = await axios.post(`${API_URL}/tables/validate-pin`, { tableNumber, pin });
        return response.data;
    } catch (error: any) {
        console.error('Error validating PIN', error);
        throw error.response?.data || { message: 'Erro ao validar PIN.' };
    }
};

export const submitOrder = async (payload: OrderPayload) => {
    try {
        const response = await axios.post(`${API_URL}/orders`, payload);
        return response.data;
    } catch (error: any) {
        console.error('Error submitting order', error);
        throw error.response?.data || { message: 'Erro ao enviar o pedido.' };
    }
};

export const submitFeedback = async (tableNumber: string, message: string, name?: string) => {
    try {
        const response = await axios.post(`${API_URL}/feedback`, { tableNumber, message, name });
        return response.data;
    } catch (error: any) {
        console.error('Error submitting feedback', error);
        throw error.response?.data || { message: 'Erro ao enviar feedback.' };
    }
};

export const fetchConsumption = async (tableNumber: string) => {
    try {
        const response = await axios.get(`${API_URL}/tables/${tableNumber}/consumption`);
        return response.data;
    } catch (error: any) {
        console.error('Error fetching consumption', error);
        throw error.response?.data || { message: 'Erro ao buscar extrato.' };
    }
};
