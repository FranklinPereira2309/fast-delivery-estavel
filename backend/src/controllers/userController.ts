import { Request, Response } from 'express';
import prisma from '../prisma';

export const getAllUsers = async (req: Request, res: Response) => {
    const users = await prisma.user.findMany();
    const sanitizedUsers = users.map(user => {
        const { password, ...rest } = user;
        return rest;
    });
    res.json(sanitizedUsers);
};

const generateRecoveryCode = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
};

export const saveUser = async (req: Request, res: Response) => {
    const data = req.body;
    const isNewUser = !data.id;

    const userData = { ...data };

    if (isNewUser) {
        userData.recoveryCode = generateRecoveryCode();
        userData.mustChangePassword = true;
    }

    const user = await prisma.user.upsert({
        where: { id: data.id || '' },
        update: data,
        create: userData
    });
    res.json(user);
};

export const deleteUser = async (req: Request, res: Response) => {
    const id = req.params.id as string;
    await prisma.user.delete({ where: { id: id as string } });
    res.json({ message: 'Usuário removido' });
};
