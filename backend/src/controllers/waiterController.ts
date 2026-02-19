import { Request, Response } from 'express';
import prisma from '../prisma';

export const getWaiters = async (req: Request, res: Response) => {
    const waiters = await prisma.waiter.findMany();
    res.json(waiters);
};

export const saveWaiter = async (req: Request, res: Response) => {
    const data = req.body;
    const waiter = await prisma.waiter.upsert({
        where: { id: data.id || '' },
        update: data,
        create: data
    });
    res.json(waiter);
};

export const deleteWaiter = async (req: Request, res: Response) => {
    const { id } = req.params;
    await prisma.waiter.delete({ where: { id: id as string } });
    res.json({ message: 'Garçom removido' });
};
