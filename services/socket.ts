import { io } from 'socket.io-client';

// Conecta ao servidor backend do PDV
// Utiliza a mesma porta 3000 do Prisma/Express
const SOCKET_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

export const socket = io(SOCKET_URL, {
    autoConnect: true,
    reconnection: true,
});

socket.on('connect', () => {
    console.log('Frontend PDV conectado ao Socket.io:', socket.id);
});

socket.on('disconnect', () => {
    console.log('Frontend PDV desconectado do Socket.io.');
});
