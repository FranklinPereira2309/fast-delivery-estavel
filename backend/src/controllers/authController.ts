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
            if (!user.active) {
                return res.status(403).json({ message: 'Esta conta está inativada. Entre em contato com o administrador.' });
            }

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

export const verifyAdminPassword = async (req: Request, res: Response) => {
    const { password } = req.body;

    try {
        const adminUser = await prisma.user.findFirst({
            where: {
                password,
                permissions: { hasSome: ['settings', 'admin'] }
            }
        });

        if (adminUser) {
            res.json({ valid: true });
        } else {
            res.status(401).json({ valid: false, message: 'Senha incorreta ou usuário sem privilégios de Administrador.' });
        }
    } catch (error) {
        res.status(500).json({ error: 'Erro ao verificar permissão.' });
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

export const verifyRecoveryCode = async (req: Request, res: Response) => {
    const { email, recoveryCode } = req.body;
    try {
        const user = await prisma.user.findFirst({
            where: { email, recoveryCode }
        });
        if (user) {
            res.json({ valid: true });
        } else {
            res.status(401).json({ valid: false, message: 'Código de recuperação ou e-mail inválido.' });
        }
    } catch (error) {
        res.status(500).json({ error: 'Erro ao verificar código.' });
    }
};

export const resetPassword = async (req: Request, res: Response) => {
    const { email, recoveryCode, newPassword } = req.body;
    try {
        const user = await prisma.user.findFirst({
            where: { email, recoveryCode }
        });
        if (user) {
            await prisma.user.update({
                where: { id: user.id },
                data: {
                    password: newPassword,
                    mustChangePassword: false
                }
            });

            await prisma.auditLog.create({
                data: {
                    userId: user.id,
                    userName: user.name,
                    action: 'PASSWORD_RESET',
                    details: `Usuário ${user.name} redefiniu sua própria senha.`
                }
            });

            res.json({ message: 'Senha redefinida com sucesso.' });
        } else {
            res.status(401).json({ message: 'Ação não autorizada ou código inválido.' });
        }
    } catch (error) {
        res.status(500).json({ error: 'Erro ao redefinir senha.' });
    }
};
