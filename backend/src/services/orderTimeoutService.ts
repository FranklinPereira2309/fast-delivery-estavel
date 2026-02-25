
import prisma from '../prisma';
import { getIO } from '../socket';
import fs from 'fs';
import path from 'path';

const LOG_FILE = path.join(process.cwd(), 'logs', 'timeout_service.log');

const logToFile = (message: string) => {
    const timestamp = new Date().toISOString();
    const formattedMessage = `[${timestamp}] ${message}\n`;
    try {
        fs.appendFileSync(LOG_FILE, formattedMessage);
    } catch (e) {
        console.error('Failed to write to log file:', e);
    }
};

export const startOrderTimeoutService = () => {
    logToFile('Order Timeout Service initialized.');
    console.log('Starting Order Timeout Service...');

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

            logToFile(`Checking for timed out orders. Timeout: ${timeoutMinutes} min. Now: ${now.toISOString()}, Limit: ${limitTime.toISOString()}`);

            // 1. Reliability check: Assigned but no timestamp
            const missingTimestampOrders = await (prisma.order as any).findMany({
                where: {
                    status: 'READY',
                    driverId: { not: null, notIn: [''] },
                    assignedAt: null
                }
            });

            if (missingTimestampOrders.length > 0) {
                logToFile(`Found ${missingTimestampOrders.length} orders missing assignedAt. Fixing...`);
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
                logToFile(`Found ${timedOutOrders.length} timed out orders. IDs: ${timedOutOrders.map((o: any) => o.id).join(', ')}`);

                for (const order of timedOutOrders) {
                    const oldDriverId = order.driverId;
                    logToFile(`Processing timeout for Order ${order.id} (Driver ${oldDriverId})...`);

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
                                    userId: systemUser?.id || 'SYSTEM', // Fallback to SYSTEM if no user, but constraint might still fail
                                    userName: 'Sistema',
                                    details: `Pedido ${order.id} inativado por falta de interação do entregador ${oldDriverId}. (Vínculo removido e motorista liberado)`
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
                                message: 'A entrega foi inativada por falta de interação'
                            });

                            // Notificar Broadcast Global
                            getIO().emit('order_auto_rejected_global', {
                                orderId: order.id,
                                driverId: oldDriverId,
                                message: 'A entrega foi inativada por falta de interação'
                            });
                        }

                        // Global update
                        getIO().emit('orderStatusChanged', { action: 'statusUpdate', id: order.id, status: 'READY' });
                        getIO().emit('drivers_updated');

                        logToFile(`Order ${order.id} successfully timed out and released.`);
                    } catch (innerError: any) {
                        logToFile(`FAILED to process timeout for order ${order.id}: ${innerError.message}`);
                    }
                }
            }
        } catch (error: any) {
            logToFile(`CRITICAL Error in Order Timeout Service: ${error.message}`);
            console.error('Error in Order Timeout Service:', error);
        }
    }, 15000); // Check every 15 seconds for more responsiveness
};
