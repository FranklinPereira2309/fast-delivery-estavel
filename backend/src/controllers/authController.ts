import { Request, Response } from 'express';
import prisma from '../prisma';

export const login = async (req: Request, res: Response) => {
    const { email, password } = req.body;

    try {
        const user = await prisma.user.findFirst({
            where: {
                email,
                password // Note: In a real app, use hashing like bcrypt
            }
        });

        if (user) {
            // Create a log entry
            await prisma.auditLog.create({
                data: {
                    userId: user.id,
                    userName: user.name,
                    action: 'LOGIN',
                    details: `Usuário ${user.name} acessou o sistema.`
                }
            });

            res.json(user);
        } else {
            res.status(401).json({ message: 'Credenciais inválidas' });
        }
    } catch (error) {
        res.status(500).json({ error: 'Erro ao realizar login' });
    }
};

export const logout = async (req: Request, res: Response) => {
    const { userId } = req.body;

    try {
        const user = await prisma.user.findUnique({ where: { id: userId } });
        if (user) {
            await prisma.auditLog.create({
                data: {
                    userId: user.id,
                    userName: user.name,
                    action: 'LOGOUT',
                    details: `Usuário ${user.name} saiu do sistema.`
                }
            });
        }
        res.json({ message: 'Logged out' });
    } catch (error) {
        res.status(500).json({ error: 'Erro ao realizar logout' });
    }
};
