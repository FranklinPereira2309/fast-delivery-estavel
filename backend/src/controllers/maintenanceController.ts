import { Request, Response } from 'express';
import prisma from '../prisma';
import bcrypt from 'bcryptjs';

export const resetSystem = async (req: Request, res: Response) => {
    try {
        // We use a transaction to ensure atomic reset
        await prisma.$transaction(async (tx) => {
            // Delete order items and recipes first due to foreign keys if Cascades aren't fully set (Prisma doesn't rely on DB cascades by default unless specified)
            // But TRUNCATE with CASCADE is the most efficient way in Postgres

            const tables = [
                'SupportMessage',
                'OrderMessage',
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
                    name: 'Delivery Fast',
                    cnpj: '00.000.000/0000-00',
                    address: 'Endereço da Empresa',
                    phone: '(00) 00000-0000',
                    deliveryFee: 'R$ 0,00',
                    tableCount: 1,
                    geofenceRadius: 150,
                    isManuallyClosed: false,
                    operatingHours: '[]',
                    orderTimeoutMinutes: 10,
                    maxChange: 200,
                    serviceFeeStatus: true,
                    serviceFeePercentage: 10,
                    autoCloseTime: '00:00'
                }
            });

            // Create default Admin Master user as requested
            const hashedPassword = await bcrypt.hash('@F88321656f', 10);
            await tx.user.create({
                data: {
                    email: 'admin@admin.com',
                    name: 'Administrador Master',
                    password: hashedPassword,
                    recoveryCode: 'ADMIN1',
                    mustChangePassword: false,
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
                        'reports',
                        'delivery-orders'
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
