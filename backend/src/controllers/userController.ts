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
        userData.active = true;
    }

    const { id, ...rest } = userData;

    const user = await prisma.user.upsert({
        where: { id: id || '' },
        update: rest,
        create: userData
    });
    res.json(user);
};

export const deleteUser = async (req: Request, res: Response) => {
    const id = req.params.id as string;
    await prisma.user.delete({ where: { id: id as string } });
    res.json({ message: 'Usuário removido' });
};

export const toggleUserStatus = async (req: Request, res: Response) => {
    const { id, active } = req.body;
    const user = await prisma.user.update({
        where: { id },
        data: { active }
    });
    res.json(user);
};

export const resetUser = async (req: Request, res: Response) => {
    const { id } = req.body;
    const recoveryCode = generateRecoveryCode();
    const user = await prisma.user.update({
        where: { id },
        data: {
            recoveryCode,
            password: '123',
            mustChangePassword: true
        }
    });
    res.json(user);
};
