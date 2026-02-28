import { Request, Response } from 'express';
import prisma from '../prisma';

export const resetSystem = async (req: Request, res: Response) => {
    try {
        // We use a transaction to ensure atomic reset
        await prisma.$transaction(async (tx) => {
            // Delete order items and recipes first due to foreign keys if Cascades aren't fully set (Prisma doesn't rely on DB cascades by default unless specified)
            // But TRUNCATE with CASCADE is the most efficient way in Postgres

            const tables = [
                'OrderRejection',
                'ChatMessage',
                'AuditLog',
                'InventoryMovement',
                'RecipeItem',
                'OrderItem',
                'Receivable',
                'TableSession',
                'CashSession',
                'Order',
                'Feedback',
                'InventoryItem',
                'Product',
                'Waiter',
                'DeliveryDriver',
                'Client',
                'User',
                'BusinessSettings'
            ];

            // Truncate all tables and restart identities
            for (const table of tables) {
                await tx.$executeRawUnsafe(`TRUNCATE TABLE "${table}" RESTART IDENTITY CASCADE;`);
            }

            // Repopulate default Business Settings
            await tx.businessSettings.create({
                data: {
                    key: 'main',
                    name: 'Fast Food Express',
                    cnpj: '12.345.678/0001-90',
                    address: 'Av. Paulista, 1000 - São Paulo, SP',
                    phone: '(11) 98888-7777',
                    deliveryFee: 'R$ 8,00',
                    tableCount: 10,
                    geofenceRadius: 30,
                    isManuallyClosed: false,
                    operatingHours: '[]',
                    orderTimeoutMinutes: 5,
                    maxChange: 191,
                    serviceFeeStatus: true,
                    serviceFeePercentage: 10
                }
            });

            // Create default Admin Master user
            await tx.user.create({
                data: {
                    email: 'admin@admin.com',
                    name: 'Administrador Master',
                    password: 'admin',
                    recoveryCode: 'ADMIN1',
                    mustChangePassword: true,
                    permissions: [
                        'dashboard',
                        'pos',
                        'sales-monitor',
                        'tables',
                        'kitchen',
                        'crm',
                        'inventory',
                        'logistics',
                        'qrcodes',
                        'settings',
                        'receivables',
                        'reports'
                    ]
                }
            });

            // Create default ANONYMOUS client
            await tx.client.create({
                data: {
                    id: 'ANONYMOUS',
                    name: 'Consumidor Avulso',
                    phone: '0000000000',
                    addresses: []
                }
            });
        });

        res.json({ message: 'Sistema reiniciado com sucesso para os padrões de fábrica.' });
    } catch (error: any) {
        console.error('Erro ao reiniciar sistema:', error);
        res.status(500).json({ error: 'Erro ao reiniciar o sistema: ' + error.message });
    }
};
