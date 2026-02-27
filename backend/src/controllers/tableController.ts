import { Request, Response } from 'express';
import prisma from '../prisma';
import { getIO } from '../socket';

const mapSessionResponse = (session: any) => {
    if (!session) return null;
    return {
        ...session,
        items: (session.items || []).map((item: any) => ({
            ...item,
            uid: item.id, // Ensure frontend gets 'uid'
            observations: item.observations || null
        }))
    };
};

export const getTableSessions = async (req: Request, res: Response) => {
    const sessions = await prisma.tableSession.findMany({
        include: { items: true }
    });
    res.json(sessions.map(mapSessionResponse));
};

export const saveTableSession = async (req: Request, res: Response) => {
    const data = req.body;
    const { items, ...sessionData } = data;
    console.log('SaveTableSession Request:', { table: data.tableNumber, itemsCount: items?.length });

    try {
        let isNewItemsAdded = false;
        const result = await prisma.$transaction(async (tx) => {
            const tableNum = parseInt(data.tableNumber.toString());
            const orderId = `TABLE-${tableNum}`;

            // 1. Get existing session to check for new items (for stock deduction)
            const existingSession = await tx.tableSession.findUnique({
                where: { tableNumber: tableNum },
                include: { items: true }
            });

            // 2. Identify new items (items that don't exist in DB yet)
            // Fix: Use optional chaining or fallback to empty array
            const currentItems = items || [];
            const previousItems = existingSession?.items || [];

            const itemsToDeduct = currentItems.filter((newItem: any) =>
                !previousItems.some((oldItem: any) => oldItem.id === newItem.uid)
            );

            if (itemsToDeduct.length > 0) {
                isNewItemsAdded = true;
            }

            // 3. (REMOVIDO: Deduct Stock for new items)
            // A baixa de estoque nas mesas causava dupla-dedução ao fechar o pedido depois no PDV.
            // A baixa ocorrerá APENAS via orderController.ts -> handleInventoryImpact no momento DELIVERED.

            // 4. Clean up items to avoid primary key conflicts before re-inserting
            // We delete all items associated with this table or its corresponding order
            await tx.orderItem.deleteMany({
                where: {
                    OR: [
                        { tableSessionId: tableNum },
                        { orderId: orderId }
                    ]
                }
            });

            // 5. Ensure 'ANONYMOUS' client exists if needed
            const clientId = sessionData.clientId && sessionData.clientId !== "" ? sessionData.clientId : 'ANONYMOUS';
            const waiterId = sessionData.waiterId && sessionData.waiterId !== "" ? sessionData.waiterId : null;

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

            // 6. Ensure Kitchen Order exists (required for linking)
            const total = currentItems.reduce((acc: number, it: any) => acc + (it.price * it.quantity), 0);

            // Calculate status based on items safely
            let calculatedStatus: any = 'PREPARING';
            if (currentItems.length > 0) {
                // Ensure items without `isReady` property are treated as false
                const allItemsReady = currentItems.every((it: any) => it.isReady === true);
                const anyItemsReady = currentItems.some((it: any) => it.isReady === true);
                calculatedStatus = allItemsReady ? 'READY' : (anyItemsReady ? 'PARTIALLY_READY' : 'PREPARING');
            }

            // If table is in billing, keep its natural calculatedStatus so CRM correctly counts finalizations.

            await tx.order.upsert({
                where: { id: orderId },
                update: {
                    status: calculatedStatus,
                    total: total,
                    clientId: clientId,
                    clientName: sessionData.clientName || `Mesa ${tableNum}`,
                    clientEmail: sessionData.clientEmail || null,
                    clientDocument: sessionData.clientDocument || null,
                    waiterId: waiterId,
                    createdAt: sessionData.startTime ? new Date(sessionData.startTime) : undefined
                },
                create: {
                    id: orderId,
                    clientId: clientId,
                    clientName: sessionData.clientName || `Mesa ${tableNum}`,
                    clientEmail: sessionData.clientEmail || null,
                    clientDocument: sessionData.clientDocument || null,
                    total: total,
                    status: calculatedStatus,
                    type: 'TABLE',
                    tableNumber: tableNum,
                    waiterId: waiterId,
                    isOriginDigitalMenu: sessionData.isOriginDigitalMenu || false, // Fix: Propagate origin into standard Order DB
                    createdAt: sessionData.startTime ? new Date(sessionData.startTime) : undefined
                }
            });

            // 7. Upsert TableSession with Linked Items
            const session = await tx.tableSession.upsert({
                where: { tableNumber: tableNum },
                update: {
                    ...sessionData,
                    clientId: clientId === 'ANONYMOUS' ? null : clientId, // TableSession allows null clientId
                    waiterId: waiterId,
                    items: {
                        create: currentItems.map((item: any) => ({
                            id: item.uid,
                            productId: item.productId,
                            quantity: item.quantity,
                            price: item.price,
                            isReady: item.isReady || false,
                            readyAt: item.readyAt ? new Date(item.readyAt) : null,
                            observations: item.observations || null,
                            orderId: orderId // Link to Kitchen Order
                        }))
                    }
                },
                create: {
                    ...sessionData,
                    tableNumber: tableNum,
                    items: {
                        create: currentItems.map((item: any) => ({
                            id: item.uid,
                            productId: item.productId,
                            quantity: item.quantity,
                            price: item.price,
                            isReady: item.isReady || false,
                            readyAt: item.readyAt ? new Date(item.readyAt) : null,
                            observations: item.observations || null,
                            orderId: orderId // Link to Kitchen Order
                        }))
                    }
                },
                include: { items: true }
            });

            return session;
        });

        if (isNewItemsAdded) {
            try {
                getIO().emit('newOrder', { action: 'refresh', tableNumber: data.tableNumber, type: 'TABLE' });
            } catch (e) {
                console.error('Socket error emitting newOrder:', e);
            }
        }

        try {
            getIO().emit('tableStatusChanged', { tableNumber: data.tableNumber });

            const { rejection } = req.query;
            if (rejection === 'true') {
                getIO().emit('digitalOrderCancelled', {
                    tableNumber: data.tableNumber,
                    message: "Esse pedido foi cancelado. Qualquer dúvida falar com o Garçom Responsável."
                });
            }
        } catch (e) {
            console.error('Socket error emitting messages:', e);
        }

        res.json(mapSessionResponse(result));
    } catch (error: any) {
        console.error('Error saving table session:', error);
        res.status(500).json({
            error: error.message,
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
};

export const deleteTableSession = async (req: Request, res: Response) => {
    const { tableNumber } = req.params;
    const { cancellation } = req.query;
    const tableNum = parseInt(tableNumber as string);

    // Buscar sessão antes de deletar para saber se era digital
    const session = await prisma.tableSession.findUnique({ where: { tableNumber: tableNum } });

    await prisma.tableSession.delete({ where: { tableNumber: tableNum } });

    try {
        getIO().emit('tableStatusChanged', { tableNumber: tableNum });

        if (cancellation === 'true' && session?.isOriginDigitalMenu) {
            getIO().emit('digitalOrderCancelled', {
                tableNumber: tableNum,
                message: "Esse pedido foi cancelado. Qualquer dúvida falar com o Garçom Responsável."
            });
        }
    } catch (e) {
        console.error('Socket error emitting tableStatusChanged:', e);
    }

    res.json({ message: 'Sessão de mesa finalizada' });
};
