import 'dotenv/config';
import express from 'express';
import cors from 'cors';

import authRoutes from './routes/authRoutes';
import userRoutes from './routes/userRoutes';
import clientRoutes from './routes/clientRoutes';
import productRoutes from './routes/productRoutes';
import inventoryRoutes from './routes/inventoryRoutes';
import orderRoutes from './routes/orderRoutes';
import driverRoutes from './routes/driverRoutes';
import waiterRoutes from './routes/waiterRoutes';
import settingsRoutes from './routes/settingsRoutes';
import auditRoutes from './routes/auditRoutes';
import tableRoutes from './routes/tableRoutes';
import publicRoutes from './routes/publicRoutes';
import chatRoutes from './routes/chatRoutes';
import cashRoutes from './routes/cashRoutes';
import { initSocket } from './socket';
import { startOrderTimeoutService } from './services/orderTimeoutService';
import { loadSettingsToCache } from './storeStatusCache';
import http from 'http';

const app = express();
const port = process.env.PORT || 3000;
const server = http.createServer(app);
initSocket(server);

const allowedOrigins = [
    'https://delivery-fast-frontend.onrender.com',
    'https://cardapio-fast-delivery.onrender.com',
    'http://localhost:5173',
    'http://localhost:3000'
];

app.use(cors({
    origin: (origin, callback) => {
        if (!origin || allowedOrigins.includes(origin)) {
            callback(null, true);
        } else {
            console.warn(`Origin ${origin} not explicitly allowed by CORS, but allowing for debugging.`);
            callback(null, true);
        }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'Origin', 'X-Requested-With'],
}));
app.use(express.json());

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/clients', clientRoutes);
app.use('/api/products', productRoutes);
app.use('/api/inventory', inventoryRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/drivers', driverRoutes);
app.use('/api/waiters', waiterRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/audit', auditRoutes);
app.use('/api/tables', tableRoutes);
app.use('/api/public', publicRoutes); // Rotas abertas para clientes e cardápio digital
app.use('/api/chat', chatRoutes);
app.use('/api/cash', cashRoutes);

// Basic health check
app.get('/health', (req, res) => {
    res.json({ status: 'ok' });
});

server.listen(port, () => {
    console.log(`Server running on port ${port}`);
    loadSettingsToCache();
    startOrderTimeoutService();
});
