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
    // Sanitizar dados: remover campos virtuais do frontend (ex: isSoftRejected) antes de passar para o Prisma
    const { items, isSoftRejected, ...sessionData } = data;
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

            if (itemsToDeduct.some((it: any) => !it.isReady)) {
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

            // Aqui aplicamos a mesma fix do Cardápio Digital: Se uma mesa existia como "available"
            // (ex: QR code lido cedo), mas o garçom está lançando o primeiro item agora no painel,
            // ou se for a transição de zero itens para n itens, nós forçamos a data real de início do pedido.
            const isFirstRealOrder = existingSession?.status === 'available' || (!existingSession?.items?.length && currentItems.length > 0);
            const actualStartTime = isFirstRealOrder ? new Date() : (sessionData.startTime ? new Date(sessionData.startTime) : undefined);

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
                    digitalPin: sessionData.pin || existingSession?.pin || null,
                    digitalToken: sessionData.sessionToken || existingSession?.sessionToken || null,
                    createdAt: actualStartTime
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
                    digitalPin: sessionData.pin || existingSession?.pin || null,
                    digitalToken: sessionData.sessionToken || existingSession?.sessionToken || null,
                    createdAt: actualStartTime
                }
            });

            // 7. Upsert TableSession with Linked Items
            const session = await tx.tableSession.upsert({
                where: { tableNumber: tableNum },
                update: {
                    ...sessionData,
                    startTime: actualStartTime,
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
                    startTime: actualStartTime,
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
            const { rejection } = req.query;
            const rejectionMessage = rejection === 'true' ? "Procure o Garçom, seu pedido foi Rejeitado!" : undefined;

            if (rejectionMessage) {
                console.log(`[SOCKET] Persisting Rejection for table ${data.tableNumber}`);
                // Em vez de apenas emitir, gravamos no banco (campo oculto)
                await prisma.tableSession.update({
                    where: { tableNumber: Number(data.tableNumber) },
                    data: {
                        hasPendingDigital: true,
                        pendingReviewItems: JSON.stringify({ rejection: rejectionMessage })
                    }
                });

                getIO().emit('digitalOrderCancelled', {
                    tableNumber: Number(data.tableNumber),
                    message: rejectionMessage
                });
            }

            console.log(`[SOCKET] Emitting tableStatusChanged (${data.status || 'occupied'}) for table ${data.tableNumber}`);
            getIO().emit('tableStatusChanged', {
                tableNumber: Number(data.tableNumber),
                status: data.status || 'occupied',
                action: 'refresh',
                rejectionMessage: rejectionMessage,
                sessionToken: result.sessionToken
            });
        } catch (e) {
            console.error('Socket error emitting messages:', e);
        }

        try {
            // Notificar o cardápio digital se o status calculado (baseado nos itens) for pronto/parcialmente pronto
            // Reaproveitamos a lógica de cálculo de status baseada nos itens da sessão
            const sessionItems = result.items || [];
            if (sessionItems.length > 0) {
                const allReady = sessionItems.every((it: any) => it.isReady === true);
                const anyReady = sessionItems.some((it: any) => it.isReady === true);
                const calculatedStatus = allReady ? 'READY' : (anyReady ? 'PARTIALLY_READY' : 'PREPARING');

                if (calculatedStatus === 'READY' || calculatedStatus === 'PARTIALLY_READY') {
                    getIO().to(`table_${result.tableNumber}`).emit('orderStatusUpdated', {
                        tableNumber: result.tableNumber,
                        status: calculatedStatus,
                        message: "Pedido Pronto na Cozinha, só mais um instante e você será servido!"
                    });
                }
            }
        } catch (e) {
            console.error('Socket error emitting orderStatusUpdated from saveTableSession:', e);
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

    try {
        const rejectionMessage = cancellation === 'true' ? "Procure o Garçom, seu pedido foi Rejeitado!" : undefined;

        if (rejectionMessage) {
            console.log(`[SOCKET] Soft-Deleting and Persisting Rejection for table ${tableNum}`);
            // Em vez de deletar, transformamos em uma "sessão de rejeição"
            await prisma.tableSession.update({
                where: { tableNumber: tableNum },
                data: {
                    status: 'available', // Mesa fica disponível no PDV
                    hasPendingDigital: true,
                    pendingReviewItems: JSON.stringify({ rejection: rejectionMessage })
                }
            });

            getIO().emit('digitalOrderCancelled', {
                tableNumber: Number(tableNum),
                message: rejectionMessage
            });
        } else {
            // Deleção real (pagamento ou limpeza manual sem rejeição)
            await prisma.tableSession.deleteMany({ where: { tableNumber: tableNum } });
        }

        console.log(`[SOCKET] Emitting tableStatusChanged (available) for table ${tableNum}`);
        getIO().emit('tableStatusChanged', {
            tableNumber: Number(tableNum),
            status: 'available',
            action: 'refresh',
            rejectionMessage: rejectionMessage,
            sessionToken: session?.sessionToken || null,
            pin: session?.pin || null
        });
    } catch (e) {
        console.error('Socket error emitting tableStatusChanged:', e);
    }

    res.json({ message: 'Sessão de mesa finalizada' });
};
export const transferTableSession = async (req: Request, res: Response) => {
    const { from, to, waiterId } = req.body;
    const fromTable = parseInt(from.toString());
    const toTable = parseInt(to.toString());

    try {
        await prisma.$transaction(async (tx) => {
            const sourceSession = await tx.tableSession.findUnique({
                where: { tableNumber: fromTable },
                include: { items: true }
            });

            if (!sourceSession) {
                throw new Error('Mesa de origem não encontrada ou vazia');
            }

            // Regra de Negócio: Somente o garçom responsável pode transferir
            if (waiterId && sourceSession.waiterId && sourceSession.waiterId !== waiterId) {
                throw new Error('Apenas o garçom responsável por esta mesa pode transferi-lá.');
            }

            const targetSession = await tx.tableSession.findUnique({
                where: { tableNumber: toTable }
            });

            if (targetSession && targetSession.status !== 'available') {
                throw new Error('Mesa de destino já está ocupada');
            }

            const fromOrderId = `TABLE-${fromTable}`;
            const toOrderId = `TABLE-${toTable}`;

            // Check if there's any existing order at the target to avoid conflicts
            const existingToOrder = await tx.order.findUnique({ where: { id: toOrderId } });
            if (existingToOrder) {
                await tx.order.delete({ where: { id: toOrderId } });
            }

            // A mesa de ORIGEM será deletada e recriada no DESTINO para evitar erro de PK.
            // Sanitizar dados: remover 'items' e 'tableNumber' do objeto spread
            const { tableNumber: _tn, items: _items, ...sessionData } = sourceSession;

            // 1. Limpar destino completamente para evitar conflitos
            // Se já houver um pedido no destino (mesmo que fantasma), removemos
            await tx.orderItem.deleteMany({ where: { orderId: toOrderId } });
            await tx.order.deleteMany({ where: { id: toOrderId } });
            await tx.tableSession.deleteMany({ where: { tableNumber: toTable } });

            // 2. Criar nova sessão no destino com os itens novos
            await tx.tableSession.create({
                data: {
                    ...sessionData,
                    tableNumber: toTable,
                    items: {
                        create: sourceSession.items.map(item => ({
                            productId: item.productId,
                            quantity: item.quantity,
                            price: item.price,
                            isReady: item.isReady,
                            readyAt: item.readyAt,
                            observations: item.observations,
                            orderId: toOrderId
                        }))
                    }
                }
            });

            // 3. Mover o Pedido (Order)
            const order = await tx.order.findUnique({ where: { id: fromOrderId } });
            if (order) {
                const { id: _oldId, ...orderData } = order;
                await tx.order.create({
                    data: {
                        ...orderData,
                        id: toOrderId,
                        tableNumber: toTable
                    }
                });
            }

            // 4. Deletar mesa de origem (cascade cuidará dos items órfãos se houver, mas garantimos)
            await tx.orderItem.deleteMany({ where: { tableSessionId: fromTable } });
            await tx.order.deleteMany({ where: { id: fromOrderId } });
            await tx.tableSession.delete({ where: { tableNumber: fromTable } });
        });

        // Notify via sockets
        try {
            getIO().emit('tableStatusChanged', { tableNumber: fromTable, status: 'available', action: 'refresh' });
            getIO().emit('tableStatusChanged', { tableNumber: toTable, status: 'occupied', action: 'refresh' });
        } catch (e) {
            console.error('Socket error during transfer:', e);
        }

        res.json({ message: `Mesa ${fromTable} transferida para ${toTable} com sucesso` });
    } catch (error: any) {
        console.error('Error transferring table:', error);
        res.status(500).json({ error: error.message });
    }
};
export const requestCheckout = async (req: Request, res: Response) => {
    const { tableNumber } = req.params;
    const tableNum = parseInt(tableNumber as string);

    try {
        const session = await prisma.tableSession.update({
            where: { tableNumber: tableNum },
            data: { status: 'billing' }
        });

        // Notify via sockets
        getIO().emit('tableStatusChanged', {
            tableNumber: tableNum,
            status: 'billing',
            action: 'refresh'
        });

        res.json({ message: `Pedido de fechamento da mesa ${tableNum} enviado`, session });
    } catch (error: any) {
        console.error('Error requesting checkout:', error);
        res.status(500).json({ error: error.message });
    }
};
