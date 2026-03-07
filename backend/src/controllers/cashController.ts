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

    // Clear all customer feedbacks/messages/support when opening the daily cash session
    await prisma.feedback.deleteMany();
    await prisma.supportMessage.deleteMany();

    const session = await prisma.cashSession.create({
        data: {
            openedBy: user.id,
            openedByName: user.name,
            initialBalance: parseFloat(initialBalance),
            status: 'OPEN'
        }
    });

    await prisma.auditLog.create({
        data: {
            userId: user.id,
            userName: user.name,
            action: 'OPEN_CASH',
            details: `Usuário abriu o caixa com saldo inicial de R$ ${parseFloat(initialBalance).toFixed(2)}`
        }
    });

    res.json(session);
};

const calculateSessionTotals = async (openedAt: Date) => {
    // Get the start of the day for orphan sales detection
    const startOfDay = new Date(openedAt);
    startOfDay.setHours(0, 0, 0, 0);

    // Get all orders from the start of the day until now
    const allOrdersOfDay = await prisma.order.findMany({
        where: {
            createdAt: { gte: startOfDay },
            status: 'DELIVERED'
        }
    });

    // Orders within the session
    const sessionOrders = allOrdersOfDay.filter(o => o.createdAt >= openedAt);
    // Orders before the session opened (orphans)
    const orphanOrders = allOrdersOfDay.filter(o => o.createdAt < openedAt);

    const normalizePaymentMethod = (method: string): string => {
        const m = method.toUpperCase();
        if (m.includes('DINHEIRO') || m === 'CASH') return 'DINHEIRO';
        if (m.includes('PIX')) return 'PIX';
        if (m.includes('CRÉDITO') || m === 'CREDIT') return 'CRÉDITO';
        if (m.includes('DÉBITO') || m === 'DEBIT') return 'DÉBITO';
        if (m.includes('FIADO')) return 'FIADO';
        return m;
    };

    const calc = (orderList: any[]) => {
        let cash = 0, pix = 0, credit = 0, debit = 0, others = 0, fiado = 0;
        orderList.forEach(order => {
            const rawMethod = order.paymentMethod?.toUpperCase() || '';
            const total = order.total || 0;
            const split1 = order.splitAmount1 || 0;
            const split2 = total - split1;

            if (rawMethod.includes('+')) {
                const parts = rawMethod.split('+').map((p: any) => p.trim());

                // First part
                const method1 = normalizePaymentMethod(parts[0]);
                if (method1 === 'DINHEIRO') cash += split1;
                else if (method1 === 'PIX') pix += split1;
                else if (method1 === 'CRÉDITO') credit += split1;
                else if (method1 === 'DÉBITO') debit += split1;
                else if (method1 === 'FIADO') fiado += split1;
                else others += split1;

                // Second part
                const method2 = normalizePaymentMethod(parts[1]);
                if (method2 === 'DINHEIRO') cash += split2;
                else if (method2 === 'PIX') pix += split2;
                else if (method2 === 'CRÉDITO') credit += split2;
                else if (method2 === 'DÉBITO') debit += split2;
                else if (method2 === 'FIADO') fiado += split2;
                else others += split2;
            } else {
                const method = normalizePaymentMethod(rawMethod);
                if (method === 'DINHEIRO') cash += total;
                else if (method === 'PIX') pix += total;
                else if (method === 'CRÉDITO') credit += total;
                else if (method === 'DÉBITO') debit += total;
                else if (method === 'FIADO') fiado += total;
                else others += total;
            }
        });
        return { cash, pix, credit, debit, others, fiado, total: cash + pix + credit + debit + others };
    };

    const sessionTotals = calc(sessionOrders);
    const orphanTotals = calc(orphanOrders);

    return {
        systemCash: sessionTotals.cash,
        systemPix: sessionTotals.pix,
        systemCredit: sessionTotals.credit,
        systemDebit: sessionTotals.debit,
        systemOthers: sessionTotals.others,
        systemFiado: sessionTotals.fiado, // Informative only
        totalSales: sessionTotals.total,
        orphanSales: orphanTotals.total + orphanTotals.fiado // Total value lost before session
    };
};

