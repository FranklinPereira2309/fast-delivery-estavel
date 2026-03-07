import { Request, Response } from 'express';
import prisma from '../prisma';

export const getAllClients = async (req: Request, res: Response) => {
    const clients = await prisma.client.findMany();
    res.json(clients);
};

import bcrypt from 'bcryptjs';

export const saveClient = async (req: Request, res: Response) => {
    const data = req.body;
    let newPassword = undefined;

    // Check if client is new
    if (!data.id) {
        newPassword = await bcrypt.hash('123', 10);
    } else {
        const existingById = await prisma.client.findUnique({ where: { id: data.id } });
        if (!existingById) {
            newPassword = await bcrypt.hash('123', 10);
        }
    }

    // Validation: Duplicate phone or email
    const duplicate = await prisma.client.findFirst({
        where: {
            OR: [
                { phone: data.phone },
                data.email ? { email: data.email } : {}
            ],
            NOT: data.id ? { id: data.id } : undefined
        }
    });

    if (duplicate) {
        const field = duplicate.phone === data.phone ? 'telefone' : 'e-mail';
        return res.status(409).json({ message: `Este ${field} já está sendo utilizado por outro cliente.` });
    }

    const clientData = {
        ...data,
        pin: data.pin || Math.floor(1000 + Math.random() * 9000).toString(),
        ...(newPassword && { password: newPassword })
    };

    const client = await prisma.client.upsert({
        where: { id: data.id || '' },
        update: clientData,
        create: clientData
    });
    res.json(client);
};

export const deleteClient = async (req: Request, res: Response) => {
    const id = req.params.id as string;
    const { user } = req.body;

    if (!user?.permissions?.includes('admin') && !user?.permissions?.includes('settings')) {
        return res.status(403).json({ message: 'Apenas usuários autorizados podem excluir clientes.' });
    }

    try {
        await prisma.client.delete({ where: { id: id as string } });
        res.json({ message: 'Cliente removido' });
    } catch (error: any) {
        if (error.code === 'P2003') {
            return res.status(400).json({
                message: 'Não é possível excluir este cliente pois ele possui pedidos vinculados. Cancele os pedidos antes de excluir.'
            });
        }
        res.status(500).json({ message: 'Erro ao remover cliente.' });
    }
};

export const resetClientPin = async (req: Request, res: Response) => {
    const id = req.params.id as string;
    const { user } = req.body;

    if (!user?.permissions?.includes('admin') && !user?.permissions?.includes('settings')) {
        return res.status(403).json({ message: 'Apenas usuários autorizados podem resetar senhas ou PIN.' });
    }

    try {
        const pin = Math.floor(1000 + Math.random() * 9000).toString();
        const updatedClient = await prisma.client.update({
            where: { id },
            data: { pin }
        });

        res.status(200).json({ message: 'PIN redefinido com sucesso.', pin: updatedClient.pin });
    } catch (error) {
        console.error('Error resetting PIN:', error);
        res.status(500).json({ message: 'Erro ao redefinir PIN do cliente.' });
    }
};
