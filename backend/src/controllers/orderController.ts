import { Request, Response } from 'express';
import prisma from '../prisma';

const mapOrderResponse = (order: any) => {
    if (!order) return null;
    return {
        ...order,
        items: (order.items || []).map((item: any) => ({
            ...item,
            uid: item.id, // Ensure frontend gets 'uid'
            observations: item.observations || null
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

const handleInventoryImpact = async (tx: any, items: any[], type: 'DECREMENT' | 'INCREMENT') => {
    for (const item of items) {
        const product = await tx.product.findUnique({
            where: { id: item.productId },
            include: { recipe: { include: { inventoryItem: true } } }
        });

        if (product?.recipe) {
            for (const r of product.recipe) {
                await tx.inventoryItem.update({
                    where: { id: r.inventoryItemId },
                    data: {
                        quantity: type === 'DECREMENT'
                            ? { decrement: r.quantity * item.quantity * r.wasteFactor }
                            : { increment: r.quantity * item.quantity * r.wasteFactor }
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
        const result = await prisma.$transaction(async (tx: any) => {
            const existingOrder = await tx.order.findUnique({
                where: { id: order.id },
                include: { items: true }
            });

            const oldStatus = existingOrder?.status;
            const newStatus = order.status;

            // 1. Inventory Sync (Only on Finalization or Reversion)
            const itemsForInventory = order.items; // Use current items for stock calculation
            if (newStatus === 'DELIVERED' && oldStatus !== 'DELIVERED') {
                await handleInventoryImpact(tx, itemsForInventory, 'DECREMENT');
            } else if (newStatus !== 'DELIVERED' && oldStatus === 'DELIVERED') {
                await handleInventoryImpact(tx, itemsForInventory, 'INCREMENT');
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
                    waiterId: waiterId,
                    total: order.total,
                    isOriginDigitalMenu: order.isOriginDigitalMenu !== undefined ? order.isOriginDigitalMenu : false, // Fix: Preserve Origin into Update
                    items: {
                        deleteMany: {},
                        create: order.items.map((item: any) => ({
                            id: item.uid,
                            productId: item.productId,
                            quantity: item.quantity,
                            price: item.price,
                            isReady: item.isReady || false,
                            readyAt: item.readyAt ? new Date(item.readyAt) : null,
                            observations: item.observations || null
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
                    status: order.status,
                    type: order.type,
                    paymentMethod: order.paymentMethod,
                    driverId: driverId,
                    tableNumber: order.tableNumber,
                    waiterId: waiterId,
                    isOriginDigitalMenu: order.isOriginDigitalMenu !== undefined ? order.isOriginDigitalMenu : false, // Fix: Preserve Origin into Creation
                    items: {
                        create: order.items.map((item: any) => ({
                            id: item.uid,
                            productId: item.productId,
                            quantity: item.quantity,
                            price: item.price,
                            isReady: item.isReady || false,
                            readyAt: item.readyAt ? new Date(item.readyAt) : null,
                            observations: item.observations || null
                        }))
                    }
                },
                include: { items: true }
            });
        });

        res.json(mapOrderResponse(result));
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

export const deleteOrder = async (req: Request, res: Response) => {
    const { id } = req.params;
    const { user } = req.body;

    try {
        await prisma.order.delete({ where: { id: id as string } });

        await prisma.auditLog.create({
            data: {
                userId: user.id,
                userName: user.name,
                action: 'DELETE_ORDER',
                details: `Pedido ${id} removido.`
            }
        });

        res.json({ message: 'Pedido removido' });
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
                await handleInventoryImpact(tx, oldOrder.items, 'DECREMENT');
            } else if (newStatus !== 'DELIVERED' && oldStatus === 'DELIVERED') {
                await handleInventoryImpact(tx, oldOrder.items, 'INCREMENT');
            }

            // 2. Update status and driver
            const order = await tx.order.update({
                where: { id: id as string },
                data: {
                    status,
                    driverId: driverId || undefined
                },
                include: { items: true }
            });

            // 3. Client Sync and Stats
            const finalClientId = await syncClientStats(tx, order, oldStatus);

            if (finalClientId !== order.clientId) {
                await tx.order.update({ where: { id: order.id }, data: { clientId: finalClientId } });
            }

            return order;
        });

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

        res.json(mapOrderResponse(order));
    } catch (error: any) {
        console.error('Error updating payment method:', error);
        res.status(500).json({ error: error.message });
    }
};