export const getClosurePreview = async (req: Request, res: Response) => {
    const session = await prisma.cashSession.findFirst({
        where: { status: 'OPEN' }
    });

    if (!session) {
        return res.status(404).json({ message: 'Nenhum caixa aberto encontrado.' });
    }

    const totals = await calculateSessionTotals(session.openedAt);
    res.json(totals);
};

export const closeCashSession = async (req: Request, res: Response) => {
    const { sessionId, cash, pix, credit, debit, others, fiado, observations, user } = req.body;

    const session = await prisma.cashSession.findUnique({
        where: { id: sessionId }
    });

    if (!session || session.status === 'CLOSED') {
        return res.status(400).json({ message: 'Caixa não encontrado ou já fechado.' });
    }

    const totals = await calculateSessionTotals(session.openedAt);

    const totalReported = parseFloat(cash) + parseFloat(pix) + parseFloat(credit) + parseFloat(debit) + parseFloat(others || 0);
    const difference = totalReported - totals.totalSales;

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
            reportedOthers: parseFloat(others || 0),
            reportedFiado: parseFloat(fiado || 0),
            systemCash: totals.systemCash,
            systemPix: totals.systemPix,
            systemCredit: totals.systemCredit,
            systemDebit: totals.systemDebit,
            systemOthers: totals.systemOthers,
            systemFiado: totals.systemFiado,
            orphanSales: totals.orphanSales,
            totalSales: totals.totalSales,
            difference,
            observations
        }
    });

    await prisma.auditLog.create({
        data: {
            userId: user.id,
            userName: user.name,
            action: 'CLOSE_CASH',
            details: `Usuário fechou o caixa com diferença de R$ ${difference.toFixed(2)}. ${observations ? `Obs: ${observations}` : ''}`
        }
    });

    res.json(updatedSession);
};

export const updateCashSession = async (req: Request, res: Response) => {
    const { id, cash, pix, credit, debit, others, fiado, observations, user } = req.body;

    const session = await prisma.cashSession.findUnique({
        where: { id }
    });

    if (!session) {
        return res.status(404).json({ message: 'Caixa não encontrado.' });
    }

    // Re-calculate totals if it was already closed, to ensure difference is correct
    // In "Revisar", we might only update the reported values.
    const totals = {
        systemCash: session.systemCash || 0,
        systemPix: session.systemPix || 0,
        systemCredit: session.systemCredit || 0,
        systemDebit: session.systemDebit || 0,
        systemOthers: session.systemOthers || 0,
        totalSales: session.totalSales || 0
    };

    const totalReported = parseFloat(cash) + parseFloat(pix) + parseFloat(credit) + parseFloat(debit) + parseFloat(others || 0);
    // Note: totalSales in the DB includes systemFiado? No, totals.totalSales calculated just now doesn't.
    // We should compare totalReported against totalSales + systemFiado?
    // Actually, usually difference is just Cash. But the system tracks all.
    // Let's stick to the existing difference logic but ensure we account for everything.
    const systemTotal = totals.totalSales + (session.systemFiado || 0);
    const difference = totalReported - systemTotal;

    const updated = await prisma.cashSession.update({
        where: { id },
        data: {
            reportedCash: parseFloat(cash),
            reportedPix: parseFloat(pix),
            reportedCredit: parseFloat(credit),
            reportedDebit: parseFloat(debit),
            reportedOthers: parseFloat(others || 0),
            reportedFiado: parseFloat(fiado || 0),
            difference,
            observations,
            closedByName: `${session.closedByName} (Alt: ${user.name})`
        }
    });

    res.json(updated);
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
            systemOthers: null,
            systemFiado: null,
            reportedFiado: null,
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
                gte: start ? new Date(`${start}T00:00:00.000-03:00`) : undefined,
                lte: end ? new Date(`${end}T23:59:59.999-03:00`) : undefined
            }
        },
        orderBy: { openedAt: 'desc' }
    });
    res.json(sessions);
};
