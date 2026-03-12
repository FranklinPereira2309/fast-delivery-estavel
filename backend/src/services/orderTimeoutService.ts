
import prisma from '../prisma';
import { getIO } from '../socket';

export const startOrderTimeoutService = () => {
    console.log('Order Timeout Service initialized.');

    setInterval(async () => {
        try {
            const now = new Date();
            const settings = await prisma.businessSettings.findUnique({ where: { key: 'main' } });

            // Robust parsing of timeout
            let timeoutMinutes = 5;
            if (settings && (settings as any).orderTimeoutMinutes) {
                timeoutMinutes = Number((settings as any).orderTimeoutMinutes);
            }

            if (isNaN(timeoutMinutes) || timeoutMinutes <= 0) {
                timeoutMinutes = 5;
            }

            const timeoutMs = timeoutMinutes * 60 * 1000;
            const limitTime = new Date(now.getTime() - timeoutMs);

            // 1. Reliability check: Assigned but no timestamp
            const missingTimestampOrders = await (prisma.order as any).findMany({
                where: {
                    status: 'READY',
                    driverId: { not: null, notIn: [''] },
                    assignedAt: null
                }
            });

            if (missingTimestampOrders.length > 0) {
                for (const order of missingTimestampOrders) {
                    await (prisma.order as any).update({
                        where: { id: order.id },
                        data: { assignedAt: new Date() }
                    });
                }
            }

            // 2. Main check: Timed out orders
            const timedOutOrders = await (prisma.order as any).findMany({
                where: {
                    status: 'READY',
                    driverId: { not: null, notIn: [''] },
                    assignedAt: { lt: limitTime }
                }
            });

            if (timedOutOrders.length > 0) {
                console.log(`[TIMEOUT] Found ${timedOutOrders.length} timed out orders.`);

                for (const order of timedOutOrders) {
                    const oldDriverId = order.driverId;
                    try {
                        await prisma.$transaction(async (tx) => {
                            // Revert order assignment
                            await (tx.order as any).update({
                                where: { id: order.id },
                                data: {
                                    driverId: null,
                                    assignedAt: null
                                }
                            });

                            // Restore driver status to AVAILABLE
                            if (oldDriverId) {
                                await (tx.deliveryDriver as any).update({
                                    where: { id: oldDriverId },
                                    data: { status: 'AVAILABLE' }
                                });
                            }

                            // Log action
                            const systemUser = await tx.user.findFirst();
                            await tx.auditLog.create({
                                data: {
                                    action: 'AUTO_REJECTION',
                                    userId: systemUser?.id || 'SYSTEM',
                                    userName: 'Sistema',
                                    details: `Pedido ${order.id} inativado por falta de interação do entregador ${oldDriverId}.`
                                }
                            });

                            // Track Auto Rejection
                            if (oldDriverId) {
                                await tx.orderRejection.create({
                                    data: {
                                        orderId: order.id,
                                        driverId: oldDriverId,
                                        type: 'AUTO',
                                        reason: 'Falta de interação (Timeout)'
                                    }
                                });
                            }
                        });

                        // Notify Driver (Directly)
                        if (oldDriverId) {
                            getIO().to(`chat_${oldDriverId}`).emit('order_auto_rejected', {
                                orderId: order.id,
                                message: 'A entrega foi cancelada por inatividade do entregador'
                            });

                            // Notificar Broadcast Global
                            getIO().emit('order_auto_rejected_global', {
                                orderId: order.id,
                                driverId: oldDriverId,
                                message: 'A entrega foi cancelada por inatividade do entregador'
                            });
                        }

                        // Global update
                        getIO().emit('orderStatusChanged', { action: 'statusUpdate', id: order.id, status: 'READY' });
                        getIO().emit('drivers_updated');

                        console.log(`[TIMEOUT] Order ${order.id} released.`);
                    } catch (innerError: any) {
                        console.error(`[TIMEOUT] FAILED for order ${order.id}:`, innerError.message);
                    }
                }
            }
        } catch (error: any) {
            console.error('CRITICAL Error in Order Timeout Service:', error.message);
        }
    }, 15000);
};
