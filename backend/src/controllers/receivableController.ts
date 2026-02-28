import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// List all receivables, optionally filtered by status or clientId
export const getReceivables = async (req: Request, res: Response) => {
    try {
        const status = req.query.status as string;
        const clientId = req.query.clientId as string;
        const filter: any = {};

        if (status) filter.status = status;
        if (clientId) filter.clientId = clientId;

        const receivables = await prisma.receivable.findMany({
            where: filter,
            include: {
                client: { select: { name: true, phone: true } },
                order: { select: { id: true, total: true, createdAt: true } }
            },
            orderBy: { dueDate: 'asc' }
        });

        res.json(receivables);
    } catch (error) {
        console.error('Error fetching receivables:', error);
        res.status(500).json({ error: 'Erro ao buscar recebimentos' });
    }
};

// Create a receivable manually (Optional/Future use if not created via Order)
export const createReceivable = async (req: Request, res: Response) => {
    try {
        const { clientId, orderId, amount, dueDate, observations } = req.body;

        if (!clientId || !orderId || !amount || !dueDate) {
            return res.status(400).json({ error: 'Campos obrigatórios ausentes' });
        }

        const newReceivable = await prisma.receivable.create({
            data: {
                clientId,
                orderId,
                amount: parseFloat(amount),
                dueDate: new Date(dueDate),
                observations
            },
            include: { client: true }
        });

        res.status(201).json(newReceivable);
    } catch (error) {
        console.error('Error creating receivable:', error);
        res.status(500).json({ error: 'Erro ao criar recebimento' });
    }
};

// Update receivable (e.g. dueDate or observations)
export const updateReceivable = async (req: Request, res: Response) => {
    try {
        const id = req.params.id as string;
        const { dueDate, observations } = req.body;

        const updated = await prisma.receivable.update({
            where: { id },
            data: {
                ...(dueDate && { dueDate: new Date(dueDate) }),
                ...(observations !== undefined && { observations })
            }
        });

        res.json(updated);
    } catch (error) {
        console.error('Error updating receivable:', error);
        res.status(500).json({ error: 'Erro ao atualizar recebimento' });
    }
};

// Delete receivable (Admin Master Only)
export const deleteReceivable = async (req: Request, res: Response) => {
    try {
        const id = req.params.id as string;
        await prisma.receivable.delete({ where: { id } });
        res.json({ success: true });
    } catch (error) {
        console.error('Error deleting receivable:', error);
        res.status(500).json({ error: 'Erro ao excluir recebimento' });
    }
};

// Mark as PAID and inject into CashSession
export const receivePayment = async (req: Request, res: Response) => {
    try {
        const id = req.params.id as string;
        const { paymentMethod, userId } = req.body;

        if (!paymentMethod) {
            return res.status(400).json({ error: 'Método de pagamento obrigatório' });
        }

        const receivable = await prisma.receivable.findUnique({ where: { id }, include: { client: true } });
        if (!receivable) {
            return res.status(404).json({ error: 'Recebimento não encontrado' });
        }
        if (receivable.status === 'PAID') {
            return res.status(400).json({ error: 'Este título já foi pago' });
        }

        // 1. Update Receivable Status
        const updated = await prisma.receivable.update({
            where: { id },
            data: {
                status: 'PAID',
                paymentMethod,
                paidAt: new Date()
            }
        });

        // 2. Inject value into current OPEN CashSession
        const openSession = await prisma.cashSession.findFirst({
            where: { status: 'OPEN' },
            orderBy: { openedAt: 'desc' }
        });

        if (openSession) {
            // Find the user to log audit if needed
            const user = await prisma.user.findUnique({ where: { id: userId || openSession.openedBy } });

            // Add to system totals based on paymentMethod
            const updateData: any = {};
            const amount = receivable.amount;

            if (paymentMethod === 'DINHEIRO') {
                updateData.systemCash = { increment: amount };
            } else if (paymentMethod === 'PIX') {
                updateData.systemPix = { increment: amount };
            } else if (paymentMethod === 'CRÉDITO') {
                updateData.systemCredit = { increment: amount };
            } else if (paymentMethod === 'DÉBITO') {
                updateData.systemDebit = { increment: amount };
            } else {
                updateData.systemOthers = { increment: amount };
            }

            await prisma.cashSession.update({
                where: { id: openSession.id },
                data: updateData
            });

            // Audit Log
            if (user) {
                await prisma.auditLog.create({
                    data: {
                        userId: user.id,
                        userName: user.name,
                        action: 'RECEBIMENTO_FIADO',
                        details: `Baixa de fiado R$ ${amount.toFixed(2)} do cliente ${(receivable as any).client?.name || 'N/A'} em ${paymentMethod}`
                    }
                });
            }
        }

        res.json(updated);
    } catch (error) {
        console.error('Error receiving payment:', error);
        res.status(500).json({ error: 'Erro ao registrar pagamento do recebimento' });
    }
};
