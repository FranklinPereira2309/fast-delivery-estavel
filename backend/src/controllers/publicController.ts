import { Request, Response } from 'express';
import { getIO } from '../socket';
import { getStoreStatus } from '../storeStatusCache';
import prisma from '../prisma';
import crypto from 'crypto';

export const getStoreStatusEndpoint = (req: Request, res: Response) => {
    res.json(getStoreStatus());
};

export const getProducts = async (req: Request, res: Response) => {
    try {
        const products = await prisma.product.findMany();
        // Em uma aplicação real, aqui filtraríamos apenas produtos com `active: true` 
        // ou se houvesse uma flag no banco indicando que o produto está ativo no cardápio digital.
        // Como o schema atual não tem essa flag, vamos retornar todos que tenham estoque ou preço > 0.
        res.json(products);
    } catch (error) {
        console.error('Error fetching public products:', error);
        res.status(500).json({ message: 'Error fetching products' });
    }
};

export const verifyTable = async (req: Request, res: Response) => {
    const id = req.params.id as string;
    const tableNumber = parseInt(id as string);
    const token = req.headers.authorization?.replace('Bearer ', '');

    if (isNaN(tableNumber)) {
        return res.status(400).json({ message: 'Invalid table number' });
    }

    try {
        // 1. Verifica se a mesa existe nas configurações
        const settings = await prisma.businessSettings.findFirst();
        if (!settings || tableNumber < 1 || tableNumber > settings.tableCount) {
            return res.status(404).json({ message: 'Mesa não encontrada' });
        }

        // 2. Busca a sessão atual da mesa
        let session = await prisma.tableSession.findUnique({
            where: { tableNumber }
        });

        // 3. EXTRAÇÃO DE REJEIÇÃO (Prioridade Máxima para o Soft-Reject)
        let rejectionMessage = null;
        if (session?.pendingReviewItems) {
            try {
                const parsed = JSON.parse(session.pendingReviewItems);
                if (parsed && typeof parsed === 'object' && !Array.isArray(parsed) && parsed.rejection) {
                    rejectionMessage = parsed.rejection;
                }
            } catch (e) {
                if (session.pendingReviewItems.startsWith('REJECTED:')) {
                    rejectionMessage = session.pendingReviewItems.replace('REJECTED:', '');
                }
            }
        }

        // Se houver rejeição, retornamos ela imediatamente, bloqueando o fluxo normal
        if (rejectionMessage) {
            return res.json({
                tableNumber,
                status: session?.status || 'available',
                clientName: session?.clientName || null,
                pin: session?.pin,
                isOwner: session?.sessionToken === token,
                rejectionMessage: rejectionMessage
            });
        }

        // 4. Se a mesa estiver disponível (ou não houver sessão), criamos uma nova com PIN
        if (!session || session.status === 'available') {
            const pinToSet = session?.pin || Math.floor(1000 + Math.random() * 9000).toString();
            const tokenToSet = session?.sessionToken || crypto.randomBytes(32).toString('hex');

            session = await prisma.tableSession.upsert({
                where: { tableNumber },
                create: {
                    tableNumber,
                    status: 'available',
                    pin: pinToSet,
                    sessionToken: tokenToSet
                },
                update: {
                    pin: pinToSet,
                    sessionToken: tokenToSet,
                }
            });

            return res.json({
                tableNumber,
                status: 'available',
                pin: null,
                sessionToken: session.sessionToken,
                isOwner: true,
                rejectionMessage: null
            });
        }

        // 5. Se estiver ocupada ou fechando conta, verificamos o token
        if (session.status === 'billing') {
            return res.status(403).json({
                message: 'Mesa bloqueada: fechamento de conta em andamento.',
                status: 'billing',
                clientName: session.clientName,
                tableNumber: session.tableNumber
            });
        }

        if (session.sessionToken && token !== session.sessionToken) {
            return res.status(401).json({
                message: 'Mesa em Atendimento - Informe o Pin',
                pin_required: true
            });
        }

        res.json({
            tableNumber,
            status: session.status,
            clientName: session.clientName || null,
            pin: session.pin,
            isOwner: session.sessionToken === token,
            rejectionMessage: null
        });

    } catch (error) {
        console.error('Error verifying table:', error);
        res.status(500).json({ message: 'Error verifying table' });
    }
};

export const submitFeedback = async (req: Request, res: Response) => {
    const { name, message, tableNumber } = req.body;

    if (!message || !tableNumber) {
        return res.status(400).json({ message: 'Mensagem e número da mesa são obrigatórios.' });
    }

    try {
        const feedback = await prisma.feedback.create({
            data: {
                name: name || 'Anônimo',
                message,
                tableNumber: parseInt(tableNumber)
            }
        });

        // Emitir evento socket para o módulo Gestão de Mesas
        try {
            getIO().emit('newFeedback', feedback);
        } catch (e) {
            console.error('Socket error emitting newFeedback:', e);
        }

        res.status(201).json({ message: 'Obrigado pelo seu feedback!' });

    } catch (error) {
        console.error('Error submitting feedback:', error);
        res.status(500).json({ message: 'Erro ao enviar feedback.' });
    }
};

