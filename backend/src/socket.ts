import { Server } from 'socket.io';
import http from 'http';

let io: Server;

export const initSocket = (server: http.Server) => {
    io = new Server(server, {
        cors: {
            origin: '*',
            methods: ['GET', 'POST'],
            credentials: true
        },
        transports: ['polling', 'websocket'],
        allowEIO3: true
    });

    io.on('connection', (socket) => {
        console.log('Cliente conectado no Socket:', socket.id);

        socket.on('join_chat', (driverId: string) => {
            socket.join(`chat_${driverId}`);
            console.log(`Socket ${socket.id} entrou no chat do motorista ${driverId}`);
        });

        socket.on('join_table', (tableNumber: any) => {
            const num = Number(tableNumber);
            if (!isNaN(num)) {
                socket.join(`table_${num}`);
                console.log(`Socket ${socket.id} entrou na sala da mesa ${num}`);
            }
        });

        socket.on('send_message', (data: { driverId: string, content: string, senderName: string, isFromDriver: boolean }) => {
            // Re-emitir para a sala específica do motorista
            io.to(`chat_${data.driverId}`).emit('new_message', data);
        });

        socket.on('disconnect', () => {
            console.log('Cliente desconectado do Socket:', socket.id);
        });
    });

    return io;
};

export const getIO = () => {
    if (!io) {
        throw new Error('Socket.io não inicializado!');
    }
    return io;
};
