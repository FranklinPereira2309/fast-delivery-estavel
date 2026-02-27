import { io } from 'socket.io-client';

const SOCKET_URL = (import.meta as any).env.VITE_API_URL
    ? (import.meta as any).env.VITE_API_URL.replace('/api', '')
    : 'http://localhost:3000';

export const socket = io(SOCKET_URL, {
    autoConnect: true,
    reconnection: true,
    transports: ['websocket']
});

socket.on('connect', () => {
    console.log('Entregador App conectado ao Socket.io:', socket.id);
});

socket.on('disconnect', () => {
    console.log('Entregador App desconectado do Socket.io.');
});
