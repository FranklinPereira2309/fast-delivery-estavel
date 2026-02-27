import { Request, Response } from 'express';
import prisma from '../prisma';
import { getIO } from '../socket';

const mapOrderResponse = (order: any) => {
    if (!order) return null;
    return {
        ...order,
        items: (order.items || []).map((item: any) => ({
            ...item,
            uid: item.id, // Ensure frontend gets 'uid'
            observations: item.observations || null,
            tableSessionId: item.tableSessionId || null
        }))
    };
};

export const getAllOrders = async (req: Request, res: Response) => {
    const orders = await prisma.order.findMany({
        include: { items: true }
    });
    console.log(`Fetching ${orders.length} orders for Kitchen`);
    res.json(orders.map(mapOrderResponse));
};

const syncClientStats = async (tx: any, order: any, oldStatus?: string) => {
    const isNewFinalization = order.status === 'DELIVERED' && oldStatus !== 'DELIVERED';
    const isReverting = order.status !== 'DELIVERED' && oldStatus === 'DELIVERED';
    let finalClientId = order.clientId;

    // 1. Handle Auto-Registration for Avulso Clients
    if (isNewFinalization && (order.clientId === 'ANONYMOUS' || !order.clientId) && order.clientPhone && order.clientPhone !== '0000000000') {
        let client = await tx.client.findFirst({
            where: { phone: order.clientPhone }
        });

        if (!client) {
            client = await tx.client.create({
                data: {
                    name: order.clientName,
                    phone: order.clientPhone,
                    email: order.clientEmail || null,
                    document: order.clientDocument || null,
                    addresses: [order.clientAddress || 'S/ Endereço'],
                    totalOrders: 0
                }
            });
        }
        finalClientId = client.id;
    }

    // 2. Increment on Finalization
    if (isNewFinalization && finalClientId && finalClientId !== 'ANONYMOUS') {
        await tx.client.update({
            where: { id: finalClientId },
            data: {
                totalOrders: { increment: 1 },
                lastOrderDate: new Date().toLocaleDateString('pt-BR')
            }
        });
    }

    // 3. Decrement on Reversion (Reopen)
    if (isReverting && finalClientId && finalClientId !== 'ANONYMOUS') {
        await tx.client.update({
            where: { id: finalClientId },
            data: {
                totalOrders: { decrement: 1 }
            }
        });
    }

    return finalClientId;
};

const handleInventoryImpact = async (tx: any, items: any[], type: 'DECREMENT' | 'INCREMENT', orderId?: string) => {
    for (const item of items) {
        if (!item.productId) continue;
        const product = await tx.product.findUnique({
            where: { id: item.productId },
            include: { recipe: { include: { inventoryItem: true } } }
        });

        if (product && product.recipe && Array.isArray(product.recipe)) {
            for (const r of product.recipe) {
                if (!r.inventoryItemId) continue;
                const quantityToChange = r.quantity * item.quantity * r.wasteFactor;

                await tx.inventoryItem.update({
                    where: { id: r.inventoryItemId },
                    data: {
                        quantity: type === 'DECREMENT'
                            ? { decrement: quantityToChange }
                            : { increment: quantityToChange }
                    }
                });

                // Get product name for cleaner reason
                const productName = product.name || 'Produto';

                // Log movement
                await tx.inventoryMovement.create({
                    data: {
                        inventoryItemId: r.inventoryItemId,
                        type: type === 'DECREMENT' ? 'OUTPUT' : 'INPUT',
                        quantity: quantityToChange,
                        reason: type === 'DECREMENT' ? `Venda: ${productName}` : `Estorno: ${productName}`,
                        orderId: orderId
                    }
                });
            }
        }
    }
};

