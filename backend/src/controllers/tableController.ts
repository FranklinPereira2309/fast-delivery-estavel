import { Request, Response } from 'express';
import prisma from '../prisma';

const mapSessionResponse = (session: any) => {
    if (!session) return null;
    return {
        ...session,
        items: (session.items || []).map((item: any) => ({
            ...item,
            uid: item.id // Ensure frontend gets 'uid'
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

            // 3. Deduct Stock for new items
            for (const item of itemsToDeduct) {
                const product = await tx.product.findUnique({
                    where: { id: item.productId },
                    include: { recipe: true }
                });

                if (product?.recipe) {
                    for (const r of product.recipe) {
                        await tx.inventoryItem.update({
                            where: { id: r.inventoryItemId },
                            data: {
                                quantity: {
                                    decrement: r.quantity * item.quantity * r.wasteFactor
                                }
                            }
                        });
                    }
                }
            }

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

            // Calculate status based on items
            const allItemsReady = currentItems.length > 0 && currentItems.every((it: any) => it.isReady);
            const anyItemsReady = currentItems.some((it: any) => it.isReady);
            let calculatedStatus: any = allItemsReady ? 'READY' : (anyItemsReady ? 'PARTIALLY_READY' : 'PREPARING');

            // If table is in billing, keep its natural calculatedStatus so CRM correctly counts finalizations.

            await tx.order.upsert({
                where: { id: orderId },
                update: {
                    status: calculatedStatus,
                    total: total,
                    clientId: clientId,
                    waiterId: waiterId
                },
                create: {
                    id: orderId,
                    clientId: clientId,
                    clientName: sessionData.clientName || `Mesa ${tableNum}`,
                    total: total,
                    status: calculatedStatus,
                    type: 'TABLE',
                    tableNumber: tableNum,
                    waiterId: waiterId
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
                            isReady: item.isReady,
                            readyAt: item.readyAt ? new Date(item.readyAt) : null,
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
                            isReady: item.isReady,
                            readyAt: item.readyAt ? new Date(item.readyAt) : null,
                            orderId: orderId // Link to Kitchen Order
                        }))
                    }
                },
                include: { items: true }
            });

            return session;
        });

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
    await prisma.tableSession.delete({ where: { tableNumber: parseInt(tableNumber as string) } });
    res.json({ message: 'Sessão de mesa finalizada' });
};
