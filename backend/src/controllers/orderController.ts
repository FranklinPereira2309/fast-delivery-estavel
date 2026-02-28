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

export const getOrderById = async (req: Request, res: Response) => {
    const id = req.params.id as string;
    try {
        const order = await prisma.order.findUnique({
            where: { id },
            include: { items: true }
        });
        if (!order) return res.status(404).json({ error: 'Pedido não encontrado' });
        res.json(mapOrderResponse(order));
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

const syncClientStats = async (tx: any, order: any, oldStatus?: string) => {
    const isNewFinalization = order.status === 'DELIVERED' && oldStatus !== 'DELIVERED';
    const isReverting = order.status !== 'DELIVERED' && oldStatus === 'DELIVERED';
    let finalClientId = order.clientId;

    // 1. Handle Auto-Registration for Avulso Clients
    if (isNewFinalization && (order.clientId === 'ANONYMOUS' || !order.clientId) && order.clientPhone && order.clientPhone !== '0000000000') {
        const safePhone = order.clientPhone.toString();
        let client = await tx.client.findFirst({
            where: { phone: safePhone }
        });

        if (!client) {
            client = await tx.client.create({
                data: {
                    name: order.clientName || 'Consumidor Avulso',
                    phone: safePhone,
                    email: order.clientEmail || null,
                    document: order.clientDocument || null,
                    addresses: [order.clientAddress?.toString() || 'S/ Endereço'],
                    totalOrders: 0
                }
            });
        }
        finalClientId = client.id;
    }

    // 2. Increment on Finalization
    if (isNewFinalization && finalClientId && finalClientId !== 'ANONYMOUS') {
        try {
            await tx.client.update({
                where: { id: finalClientId },
                data: {
                    totalOrders: { increment: 1 },
                    lastOrderDate: new Date().toLocaleDateString('pt-BR')
                }
            });
        } catch (e) {
            console.error('Erro ao atualizar estatísticas do cliente:', e);
            // Ignora erro de estatística para não travar o pedido
        }
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
                const q = parseFloat(r.quantity?.toString() || '0');
                const iq = parseFloat(item.quantity?.toString() || '0');
                const wf = parseFloat(r.wasteFactor?.toString() || '1');
                const quantityToChange = isNaN(q * iq * wf) ? 0 : (q * iq * wf);

                if (quantityToChange === 0) continue;

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

    if (!order) {
        console.error('Invalid order save request: order object is missing', req.body);
        return res.status(400).json({ error: 'Pedido não informado no corpo da requisição.' });
    }

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
            const tableNumIdx = order.tableNumber ? parseInt(order.tableNumber as string) : null;
            const deliveryFeeNum = (order.deliveryFee !== null && order.deliveryFee !== undefined) ? parseFloat(order.deliveryFee.toString()) : 0;
            const totalNum = (order.total !== null && order.total !== undefined) ? parseFloat(order.total.toString()) : 0;

            // 1. Inventory Sync & Historical Record Archival (Only on Finalization or Reversion)
            const itemsForInventory = order.items; // Use current items for stock calculation
            let orderIdToSave = order.id;

            if (newStatus === 'DELIVERED' && oldStatus !== 'DELIVERED') {
                await handleInventoryImpact(tx, itemsForInventory, 'DECREMENT', order.id);

                // Reset do PIN/Sessão se for Mesa
                if (order.type === 'TABLE' && tableNumIdx !== null && !isNaN(tableNumIdx)) {
                    await tx.tableSession.deleteMany({
                        where: { tableNumber: tableNumIdx }
                    }).catch((e: any) => console.log('Sessão de mesa já removida ou inexistente:', e));

                    // Notificar o cardápio digital que o pagamento foi concluído (mesa liberada)
                    getIO().emit('tableStatusChanged', {
                        tableNumber: tableNumIdx,
                        status: 'available',
                        action: 'refresh'
                    });

                    // Modificação: Em vez de atualizar o registro TABLE-X infinitamente (o que destrói o histórico de vendas),
                    // quando a mesa paga a conta e vira DELIVERED, nós a RENOMEAMOS para um ID único no banco.
                    // Isso "arquiva" este pedido finalizado no Monitor de Vendas.
                    // Removendo o antigo `TABLE-X` e criando um novo com o histórico preservado.
                    if (existingOrder && existingOrder.id === `TABLE-${tableNumIdx}`) {
                        const finalId = `TABLE-${tableNumIdx}-F-${Date.now()}`;
                        orderIdToSave = finalId;

                        // Temos que remover o rascunho temporário do "TABLE-X" porque o Prisma faria o upsert na primary key
                        // Nós deletamos o registro rascunho da mesa, liberando a chave para o próximo cliente.
                        // O novo ID 'TABLE-X-F-1234' será criado pelo `upsert` no bloco abaixo.
                        await tx.orderItem.deleteMany({ where: { orderId: existingOrder.id } });
                        await tx.order.delete({ where: { id: existingOrder.id } }).catch(() => { });
                    }
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

            // Capture digital session info if available
            if (tableNumIdx !== null) {
                const tableSess = await tx.tableSession.findUnique({ where: { tableNumber: tableNumIdx } });
                if (tableSess) {
                    order.digitalPin = tableSess.pin;
                    order.digitalToken = tableSess.sessionToken;
                }
            }

            // 3. Upsert Order
            return await tx.order.upsert({
                where: { id: orderIdToSave },
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
                    total: totalNum,
                    deliveryFee: deliveryFeeNum,
                    clientEmail: order.clientEmail || null,
                    clientDocument: order.clientDocument || null,
                    isOriginDigitalMenu: order.isOriginDigitalMenu !== undefined ? order.isOriginDigitalMenu : false, // Fix: Preserve Origin into Update
                    nfeStatus: order.nfeStatus || null,
                    nfeNumber: order.nfeNumber || null,
                    nfeUrl: order.nfeUrl || null,
                    nfeError: order.nfeError || null,
                    splitAmount1: (order.splitAmount1 !== null && order.splitAmount1 !== undefined) ? parseFloat(order.splitAmount1.toString()) : null,
                    appliedServiceFee: (order.appliedServiceFee !== null && order.appliedServiceFee !== undefined) ? parseFloat(order.appliedServiceFee.toString()) : null,
                    digitalPin: order.digitalPin || null,
                    digitalToken: order.digitalToken || null,
                    mpPreferenceId: order.mpPreferenceId !== undefined ? order.mpPreferenceId : undefined,
                    mpPaymentId: order.mpPaymentId !== undefined ? order.mpPaymentId : undefined,
                    paymentStatus: order.paymentStatus !== undefined ? order.paymentStatus : undefined,
                    items: {
                        deleteMany: {},
                        create: (order.items || []).map((item: any) => ({
                            id: item.uid || item.id,
                            productId: item.productId,
                            quantity: (item.quantity && !isNaN(parseFloat(item.quantity.toString()))) ? Math.round(parseFloat(item.quantity.toString())) : 0,
                            price: (item.price && !isNaN(parseFloat(item.price.toString()))) ? parseFloat(item.price.toString()) : 0,
                            isReady: !!item.isReady,
                            readyAt: (item.readyAt && !isNaN(Date.parse(item.readyAt))) ? new Date(item.readyAt) : null,
                            observations: item.observations || null,
                            tableSessionId: (newStatus === 'DELIVERED') ? null : ((item.tableSessionId && !isNaN(parseInt(item.tableSessionId.toString()))) ? parseInt(item.tableSessionId.toString()) : null)
                        }))
                    }
                },
                create: {
                    id: orderIdToSave,
                    clientId: order.clientId,
                    clientName: order.clientName,
                    clientAddress: order.clientAddress,
                    clientPhone: order.clientPhone,
                    total: totalNum,
                    deliveryFee: deliveryFeeNum,
                    status: order.status,
                    type: order.type,
                    paymentMethod: order.paymentMethod,
                    driverId: driverId,
                    assignedAt: driverId ? new Date() : null,
                    tableNumber: tableNumIdx,
                    waiterId: waiterId,
                    clientEmail: order.clientEmail || null,
                    clientDocument: order.clientDocument || null,
                    isOriginDigitalMenu: order.isOriginDigitalMenu !== undefined ? order.isOriginDigitalMenu : false,
                    createdAt: (order.createdAt && !isNaN(Date.parse(order.createdAt))) ? new Date(order.createdAt) : new Date(),
                    nfeStatus: order.nfeStatus || null,
                    nfeNumber: order.nfeNumber || null,
                    nfeUrl: order.nfeUrl || null,
                    nfeError: order.nfeError || null,
                    splitAmount1: (order.splitAmount1 !== null && order.splitAmount1 !== undefined) ? parseFloat(order.splitAmount1.toString()) : null,
                    appliedServiceFee: (order.appliedServiceFee !== null && order.appliedServiceFee !== undefined) ? parseFloat(order.appliedServiceFee.toString()) : null,
                    digitalPin: order.digitalPin || null,
                    digitalToken: order.digitalToken || null,
                    mpPreferenceId: order.mpPreferenceId || null,
                    mpPaymentId: order.mpPaymentId || null,
                    paymentStatus: order.paymentStatus || 'PENDING',
                    items: {
                        create: (order.items || []).map((item: any) => ({
                            id: item.uid || item.id,
                            productId: item.productId,
                            quantity: (item.quantity && !isNaN(parseFloat(item.quantity.toString()))) ? Math.round(parseFloat(item.quantity.toString())) : 0,
                            price: (item.price && !isNaN(parseFloat(item.price.toString()))) ? parseFloat(item.price.toString()) : 0,
                            isReady: !!item.isReady,
                            readyAt: (item.readyAt && !isNaN(Date.parse(item.readyAt))) ? new Date(item.readyAt) : null,
                            observations: item.observations || null,
                            tableSessionId: (newStatus === 'DELIVERED') ? null : ((item.tableSessionId && !isNaN(parseInt(item.tableSessionId.toString()))) ? parseInt(item.tableSessionId.toString()) : null)
                        }))
                    }
                },
                include: { items: true }
            });
        });

        // 4. Receivable Fiado Processing
        if (result.status === 'DELIVERED' && result.paymentMethod === 'FIADO') {
            if (!result.clientId || result.clientId === 'ANONYMOUS') {
                console.warn('Cannot create Receivable for ANONYMOUS client on Order:', result.id);
            } else {
                const dueDate = new Date();
                dueDate.setDate(dueDate.getDate() + 30); // Default 30 days

                await prisma.receivable.upsert({
                    where: { id: `REC-${result.id}` },
                    update: { amount: result.total },
                    create: {
                        id: `REC-${result.id}`,
                        clientId: result.clientId,
                        orderId: result.id,
                        amount: result.total,
                        dueDate: dueDate,
                        status: 'PENDING'
                    }
                }).catch(e => console.error('Error auto-creating FIADO receivable:', e));
            }
        }

        if (isNewItemsAdded) {
            try {
                const tableNumIdx = order.tableNumber ? parseInt(order.tableNumber as string) : null;
                getIO().emit('newOrder', { action: 'refresh', id: order.id, type: order.type, tableNumber: tableNumIdx });
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
    const id = req.params.id as string;
    const { user, reason } = req.body;

    let orderDeleted: any = null;

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

            orderDeleted = orderToDelete;

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

            // Se for pedido vindo do menu digital, avisar o cliente
            if (orderDeleted && orderDeleted.isOriginDigitalMenu && orderDeleted.tableNumber) {
                getIO().emit('digitalOrderCancelled', {
                    tableNumber: orderDeleted.tableNumber,
                    message: reason || "Pedido Cancelado, dúvidas pergunte ao Garçom"
                });
            }
        } catch (e) {
            console.error('Socket error emitting orderStatusChanged:', e);
        }

    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

export const updateOrderStatus = async (req: Request, res: Response) => {
    const id = req.params.id as string;
    const { status, driverId, user, paymentMethod } = req.body;

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

                    // Notificar o cardápio digital que o pagamento foi concluído (mesa liberada)
                    getIO().emit('tableStatusChanged', {
                        tableNumber: oldOrder.tableNumber,
                        status: 'available',
                        action: 'refresh'
                    });
                }
            } else if (newStatus !== 'DELIVERED' && oldStatus === 'DELIVERED') {
                await handleInventoryImpact(tx, oldOrder.items, 'INCREMENT', id as string);
            }

            // 2. Update status and driver
            // Se driverId vier como '', seta explicitamente para null (desvincula)
            const resolvedDriverId = driverId === '' ? null : (driverId !== undefined ? driverId : undefined);

            const updateData: any = {
                status,
                driverId: resolvedDriverId,
                paymentMethod: paymentMethod !== undefined ? paymentMethod : undefined
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

            // Restore Table Session if reopening
            if (oldStatus === 'DELIVERED' && newStatus !== 'DELIVERED' && oldOrder.type === 'TABLE' && oldOrder.tableNumber) {
                if (oldOrder.digitalPin && oldOrder.digitalToken) {
                    await tx.tableSession.upsert({
                        where: { tableNumber: oldOrder.tableNumber },
                        create: {
                            tableNumber: oldOrder.tableNumber,
                            status: 'occupied',
                            clientId: oldOrder.clientId === 'ANONYMOUS' ? null : oldOrder.clientId,
                            clientName: oldOrder.clientName,
                            pin: oldOrder.digitalPin,
                            sessionToken: oldOrder.digitalToken,
                            isOriginDigitalMenu: oldOrder.isOriginDigitalMenu
                        },
                        update: {
                            status: 'occupied',
                            pin: oldOrder.digitalPin,
                            sessionToken: oldOrder.digitalToken
                        }
                    }).catch((e: any) => console.error('Erro ao restaurar sessão de mesa:', e));

                    // Notificar cardápio digital
                    getIO().emit('tableStatusChanged', {
                        tableNumber: oldOrder.tableNumber,
                        status: 'occupied',
                        action: 'refresh'
                    });
                }
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

            // 4. Receivable Fiado Processing for Status Changes (Delivery App Confirmation)
            if (newStatus === 'DELIVERED' && (paymentMethod === 'FIADO' || oldOrder.paymentMethod === 'FIADO')) {
                const realClientId = finalClientId || order.clientId;
                if (realClientId && realClientId !== 'ANONYMOUS') {
                    const dueDate = new Date();
                    dueDate.setDate(dueDate.getDate() + 30);

                    await tx.receivable.upsert({
                        where: { id: `REC-${order.id}` },
                        update: { amount: order.total },
                        create: {
                            id: `REC-${order.id}`,
                            clientId: realClientId,
                            orderId: order.id,
                            amount: order.total,
                            dueDate: dueDate,
                            status: 'PENDING'
                        }
                    });
                }
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

export const updateOrderItems = async (req: Request, res: Response) => {
    const id = req.params.id as string;
    const { items, user } = req.body;

    try {
        const result = await prisma.$transaction(async (tx: any) => {
            const order = await tx.order.findUnique({
                where: { id },
                include: { items: true }
            });

            if (!order) throw new Error('Pedido não encontrado');

            // Restriction: Block Delivery orders already DELIVERED
            if (['OWN_DELIVERY', 'APP_DELIVERY'].includes(order.type) && order.status === 'DELIVERED') {
                throw new Error('Não é permitido editar itens de entregas Delivery já concluídas.');
            }

            // 1. Return old items to inventory
            await handleInventoryImpact(tx, order.items, 'INCREMENT', id);

            // 2. Calculate new total
            const newTotal = items.reduce((sum: number, item: any) => sum + (parseFloat(item.price) * parseFloat(item.quantity)), 0) + (order.deliveryFee || 0);

            // 3. Update order items and total
            const updatedOrder = await tx.order.update({
                where: { id },
                data: {
                    total: newTotal,
                    items: {
                        deleteMany: {},
                        create: items.map((item: any) => ({
                            id: `item-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                            productId: item.productId,
                            quantity: Math.round(parseFloat(item.quantity)),
                            price: parseFloat(item.price),
                            observations: item.observations || null
                        }))
                    }
                },
                include: { items: true }
            });

            // 4. Subtract new items from inventory
            await handleInventoryImpact(tx, updatedOrder.items, 'DECREMENT', id);

            // 5. Update associated Receivable if it exists
            await tx.receivable.updateMany({
                where: { orderId: id },
                data: { amount: newTotal }
            });

            // 6. Audit Log
            if (user) {
                await tx.auditLog.create({
                    data: {
                        userId: user.id,
                        userName: user.name,
                        action: 'EDIT_ORDER_ITEMS',
                        details: `Itens do pedido ${id} alterados. Novo total: R$ ${newTotal.toFixed(2)}`
                    }
                });
            }

            return updatedOrder;
        });

        getIO().emit('orderStatusChanged', { action: 'refresh', id });
        res.json(mapOrderResponse(result));
    } catch (error: any) {
        console.error('Error updating order items:', error);
        res.status(500).json({ error: error.message });
    }
};

export const updateOrderPaymentMethod = async (req: Request, res: Response) => {
    const id = req.params.id as string;
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


