import { Request, Response } from 'express';
import prisma from '../prisma';

export const getActiveCashSession = async (req: Request, res: Response) => {
    const session = await prisma.cashSession.findFirst({
        where: { status: 'OPEN' }
    });
    res.json(session);
};

export const openCashSession = async (req: Request, res: Response) => {
    const { initialBalance, user } = req.body;

    const active = await prisma.cashSession.findFirst({
        where: { status: 'OPEN' }
    });

    if (active) {
        return res.status(400).json({ message: 'Já existe um caixa aberto.' });
    }

    const session = await prisma.cashSession.create({
        data: {
            openedBy: user.id,
            openedByName: user.name,
            initialBalance: parseFloat(initialBalance),
            status: 'OPEN'
        }
    });

    res.json(session);
};

export const closeCashSession = async (req: Request, res: Response) => {
    const { sessionId, cash, pix, credit, debit, observations, user } = req.body;

    const session = await prisma.cashSession.findUnique({
        where: { id: sessionId }
    });

    if (!session || session.status === 'CLOSED') {
        return res.status(400).json({ message: 'Caixa não encontrado ou já fechado.' });
    }

    // Get all orders completed since opening
    const orders = await prisma.order.findMany({
        where: {
            createdAt: { gte: session.openedAt },
            status: 'DELIVERED'
        }
    });

    let systemCash = 0;
    let systemPix = 0;
    let systemCredit = 0;
    let systemDebit = 0;

    orders.forEach(order => {
        const method = order.paymentMethod?.toUpperCase() || '';
        const total = order.total || 0;
        const split1 = order.splitAmount1 || 0;
        const split2 = total - split1;

        if (method.includes('+')) {
            const parts = method.split('+').map(p => p.trim());

            // First part (split1)
            if (parts[0].includes('DINHEIRO')) systemCash += split1;
            else if (parts[0].includes('PIX')) systemPix += split1;
            else if (parts[0].includes('CRÉDITO')) systemCredit += split1;
            else if (parts[0].includes('DÉBITO')) systemDebit += split1;

            // Second part (split2)
            if (parts[1].includes('DINHEIRO')) systemCash += split2;
            else if (parts[1].includes('PIX')) systemPix += split2;
            else if (parts[1].includes('CRÉDITO')) systemCredit += split2;
            else if (parts[1].includes('DÉBITO')) systemDebit += split2;
        } else {
            if (method.includes('DINHEIRO')) systemCash += total;
            else if (method.includes('PIX')) systemPix += total;
            else if (method.includes('CRÉDITO')) systemCredit += total;
            else if (method.includes('DÉBITO')) systemDebit += total;
        }
    });

    const totalSales = systemCash + systemPix + systemCredit + systemDebit;
    const totalReported = parseFloat(cash) + parseFloat(pix) + parseFloat(credit) + parseFloat(debit);
    const difference = totalReported - totalSales;

    const updatedSession = await prisma.cashSession.update({
        where: { id: sessionId },
        data: {
            closedAt: new Date(),
            closedBy: user.id,
            closedByName: user.name,
            status: 'CLOSED',
            reportedCash: parseFloat(cash),
            reportedPix: parseFloat(pix),
            reportedCredit: parseFloat(credit),
            reportedDebit: parseFloat(debit),
            systemCash,
            systemPix,
            systemCredit,
            systemDebit,
            totalSales,
            difference,
            observations
        }
    });

    res.json(updatedSession);
};

export const reopenCashSession = async (req: Request, res: Response) => {
    const { sessionId, user } = req.body;

    const active = await prisma.cashSession.findFirst({
        where: { status: 'OPEN' }
    });

    if (active) {
        return res.status(400).json({ message: 'Já existe um caixa aberto. Feche o atual antes de reabrir este.' });
    }

    const session = await prisma.cashSession.update({
        where: { id: sessionId },
        data: {
            status: 'OPEN',
            closedAt: null,
            closedBy: null,
            closedByName: null,
            reportedCash: null,
            reportedPix: null,
            reportedCredit: null,
            reportedDebit: null,
            systemCash: null,
            systemPix: null,
            systemCredit: null,
            systemDebit: null,
            totalSales: null,
            difference: null
        }
    });

    res.json(session);
};

export const getCashSessions = async (req: Request, res: Response) => {
    const { start, end } = req.query;
    const sessions = await prisma.cashSession.findMany({
        where: {
            openedAt: {
                gte: start ? new Date(start as string) : undefined,
                lte: end ? new Date(end as string) : undefined
            }
        },
        orderBy: { openedAt: 'desc' }
    });
    res.json(sessions);
};
