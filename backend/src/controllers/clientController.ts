import { Request, Response } from 'express';
import prisma from '../prisma';

export const getAllClients = async (req: Request, res: Response) => {
    const clients = await prisma.client.findMany();
    res.json(clients);
};

export const saveClient = async (req: Request, res: Response) => {
    const data = req.body;
    const client = await prisma.client.upsert({
        where: { id: data.id || '' },
        update: data,
        create: data
    });
    res.json(client);
};

export const deleteClient = async (req: Request, res: Response) => {
    const id = req.params.id as string;
    const { user } = req.body;

    if (!user?.permissions?.includes('admin')) {
        return res.status(403).json({ message: 'Apenas o Administrador Master pode excluir clientes.' });
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
