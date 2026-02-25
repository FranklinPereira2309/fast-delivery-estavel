
import prisma from '../prisma';
import { getIO } from '../socket';

export const startOrderTimeoutService = () => {
    console.log('Starting Order Timeout Service (5 minutes)...');

    setInterval(async () => {
        try {
            const now = new Date();
            const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000);

            console.log(`[OrderTimeoutService] Checking for timed out orders. Now: ${now.toISOString()}, FiveMinutesAgo: ${fiveMinutesAgo.toISOString()}`);

            // Find orders READY, with driver assigned more than 5 minutes ago
            // Using 'any' casting as some environment types might not have synced yet
            const timedOutOrders = await (prisma.order as any).findMany({
                where: {
                    status: 'READY',
                    driverId: { notIn: [null, ''] },
                    assignedAt: { lt: fiveMinutesAgo }
                }
            });

            if (timedOutOrders.length > 0) {
                console.log(`[OrderTimeoutService] Found ${timedOutOrders.length} timed out orders:`, timedOutOrders.map((o: any) => ({ id: o.id, assignedAt: o.assignedAt })));

                for (const order of timedOutOrders) {
                    const oldDriverId = order.driverId;

                    await prisma.$transaction(async (tx) => {
                        // Revert order assignment
                        await (tx.order as any).update({
                            where: { id: order.id },
                            data: {
                                driverId: null,
                                assignedAt: null
                            }
                        });

                        // Log action
                        await tx.auditLog.create({
                            data: {
                                action: 'AUTO_REJECTION',
                                userId: 'SYSTEM',
                                userName: 'Sistema',
                                details: `Pedido ${order.id} inativado por falta de interação do entregador ${oldDriverId} (Timeout 5min).`
                            }
                        });
                    });

                    // Emit to the specific driver room
                    if (oldDriverId) {
                        getIO().to(`chat_${oldDriverId}`).emit('order_auto_rejected', {
                            orderId: order.id,
                            message: 'A entrega foi inativada por falta de interação'
                        });
                    }

                    // Global refresh for Logistics/POS
                    getIO().emit('orderStatusChanged', { action: 'statusUpdate', id: order.id, status: 'READY' });
                }
            }
        } catch (error) {
            console.error('Error in Order Timeout Service:', error);
        }
    }, 30000); // Run every 30 seconds
};
