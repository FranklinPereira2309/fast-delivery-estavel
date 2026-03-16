import { Request, Response } from 'express';
import prisma from '../prisma';

export const getAllCoupons = async (req: Request, res: Response) => {
    try {
        const coupons = await prisma.coupon.findMany({
            orderBy: { createdAt: 'desc' }
        });
        res.json(coupons);
    } catch (error) {
        res.status(500).json({ message: 'Erro ao buscar cupons' });
    }
};

export const saveCoupon = async (req: Request, res: Response) => {
    const data = req.body;
    const { user, ...couponData } = data;
    const id = (data.id as string) || '';

    // Sanitize dates: empty strings should be null, otherwise valid Date objects
    if (couponData.startDate) {
        couponData.startDate = new Date(couponData.startDate);
    } else {
        couponData.startDate = new Date(); // Default to now if missing
    }

    if (couponData.endDate === '' || !couponData.endDate) {
        couponData.endDate = null;
    } else {
        couponData.endDate = new Date(couponData.endDate);
    }

    try {
        const coupon = await prisma.coupon.upsert({
            where: { id },
            update: couponData,
            create: couponData
        });

        if (user) {
            const isUpdate = !!data.id;
            await prisma.auditLog.create({
                data: {
                    userId: user.id,
                    userName: user.name,
                    action: isUpdate ? 'UPDATE_COUPON' : 'CREATE_COUPON',
                    details: `${isUpdate ? 'Atualizado' : 'Criado'} cupom ${coupon.code}.`
                }
            }).catch(e => console.error('Error creating audit log in saveCoupon:', e));
        }

        res.json(coupon);
    } catch (error: any) {
        if (error.code === 'P2002') {
            return res.status(400).json({ message: 'Um cupom com este código já existe.' });
        }
        res.status(500).json({ message: 'Erro ao salvar cupom' });
    }
};

export const deleteCoupon = async (req: Request, res: Response) => {
    const { id } = req.params;
    const { user } = req.body;

    try {
        // Check if coupon was ever used
        const coupon = await prisma.coupon.findUnique({ where: { id: id as string } });
        if (coupon && coupon.usedCount > 0) {
            await prisma.coupon.update({
                where: { id: id as string },
                data: { active: false }
            });
            return res.json({ message: 'Cupom desativado (já possui histórico de uso).' });
        }

        await prisma.coupon.delete({ where: { id: id as string } });

        if (user) {
            await prisma.auditLog.create({
                data: {
                    userId: user.id,
                    userName: user.name,
                    action: 'DELETE_COUPON',
                    details: `Cupom ID ${id} removido.`
                }
            }).catch(e => console.error('Error creating audit log in deleteCoupon:', e));
        }

        res.json({ message: 'Cupom removido com sucesso.' });
    } catch (error) {
        res.status(500).json({ message: 'Erro ao remover cupom' });
    }
};

export const validateCoupon = async (req: Request, res: Response) => {
    const { code, orderTotal } = req.body;

    try {
        const coupon = await prisma.coupon.findFirst({
            where: { code: code as string, active: true }
        });

        if (!coupon) {
            return res.status(404).json({ message: 'Cupom não encontrado ou inativo.' });
        }

        const now = new Date();
        if (coupon.startDate > now) {
            return res.status(400).json({ message: 'Este cupom ainda não é válido.' });
        }
        if (coupon.endDate && coupon.endDate < now) {
            return res.status(400).json({ message: 'Este cupom expirou.' });
        }
        if (coupon.usageLimit && coupon.usedCount >= coupon.usageLimit) {
            return res.status(400).json({ message: 'Este cupom atingiu o limite de uso.' });
        }
        if (coupon.minOrderValue && orderTotal < coupon.minOrderValue) {
            return res.status(400).json({ message: `O valor mínimo para este cupom é R$ ${coupon.minOrderValue.toFixed(2)}.` });
        }

        res.json(coupon);
    } catch (error) {
        res.status(500).json({ message: 'Erro ao validar cupom' });
    }
};
