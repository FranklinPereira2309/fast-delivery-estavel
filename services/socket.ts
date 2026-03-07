import { io } from 'socket.io-client';

// Conecta ao servidor backend do PDV
// Utiliza a mesma porta 3000 do Prisma/Express
const SOCKET_URL = (import.meta as any).env.VITE_API_URL
    ? (import.meta as any).env.VITE_API_URL.replace('/api', '')
    : 'http://localhost:3000';

export const socket = io(SOCKET_URL, {
    autoConnect: true,
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    reconnectionAttempts: Infinity,
    transports: ['websocket', 'polling']
});

socket.on('connect', () => {
    console.log('Frontend PDV conectado ao Socket.io:', socket.id);
});

socket.on('disconnect', () => {
    console.log('Frontend PDV desconectado do Socket.io.');
});

// Global Unread State Management - Drivers (Logistics)
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

// Global Unread State Management - Clients (App Delivery / Delivery Orders)
const unreadClients = new Set<string>();
const unreadClientSubscribers = new Set<(unreads: Set<string>) => void>();

export const clientChatUnreadManager = {
    getUnreads: () => new Set(unreadClients),
    addUnread: (clientIdOrOrderId: string) => {
        unreadClients.add(clientIdOrOrderId);
        unreadClientSubscribers.forEach(cb => cb(new Set(unreadClients)));
    },
    removeUnread: (clientIdOrOrderId: string) => {
        unreadClients.delete(clientIdOrOrderId);
        unreadClientSubscribers.forEach(cb => cb(new Set(unreadClients)));
    },
    clearUnreads: () => {
        unreadClients.clear();
        unreadClientSubscribers.forEach(cb => cb(new Set(unreadClients)));
    },
    subscribe: (callback: (unreads: Set<string>) => void) => {
        unreadClientSubscribers.add(callback);
        return () => unreadClientSubscribers.delete(callback);
    }
};

// Global Unread State Management - Digital Menu Feedbacks/Messages
let hasUnreadFeedback = false;
const feedbackSubscribers = new Set<(hasUnread: boolean) => void>();

export const feedbackUnreadManager = {
    getHasUnread: () => hasUnreadFeedback,
    setUnread: (value: boolean) => {
        hasUnreadFeedback = value;
        feedbackSubscribers.forEach(cb => cb(hasUnreadFeedback));
    },
    subscribe: (callback: (hasUnread: boolean) => void) => {
        feedbackSubscribers.add(callback);
        return () => feedbackSubscribers.delete(callback);
    }
};


// Initial listener for global unreads
socket.on('new_message', (msg: any) => {
    // Check for Driver message
    if (msg.isFromDriver && msg.driverId) {
        chatUnreadManager.addUnread(msg.driverId);
    }
});

// Digital Menu Feedback
socket.on('newFeedback', () => {
    feedbackUnreadManager.setUnread(true);
});

// App Delivery Admin - Order Chat Unreads
socket.on('newOrderMessage', (data: any) => {
    const { orderId, message } = data;
    if (message && message.sender === 'CLIENT' && orderId) {
        clientChatUnreadManager.addUnread(orderId);
    }
});

// App Delivery Admin - Support Chat Unreads
socket.on('new_support_message', (msg: any) => {
    if (!msg.isAdmin && msg.clientId) {
        clientChatUnreadManager.addUnread(msg.clientId);
    }
});
