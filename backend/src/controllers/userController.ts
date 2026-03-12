import { Request, Response } from 'express';
import prisma from '../prisma';
import bcrypt from 'bcryptjs';

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
    try {
        const data = req.body;
        // Se o ID começar com 'user-', é um ID temporário do frontend, então tratamos como novo usuário
        const isNewUser = !data.id || (typeof data.id === 'string' && data.id.startsWith('user-'));

        const userData = { ...data };
        if (userData.email) {
            userData.email = userData.email.toLowerCase();
        }

        if (isNewUser) {
            userData.recoveryCode = userData.recoveryCode || generateRecoveryCode();
            userData.mustChangePassword = userData.mustChangePassword ?? true;
            userData.active = userData.active ?? true;
            
            // Se for novo usuário e não veio senha, ou mesmo se veio, garantimos o hash
            const passwordToHash = userData.password || '123';
            userData.password = await bcrypt.hash(passwordToHash, 10);
            
            // Remove o ID temporário do frontend para o Prisma gerar um UUID
            if (data.id && data.id.startsWith('user-')) {
                delete userData.id;
            }
        } else {
            // Se for atualização
            if (userData.password && !userData.password.startsWith('$2')) {
                userData.password = await bcrypt.hash(userData.password, 10);
            } else if (!userData.password || userData.password === "") {
                // Se for string vazia ou nula/indefinida, removemos do objeto para não sobrescrever o hash atual
                delete userData.password;
            }
        }

        const { id, ...rest } = userData;

        const user = await prisma.user.upsert({
            where: { id: id || '' },
            update: rest,
            create: userData
        });
        res.json(user);
    } catch (error: any) {
        console.error('Error in saveUser:', error);
        res.status(500).json({ 
            error: 'Erro ao salvar usuário', 
            details: error.message,
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
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
    const hashedPassword = await bcrypt.hash('123', 10);
    const user = await prisma.user.update({
        where: { id },
        data: {
            recoveryCode,
            password: hashedPassword,
            mustChangePassword: true
        }
    });
    res.json(user);
};
