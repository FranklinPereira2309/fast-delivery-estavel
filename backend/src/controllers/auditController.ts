import { Request, Response } from 'express';
import prisma from '../prisma';

export const getAuditLogs = async (req: Request, res: Response) => {
    const logs = await prisma.auditLog.findMany({
        orderBy: { timestamp: 'desc' }
    });
    res.json(logs);
};

export const logAction = async (req: Request, res: Response) => {
    const { user, action, details } = req.body;
    const log = await prisma.auditLog.create({
        data: {
            userId: user?.id || 'SYSTEM',
            userName: user?.name || 'Sistema',
            action,
            details
        }
    });
    res.json(log);
};
