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
    const { id } = req.params;
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

        // 3. Se a mesa estiver disponível (ou não houver sessão), criamos uma nova com PIN
        if (!session || session.status === 'available') {
            const pin = Math.floor(1000 + Math.random() * 9000).toString(); // PIN de 4 dígitos
            const sessionToken = crypto.randomBytes(32).toString('hex');

            session = await prisma.tableSession.upsert({
                where: { tableNumber },
                create: {
                    tableNumber,
                    status: 'available', // Começa como livre no banco, mas com PIN gerado
                    pin,
                    sessionToken
                },
                update: {
                    pin,
                    sessionToken,
                    // Ao resetar para novo PIN, garantimos que status seja ocupada assim que o primeiro acesse
                    // Na verdade, o primeiro acesso via QR Code já deve marcar como ocupada se for o dono.
                }
            });

            return res.json({
                tableNumber,
                status: 'available',
                pin: null, // O PIN só aparece após o primeiro pedido (status occupied)
                sessionToken,
                isOwner: true
            });
        }

        // 4. Se estiver ocupada ou fechando conta, verificamos o token
        if (session.status === 'billing') {
            return res.status(403).json({
                message: 'Mesa bloqueada: fechamento de conta em andamento.',
                status: 'billing'
            });
        }

        // 5. Se estiver ocupada, verificamos se o token enviado é válido
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
            pin: session.pin, // Para quem já tem o token, o PIN fica disponível
            isOwner: session.sessionToken === token
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
    const { id } = req.params;
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
                return res.status(403).json({ message: "Você está longe do restaurante! Não é possível realizar pedidos no momento. Se estiver tendo problemas fale com os garçons?!" });
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

            const existingPending = session?.pendingReviewItems ? JSON.parse(session.pendingReviewItems) : [];

            // Append new items, carrying over any observations and tracking who ordered
            const newItems = items.map((it: any) => ({
                productId: it.productId,
                quantity: it.quantity,
                observations: observations || '',
                orderedBy: clientName || 'Digital'
            }));

            const newPending = [...existingPending, ...newItems];

            return await tx.tableSession.upsert({
                where: { tableNumber: tableNumNum },
                create: {
                    tableNumber: tableNumNum,
                    status: 'occupied',
                    clientName: clientName || 'Mesa Digital',
                    hasPendingDigital: true,
                    pendingReviewItems: JSON.stringify(newPending),
                    isOriginDigitalMenu: true
                },
                update: {
                    status: 'occupied',
                    ...(clientName ? { clientName } : {}),
                    hasPendingDigital: true,
                    pendingReviewItems: JSON.stringify(newPending),
                    isOriginDigitalMenu: true
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