export const validatePin = async (req: Request, res: Response) => {
    const { tableNumber, pin } = req.body;

    if (!tableNumber || !pin) {
        return res.status(400).json({ message: 'Mesa ou PIN não informados.' });
    }

    try {
        const session = await prisma.tableSession.findUnique({
            where: { tableNumber: parseInt(tableNumber) }
        });

        if (!session || session.pin !== pin) {
            return res.status(401).json({ message: 'PIN incorreto. Peça ao responsável pela mesa.' });
        }

        res.json({
            message: 'PIN validado com sucesso.',
            sessionToken: session.sessionToken
        });

    } catch (error) {
        console.error('Error validating PIN:', error);
        res.status(500).json({ message: 'Erro ao validar PIN.' });
    }
};

export const getTableConsumption = async (req: Request, res: Response) => {
    const id = req.params.id as string;
    const tableNumber = parseInt(id as string);
    const token = req.headers.authorization?.replace('Bearer ', '');

    if (isNaN(tableNumber)) {
        return res.status(400).json({ message: 'Invalid table number' });
    }

    try {
        const session = await prisma.tableSession.findUnique({
            where: { tableNumber },
            include: {
                items: {
                    include: { product: true }
                }
            }
        });

        if (!session || (session.sessionToken && token !== session.sessionToken)) {
            return res.status(401).json({ message: 'Sessão inválida ou não autorizada.' });
        }

        // Return a cleaner structure for the frontend with grouping by name
        const groupedItems = session.items.reduce((acc: any[], it) => {
            const itemName = it.product.name;
            const existing = acc.find(x => x.name === itemName);

            if (existing) {
                existing.quantity += it.quantity;
            } else {
                acc.push({
                    id: it.id,
                    name: itemName,
                    price: it.price,
                    quantity: it.quantity,
                    imageUrl: it.product.imageUrl,
                    isReady: it.isReady
                });
            }
            return acc;
        }, []);

        const consumption = {
            tableNumber: session.tableNumber,
            clientName: session.clientName,
            status: session.status,
            startTime: session.startTime,
            items: groupedItems,
            total: session.items.reduce((acc, it) => acc + (it.price * it.quantity), 0)
        };

        res.json(consumption);

    } catch (error) {
        console.error('Error fetching table consumption:', error);
        res.status(500).json({ message: 'Erro ao buscar extrato.' });
    }
};

export const getFeedbacks = async (req: Request, res: Response) => {
    try {
        const feedbacks = await prisma.feedback.findMany({
            orderBy: { createdAt: 'desc' },
            take: 50 // Last 50 feedbacks
        });
        res.json(feedbacks);
    } catch (error) {
        console.error('Error fetching feedbacks:', error);
        res.status(500).json({ message: 'Erro ao buscar feedbacks.' });
    }
};

function deg2rad(deg: number) {
    return deg * (Math.PI / 180);
}

