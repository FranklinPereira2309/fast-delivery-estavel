import { Request, Response } from 'express';
import prisma from '../prisma';

export const getAllInventory = async (req: Request, res: Response) => {
    const items = await prisma.inventoryItem.findMany();
    res.json(items);
};

export const getInventoryMovements = async (req: Request, res: Response) => {
    const { start, end } = req.query;
    try {
        const movements = await prisma.inventoryMovement.findMany({
            where: {
                timestamp: {
                    gte: start ? new Date(`${start}T00:00:00.000-03:00`) : undefined,
                    lte: end ? new Date(`${end}T23:59:59.999-03:00`) : undefined,
                }
            },
            include: { inventoryItem: true },
            orderBy: { timestamp: 'desc' }
        });
        res.json(movements);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

export const saveInventoryItem = async (req: Request, res: Response) => {
    const data = req.body;
    try {
        const result = await prisma.$transaction(async (tx) => {
            const existingItem = data.id ? await tx.inventoryItem.findUnique({ where: { id: data.id } }) : null;

            const item = await tx.inventoryItem.upsert({
                where: { id: data.id || '' },
                update: data,
                create: data
            });

            // Log movement if quantity changed manually
            if (!existingItem || (existingItem && existingItem.quantity !== data.quantity)) {
                const diff = data.quantity - (existingItem?.quantity || 0);
                if (diff !== 0) {
                    await tx.inventoryMovement.create({
                        data: {
                            inventoryItemId: item.id,
                            type: diff > 0 ? 'INPUT' : 'OUTPUT',
                            quantity: Math.abs(diff),
                            reason: 'Ajuste Manual',
                        }
                    });
                }
            }
            return item;
        });
        res.json(result);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

export const deleteInventoryItem = async (req: Request, res: Response) => {
    const id = req.params.id as string;
    await prisma.inventoryItem.delete({ where: { id: id as string } });
    res.json({ message: 'Item de estoque removido' });
};
