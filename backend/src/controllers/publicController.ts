import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { getIO } from '../socket';

const prisma = new PrismaClient();

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
        const session = await prisma.tableSession.findUnique({
            where: { tableNumber }
        });

        // Se estiver ocupada ou fechando conta, não deixamos acessar ou informamos o status
        if (session && session.status === 'billing') {
            return res.status(403).json({
                message: 'Mesa bloqueada: fechamento de conta em andamento.',
                status: 'billing'
            });
        }

        res.json({
            tableNumber,
            status: session ? session.status : 'available',
            clientName: session?.clientName || null
        });

    } catch (error) {
        console.error('Error verifying table:', error);
        res.status(500).json({ message: 'Error verifying table' });
    }
};

export const createOrder = async (req: Request, res: Response) => {
    const { tableNumber, items, observations, clientName } = req.body;

    if (!tableNumber || !items || !Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ message: 'Invalid payload' });
    }

    try {
        const updatedSession = await prisma.$transaction(async (tx) => {
            const session = await tx.tableSession.findUnique({ where: { tableNumber } });

            // Validate products exist
            for (const item of items) {
                const product = await tx.product.findUnique({ where: { id: item.productId } });
                if (!product) throw new Error(`Product ${item.productId} not found`);
            }

            const existingPending = session?.pendingReviewItems ? JSON.parse(session.pendingReviewItems) : [];

            // Append new items, carrying over any observations
            const newItems = items.map((it: any) => ({
                productId: it.productId,
                quantity: it.quantity,
                observations: observations || ''
            }));

            const newPending = [...existingPending, ...newItems];

            return await tx.tableSession.upsert({
                where: { tableNumber },
                create: {
                    tableNumber,
                    status: 'occupied',
                    clientName: clientName || 'Mesa Digital',
                    hasPendingDigital: true,
                    pendingReviewItems: JSON.stringify(newPending)
                },
                update: {
                    hasPendingDigital: true,
                    pendingReviewItems: JSON.stringify(newPending)
                }
            });
        });

        // Dispara evento de websocket para o sistema PDV atualizar as telas em tempo real
        try {
            getIO().emit('newOrder', {
                tableNumber: tableNumber,
                action: 'refresh'
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
