import { Request, Response } from 'express';
import prisma from '../prisma';
import { getIO } from '../socket';

export const getMessages = async (req: Request, res: Response) => {
    try {
        const { clientId } = req.query;
        const where: any = {};

        if (clientId) {
            where.clientId = clientId as string;
        } else {
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            where.createdAt = { gte: today };
        }

        const messages = await prisma.supportMessage.findMany({
            where,
            orderBy: {
                createdAt: 'asc'
            }
        });
        res.json(messages);
    } catch (error) {
        res.status(500).json({ error: 'Erro ao buscar mensagens' });
    }
};

export const sendMessage = async (req: Request, res: Response) => {
    try {
        const { userName, message, clientId, isAdmin } = req.body;
        if (!message) {
            return res.status(400).json({ error: 'Mensagem é obrigatória' });
        }

        const newMessage = await prisma.supportMessage.create({
            data: {
                userName,
                message,
                ...(clientId && { clientId }),
                isAdmin: !!isAdmin
            }
        });

        const io = getIO();
        io.emit('new_support_message', newMessage);

        res.json(newMessage);
    } catch (error) {
        res.status(500).json({ error: 'Erro ao enviar mensagem' });
    }
};

export const clearMessages = async (req: Request, res: Response) => {
    try {
        await prisma.supportMessage.deleteMany({});
        res.json({ message: 'Mensagens limpas com sucesso' });
    } catch (error) {
        res.status(500).json({ error: 'Erro ao limpar mensagens' });
    }
};