function getDistanceFromLatLonInMeters(lat1: number, lon1: number, lat2: number, lon2: number) {
    const R = 6371000; // Raio da Terra em metros
    const dLat = deg2rad(lat2 - lat1);
    const dLon = deg2rad(lon2 - lon1);
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

export const createOrder = async (req: Request, res: Response) => {
    const { tableNumber, items, observations, clientName, clientLat, clientLng } = req.body;

    if (!tableNumber || !items || !Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ message: 'Invalid payload' });
    }

    try {
        const token = req.headers.authorization?.replace('Bearer ', '');
        const session = await prisma.tableSession.findUnique({ where: { tableNumber: parseInt(tableNumber) } });

        if (!session || (session.sessionToken && token !== session.sessionToken)) {
            return res.status(401).json({ message: 'Sessão inválida. Por favor, valide o PIN da mesa novamente.' });
        }

        // --- Verificação de Geofencing ---
        const settings = await prisma.businessSettings.findFirst();
        if (settings && settings.restaurantLat && settings.restaurantLng && settings.geofenceRadius && settings.geofenceRadius > 0) {
            if (typeof clientLat !== 'number' || typeof clientLng !== 'number') {
                return res.status(403).json({ message: 'Localização obrigatória. Por favor, permita o acesso à sua localização para fazer pedidos na mesa.' });
            }

            const distance = getDistanceFromLatLonInMeters(
                settings.restaurantLat,
                settings.restaurantLng,
                clientLat,
                clientLng
            );

            if (distance > settings.geofenceRadius) {
                return res.status(403).json({
                    message: `Você está longe do restaurante (aprox. ${Math.round(distance)}m)! O limite é de ${settings.geofenceRadius}m. Por favor, aproxime-se ou fale com os garçons.`
                });
            }
        }
        // ----------------------------------

        // --- Verificação de Status da Loja ---
        const storeStatus = getStoreStatus();
        if (storeStatus.status === 'offline') {
            return res.status(403).json({ message: 'O restaurante está fechado neste momento e não está aceitando pedidos.' });
        }
        // ----------------------------------

        const updatedSession = await prisma.$transaction(async (tx) => {
            const tableNumNum = parseInt(tableNumber as string);
            const session = await tx.tableSession.findUnique({ where: { tableNumber: tableNumNum } });

            // Validate products exist
            for (const item of items) {
                const product = await tx.product.findUnique({ where: { id: item.productId } });
                if (!product) throw new Error(`Product ${item.productId} not found`);
            }

            let existingPending: any[] = [];
            if (session?.pendingReviewItems) {
                try {
                    const parsed = JSON.parse(session.pendingReviewItems);
                    if (Array.isArray(parsed)) {
                        existingPending = parsed;
                    }
                } catch (e) {
                    existingPending = [];
                }
            }

            // Append new items, carrying over any observations and tracking who ordered
            const newItems = items.map((it: any) => ({
                productId: it.productId,
                quantity: it.quantity,
                observations: observations || '',
                orderedBy: clientName || 'Digital'
            }));

            const newPending = [...existingPending, ...newItems];

            // The session should already exist from verifyTable, but if upsert triggers create,
            // we must preserve the headers token or generate a new one to avoid breaking the frontend.
            const pinToKeep = session?.pin || Math.floor(1000 + Math.random() * 9000).toString();
            const tokenToKeep = session?.sessionToken || token || crypto.randomBytes(32).toString('hex');

            // Aqui está a correção: se estávamos apenas "available" lendo o cardápio,
            // a data de início oficial da mesa (consumo) é AGORA, pra bater com o horário real do pedido.
            const newStartTime = session?.status === 'available' ? new Date() : (session?.startTime || new Date());

            return await tx.tableSession.upsert({
                where: { tableNumber: tableNumNum },
                create: {
                    tableNumber: tableNumNum,
                    status: 'occupied',
                    clientName: clientName || 'Mesa Digital',
                    hasPendingDigital: true,
                    pendingReviewItems: JSON.stringify(newPending),
                    isOriginDigitalMenu: true,
                    pin: pinToKeep,
                    sessionToken: tokenToKeep,
                    startTime: newStartTime
                },
                update: {
                    status: 'occupied',
                    ...(clientName ? { clientName } : {}),
                    hasPendingDigital: true,
                    pendingReviewItems: JSON.stringify(newPending),
                    isOriginDigitalMenu: true,
                    startTime: newStartTime
                }
            });
        });

        // Dispara evento de websocket para o sistema PDV atualizar as telas em tempo real
        try {
            getIO().emit('newOrder', {
                tableNumber: tableNumber,
                action: 'refresh',
                type: 'DIGITAL_PRE_ORDER'
            });
        } catch (e) {
            console.error('Socket.io error emitting newOrder:', e);
        }

        res.status(201).json({ message: 'Order sent to approval queue', session: updatedSession });

    } catch (error: any) {
        console.error('Error creating digital menu order:', error);
        res.status(500).json({ message: error.message || 'Error creating order' });
    }
};

export const acknowledgeRejection = async (req: Request, res: Response) => {
    const id = req.params.id as string;
    const tableNumber = parseInt(id as string);
    const token = req.headers.authorization?.replace('Bearer ', '');

    if (isNaN(tableNumber)) {
        return res.status(400).json({ message: 'Invalid table number' });
    }

    try {
        const session = await prisma.tableSession.findUnique({ where: { tableNumber } });

        if (!session || (session.sessionToken && token !== session.sessionToken)) {
            return res.status(401).json({ message: 'Sessão inválida ou não autorizada.' });
        }

        // Se a mesa estiver em status 'available', nós a deletamos de vez agora que o usuário viu
        if (session.status === 'available') {
            await prisma.tableSession.delete({ where: { tableNumber } });
            console.log(`[REJECTION] Table ${tableNumber} fully cleared after acknowledgement.`);
        } else {
            // Se ainda houver consumo (occupied), apenas limpamos a flag de rejeição
            await prisma.tableSession.update({
                where: { tableNumber },
                data: {
                    hasPendingDigital: false,
                    pendingReviewItems: null
                }
            });
            console.log(`[REJECTION] Table ${tableNumber} rejection flag cleared (session remains occupied).`);
        }

        // Notifica as outras telas (embora o PDV já saiba)
        getIO().emit('tableStatusChanged', {
            tableNumber: tableNumber,
            status: session.status === 'available' ? 'available' : session.status,
            action: 'refresh'
        });

        res.json({ message: 'Reconhecimento registrado com sucesso.' });

    } catch (error) {
        console.error('Error acknowledging rejection:', error);
        res.status(500).json({ message: 'Erro ao registrar reconhecimento.' });
    }
};
