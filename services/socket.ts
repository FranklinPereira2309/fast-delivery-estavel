import { io } from 'socket.io-client';

// Conecta ao servidor backend do PDV
// Utiliza a mesma porta 3000 do Prisma/Express
const SOCKET_URL = (import.meta as any).env.VITE_API_URL
    ? (import.meta as any).env.VITE_API_URL.replace('/api', '')
    : 'http://localhost:3000';

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

// Global Unread State Management
const unreadDrivers = new Set<string>();
const unreadSubscribers = new Set<(unreads: Set<string>) => void>();

export const chatUnreadManager = {
    getUnreads: () => new Set(unreadDrivers),
    addUnread: (driverId: string) => {
        unreadDrivers.add(driverId);
        unreadSubscribers.forEach(cb => cb(new Set(unreadDrivers)));
    },
    removeUnread: (driverId: string) => {
        unreadDrivers.delete(driverId);
        unreadSubscribers.forEach(cb => cb(new Set(unreadDrivers)));
    },
    clearUnreads: () => {
        unreadDrivers.clear();
        unreadSubscribers.forEach(cb => cb(new Set(unreadDrivers)));
    },
    subscribe: (callback: (unreads: Set<string>) => void) => {
        unreadSubscribers.add(callback);
        return () => unreadSubscribers.delete(callback);
    }
};

// Initial listener for global unreads
socket.on('new_message', (msg: any) => {
    if (msg.isFromDriver) {
        chatUnreadManager.addUnread(msg.driverId);
    }
});
