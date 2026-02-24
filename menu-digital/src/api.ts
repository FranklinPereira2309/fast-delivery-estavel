import axios from 'axios';
import { io } from 'socket.io-client';
import { Product } from './types';

// O Backend está rodando na porta 3000
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api/public';
const SOCKET_URL = import.meta.env.VITE_API_URL ? import.meta.env.VITE_API_URL.replace('/api/public', '') : 'http://localhost:3000';

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

export const fetchProducts = async (): Promise<Product[]> => {
    try {
        const response = await axios.get(`${API_URL}/products`);
        return response.data;
    } catch (error) {
        console.error('Error fetching products', error);
        return [];
    }
};

export const verifyTable = async (tableNumber: string): Promise<{ tableNumber: number, status: string, clientName: string | null }> => {
    try {
        const response = await axios.get(`${API_URL}/tables/${tableNumber}/verify`);
        return response.data;
    } catch (error: any) {
        console.error('Error verifying table', error);
        // Propaga o erro caso a mesa não exista ou esteja bloqueada (403, 404)
        throw error.response?.data || { message: 'Erro desconhecido' };
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
