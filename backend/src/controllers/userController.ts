import { Request, Response } from 'express';
import prisma from '../prisma';

export const getAllUsers = async (req: Request, res: Response) => {
    const users = await prisma.user.findMany();
    res.json(users);
};

export const saveUser = async (req: Request, res: Response) => {
    const data = req.body;
    const user = await prisma.user.upsert({
        where: { id: data.id || '' },
        update: data,
        create: data
    });
    res.json(user);
};

export const deleteUser = async (req: Request, res: Response) => {
    const id = req.params.id as string;
    await prisma.user.delete({ where: { id: id as string } });
    res.json({ message: 'Usuário removido' });
};
