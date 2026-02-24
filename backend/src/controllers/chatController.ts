import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export const getMessages = async (req: Request, res: Response) => {
    const { driverId } = req.params;
    try {
        const messages = await prisma.chatMessage.findMany({
            where: { driverId: driverId as string },
            orderBy: { timestamp: 'asc' }
        });
        res.json(messages);
    } catch (error) {
        res.status(500).json({ error: 'Erro ao buscar mensagens' });
    }
};

export const saveMessage = async (req: Request, res: Response) => {
    const { content, driverId, isFromDriver, senderName } = req.body;
    try {
        const message = await prisma.chatMessage.create({
            data: {
                content,
                driverId,
                isFromDriver,
                senderName
            }
        });
        res.json(message);
    } catch (error) {
        res.status(500).json({ error: 'Erro ao salvar mensagem' });
    }
};
