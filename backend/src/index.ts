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

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
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

// Basic health check
app.get('/health', (req, res) => {
    res.json({ status: 'ok' });
});

app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});