export const saveOrder = async (req: Request, res: Response) => {
    const { user, order } = req.body;
    console.log('Receiving order save request:', { id: order.id, type: order.type, status: order.status, itemsCount: order.items?.length });

    try {
        let isNewItemsAdded = false;

        const result = await prisma.$transaction(async (tx: any) => {
            const existingOrder = await tx.order.findUnique({
                where: { id: order.id },
                include: { items: true }
            });

            if (!existingOrder) {
                isNewItemsAdded = true;
            } else if (order.items && existingOrder.items) {
                if (order.items.length > existingOrder.items.length) {
                    isNewItemsAdded = true;
                }
            }

            const oldStatus = existingOrder?.status;
            const oldDriverId = existingOrder?.driverId;
            const newStatus = order.status;

            // 1. Inventory Sync (Only on Finalization or Reversion)
            const itemsForInventory = order.items; // Use current items for stock calculation
            if (newStatus === 'DELIVERED' && oldStatus !== 'DELIVERED') {
                await handleInventoryImpact(tx, itemsForInventory, 'DECREMENT', order.id);

                // Reset do PIN/Sessão se for Mesa
                if (order.type === 'TABLE' && order.tableNumber) {
                    await tx.tableSession.deleteMany({
                        where: { tableNumber: order.tableNumber }
                    }).catch((e: any) => console.log('Sessão de mesa já removida ou inexistente:', e));
                }
            } else if (newStatus !== 'DELIVERED' && oldStatus === 'DELIVERED') {
                await handleInventoryImpact(tx, itemsForInventory, 'INCREMENT', order.id);
            }

            // 2. Client Synchronization and Order Counting
            const clientId = order.clientId && order.clientId !== "" ? order.clientId : 'ANONYMOUS';
            const waiterId = order.waiterId && order.waiterId !== "" ? order.waiterId : null;
            const driverId = order.driverId && order.driverId !== "" ? order.driverId : null;

            if (clientId === 'ANONYMOUS') {
                await tx.client.upsert({
                    where: { id: 'ANONYMOUS' },
                    update: {},
                    create: {
                        id: 'ANONYMOUS',
                        name: 'Consumidor Avulso',
                        phone: '0000000000',
                        addresses: []
                    }
                });
            }

            order.clientId = await syncClientStats(tx, { ...order, clientId }, oldStatus);

            // 3. Upsert Order
            return await tx.order.upsert({
                where: { id: order.id },
                update: {
                    status: order.status,
                    clientId: order.clientId,
                    clientName: order.clientName, // Fix: Also update client actual string names for Table edits
                    clientAddress: order.clientAddress,
                    clientPhone: order.clientPhone,
                    paymentMethod: order.paymentMethod,
                    driverId: driverId,
                    assignedAt: (driverId && driverId !== oldDriverId) ? new Date() : (driverId === null ? null : undefined),
                    waiterId: waiterId,
                    total: order.total,
                    deliveryFee: order.deliveryFee,
                    clientEmail: order.clientEmail || null,
                    clientDocument: order.clientDocument || null,
                    isOriginDigitalMenu: order.isOriginDigitalMenu !== undefined ? order.isOriginDigitalMenu : false, // Fix: Preserve Origin into Update
                    nfeStatus: order.nfeStatus || null,
                    nfeNumber: order.nfeNumber || null,
                    nfeUrl: order.nfeUrl || null,
                    nfeError: order.nfeError || null,
                    splitAmount1: order.splitAmount1 !== undefined ? order.splitAmount1 : null,
                    items: {
                        deleteMany: {},
                        create: order.items.map((item: any) => ({
                            id: item.uid,
                            productId: item.productId,
                            quantity: item.quantity,
                            price: item.price,
                            isReady: item.isReady || false,
                            readyAt: item.readyAt ? new Date(item.readyAt) : null,
                            observations: item.observations || null,
                            tableSessionId: item.tableSessionId || null
                        }))
                    }
                },
                create: {
                    id: order.id,
                    clientId: order.clientId,
                    clientName: order.clientName,
                    clientAddress: order.clientAddress,
                    clientPhone: order.clientPhone,
                    total: order.total,
                    deliveryFee: order.deliveryFee,
                    status: order.status,
                    type: order.type,
                    paymentMethod: order.paymentMethod,
                    driverId: driverId,
                    assignedAt: driverId ? new Date() : null,
                    tableNumber: order.tableNumber,
                    waiterId: waiterId,
                    clientEmail: order.clientEmail || null,
                    clientDocument: order.clientDocument || null,
                    isOriginDigitalMenu: order.isOriginDigitalMenu !== undefined ? order.isOriginDigitalMenu : false, // Fix: Preserve Origin into Creation
                    nfeStatus: order.nfeStatus || null,
                    nfeNumber: order.nfeNumber || null,
                    nfeUrl: order.nfeUrl || null,
                    nfeError: order.nfeError || null,
                    splitAmount1: order.splitAmount1 !== undefined ? order.splitAmount1 : null,
                    items: {
                        create: order.items.map((item: any) => ({
                            id: item.uid,
                            productId: item.productId,
                            quantity: item.quantity,
                            price: item.price,
                            isReady: item.isReady || false,
                            readyAt: item.readyAt ? new Date(item.readyAt) : null,
                            observations: item.observations || null,
                            tableSessionId: item.tableSessionId || null
                        }))
                    }
                },
                include: { items: true }
            });
        });

        if (isNewItemsAdded) {
            try {
                getIO().emit('newOrder', { action: 'refresh', id: order.id, type: order.type, tableNumber: order.tableNumber });
            } catch (e) {
                console.error('Socket error emitting newOrder:', e);
            }
        }

        res.json(mapOrderResponse(result));
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

export const deleteOrder = async (req: Request, res: Response) => {
    const { id } = req.params;
    const { user } = req.body;

    try {
        await prisma.$transaction(async (tx: any) => {
            // 1. Inspeciona o pedido antes de apagar
            const orderToDelete = await tx.order.findUnique({
                where: { id: id as string },
                include: { items: true }
            });

            if (!orderToDelete) {
                throw new Error("Pedido não encontrado.");
            }

            // 2. Se era um pedido Finalizado (DELIVERED), desfazemos os logs
            if (orderToDelete.status === 'DELIVERED') {
                // Re-estoca os ingredientes virtualmente
                await handleInventoryImpact(tx, orderToDelete.items, 'INCREMENT', orderToDelete.id);

                // Se tinha um ID próprio de CRM, abassa 1
                if (orderToDelete.clientId && orderToDelete.clientId !== 'ANONYMOUS') {
                    const client = await tx.client.findUnique({ where: { id: orderToDelete.clientId } });
                    if (client && client.totalOrders > 0) {
                        await tx.client.update({
                            where: { id: orderToDelete.clientId },
                            data: { totalOrders: { decrement: 1 } }
                        });
                    }
                }
            }

            // 3. Exclui físicamente
            await tx.order.delete({ where: { id: id as string } });

            // 4. Registra a ação
            await tx.auditLog.create({
                data: {
                    userId: user.id,
                    userName: user.name,
                    action: 'DELETE_ORDER',
                    details: `Pedido ${id} removido e estornos (se aplicáveis) processados.`
                }
            });
        });

        res.json({ message: 'Pedido removido e histórico consolidado.' });

        try {
            getIO().emit('orderStatusChanged', { action: 'delete', id });
        } catch (e) {
            console.error('Socket error emitting orderStatusChanged:', e);
        }

    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

export const updateOrderStatus = async (req: Request, res: Response) => {
    const { id } = req.params;
    const { status, driverId, user } = req.body;

    try {
        const result = await prisma.$transaction(async (tx: any) => {
            const oldOrder = await tx.order.findUnique({
                where: { id: id as string },
                include: { items: true }
            });

            const oldStatus = oldOrder?.status;
            const newStatus = status;

            // 1. Inventory Sync
            if (newStatus === 'DELIVERED' && oldStatus !== 'DELIVERED') {
                await handleInventoryImpact(tx, oldOrder.items, 'DECREMENT', id as string);

                // Reset do PIN/Sessão se for Mesa
                if (oldOrder.type === 'TABLE' && oldOrder.tableNumber) {
                    await tx.tableSession.deleteMany({
                        where: { tableNumber: oldOrder.tableNumber }
                    }).catch((e: any) => console.log('Sessão de mesa já removida ou inexistente:', e));
                }
            } else if (newStatus !== 'DELIVERED' && oldStatus === 'DELIVERED') {
                await handleInventoryImpact(tx, oldOrder.items, 'INCREMENT', id as string);
            }

            // 2. Update status and driver
            // Se driverId vier como '', seta explicitamente para null (desvincula)
            const resolvedDriverId = driverId === '' ? null : (driverId !== undefined ? driverId : undefined);

            const updateData: any = {
                status,
                driverId: resolvedDriverId
            };

            if (resolvedDriverId && resolvedDriverId !== oldOrder.driverId) {
                updateData.assignedAt = new Date();
                console.log(`[OrderController] SETTING assignedAt for order ${id} to ${updateData.assignedAt.toISOString()} (Driver: ${resolvedDriverId})`);
            } else if (resolvedDriverId === null) {
                updateData.assignedAt = null;
                console.log(`[OrderController] CLEARING assignedAt for order ${id}`);

                // Track Manual Rejection if there was a driver assigned
                if (oldOrder.driverId) {
                    await tx.orderRejection.create({
                        data: {
                            orderId: id as string,
                            driverId: oldOrder.driverId,
                            type: 'MANUAL',
                            reason: 'Motorista removeu o vínculo manualmente'
                        }
                    });
                }
            } else {
                console.log(`[OrderController] KEEPING assignedAt for order ${id} as ${oldOrder.assignedAt?.toISOString()}`);
            }

            const order = await tx.order.update({
                where: { id: id as string },
                data: updateData,
                include: { items: true }
            });

            // 3. Client Sync and Stats
            const finalClientId = await syncClientStats(tx, order, oldStatus);

            if (finalClientId !== order.clientId) {
                await tx.order.update({ where: { id: order.id }, data: { clientId: finalClientId } });
            }

            return order;
        });

        try {
            getIO().emit('orderStatusChanged', { action: 'statusUpdate', id, status });
        } catch (e) {
            console.error('Socket error emitting orderStatusChanged:', e);
        }

        res.json(mapOrderResponse(result));
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

export const updateOrderPaymentMethod = async (req: Request, res: Response) => {
    const { id } = req.params;
    const { paymentMethod, user } = req.body;

    try {
        const order = await prisma.order.update({
            where: { id: id as string },
            data: {
                paymentMethod
            },
            include: { items: true }
        });

        // Registrar na auditoria a edição do cupom
        if (user) {
            await prisma.auditLog.create({
                data: {
                    userId: user.id,
                    userName: user.name,
                    action: 'EDIT_ORDER',
                    details: `Forma de pagamento do pedido ${id} alterada para ${paymentMethod}.`
                }
            });
        }

        try {
            getIO().emit('orderStatusChanged', { action: 'paymentUpdate', id });
        } catch (e) {
            console.error('Socket error emitting orderStatusChanged:', e);
        }

        res.json(mapOrderResponse(order));
    } catch (error: any) {
        console.error('Error updating payment method:', error);
        res.status(500).json({ error: error.message });
    }
};

