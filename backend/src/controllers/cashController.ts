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
    // Get the last closed session to determine the start of the orphan window
    const lastSession = await prisma.cashSession.findFirst({
        where: { status: 'CLOSED' },
        orderBy: { closedAt: 'desc' }
    });

    // Start of the day for fallback if no last session
    const startOfDay = new Date(openedAt);
    startOfDay.setHours(0, 0, 0, 0);

    // Orphan window starts after the last session closed, or at midnight if no last session
    const orphanStart = lastSession?.closedAt ? new Date(lastSession.closedAt) : startOfDay;

    // Get all orders from the start of the orphan window until now
    const allOrdersSinceStart = await prisma.order.findMany({
        where: {
            createdAt: { gte: orphanStart },
            status: 'DELIVERED'
        }
    });

    // Orders within the current open session
    const sessionOrders = allOrdersSinceStart.filter(o => o.createdAt >= openedAt);
    // Orders between the last closure and current opening (orphans)
    const orphanOrders = allOrdersSinceStart.filter(o => o.createdAt < openedAt);

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

    await prisma.auditLog.create({
        data: {
            userId: user.id,
            userName: user.name,
            action: 'UPDATE_CASH',
            details: `Usuário revisou o fechamento do caixa ${id}. Nova diferença: R$ ${difference.toFixed(2)}.`
        }
    }).catch(e => console.error('Error creating audit log in updateCashSession:', e));

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

    // Audit Log for Reopening
    await prisma.auditLog.create({
        data: {
            userId: user.id || 'SYSTEM',
            userName: user.name || 'Sistema',
            action: 'REOPEN_CASH',
            details: `Usuário reabriu o caixa ${sessionId} que estava fechado.`
        }
    }).catch(e => console.error('Error creating audit log in reopenCashSession:', e));
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

export const autoCloseCashSessions = async () => {
    try {
        const settings = await prisma.businessSettings.findFirst() as any;
        const autoCloseTime = settings?.autoCloseTime || '00:00';
        const [targetHours, targetMinutes] = autoCloseTime.split(':').map(Number);

        const now = new Date();
        // Convert current time to Brasilia time for calculation
        const brasiliaNow = new Date(now.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));

        // Calculate the most recent "scheduled" closure time
        const lastTargetClosure = new Date(brasiliaNow);
        lastTargetClosure.setHours(targetHours, targetMinutes, 0, 0);

        // If current time is before today's scheduled time, the "last" closure was yesterday
        if (brasiliaNow < lastTargetClosure) {
            lastTargetClosure.setDate(lastTargetClosure.getDate() - 1);
        }

        console.log(`[AUTO-CLOSE] Cut-off time calculated: ${lastTargetClosure.toLocaleString('pt-BR')}`);

        // Find sessions that were opened BEFORE the last scheduled closure time and are still OPEN
        const sessionsToClose = await prisma.cashSession.findMany({
            where: {
                status: 'OPEN',
                openedAt: { lt: lastTargetClosure }
            }
        });

        if (sessionsToClose.length === 0) {
            return;
        }

        console.log(`[AUTO-CLOSE] Found ${sessionsToClose.length} sessions to auto-close.`);

        for (const session of sessionsToClose) {
            const totals = await calculateSessionTotals(session.openedAt);

            await prisma.cashSession.update({
                where: { id: session.id },
                data: {
                    closedAt: new Date(),
                    closedBy: 'SYSTEM',
                    closedByName: 'SISTEMA (Auto Fechamento)',
                    status: 'CLOSED',
                    reportedCash: totals.systemCash,
                    reportedPix: totals.systemPix,
                    reportedCredit: totals.systemCredit,
                    reportedDebit: totals.systemDebit,
                    reportedOthers: totals.systemOthers,
                    reportedFiado: totals.systemFiado,
                    systemCash: totals.systemCash,
                    systemPix: totals.systemPix,
                    systemCredit: totals.systemCredit,
                    systemDebit: totals.systemDebit,
                    systemOthers: totals.systemOthers,
                    systemFiado: totals.systemFiado,
                    orphanSales: totals.orphanSales,
                    totalSales: totals.totalSales,
                    difference: 0,
                    observations: 'Fechamento Automático (Missed Window)'
                }
            });

            await prisma.auditLog.create({
                data: {
                    userId: 'SYSTEM',
                    userName: 'SISTEMA',
                    action: 'CLOSE_CASH_AUTO',
                    details: `Sistema realizou o fechamento automático retroativo do caixa aberto em ${session.openedAt.toLocaleString('pt-BR')}`
                }
            });
        }
    } catch (err) {
        console.error('[AUTO-CLOSE] Error in auto-closure service:', err);
    }
};

export const manualAutoClose = async (req: Request, res: Response) => {
    try {
        await autoCloseCashSessions();
        res.json({ message: 'Auto fechamento processado com sucesso.' });
    } catch (error: any) {
        res.status(500).json({ message: 'Erro ao processar auto fechamento', error: error.message });
    }
};
