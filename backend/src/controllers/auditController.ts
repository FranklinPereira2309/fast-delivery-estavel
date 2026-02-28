import { Request, Response } from 'express';
import prisma from '../prisma';

export const getAuditLogs = async (req: Request, res: Response) => {
    const { start, end } = req.query;

    const logs = await prisma.auditLog.findMany({
        where: {
            timestamp: {
                gte: start ? new Date(`${start}T00:00:00.000-03:00`) : undefined,
                lte: end ? new Date(`${end}T23:59:59.999-03:00`) : undefined
            }
        },
        orderBy: { timestamp: 'desc' },
        take: 2000 // Safetu limit to prevent blowing up the payload if no filter
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
