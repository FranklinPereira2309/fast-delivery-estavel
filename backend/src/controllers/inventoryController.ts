import { Request, Response } from 'express';
import prisma from '../prisma';

export const getAllInventory = async (req: Request, res: Response) => {
    const items = await prisma.inventoryItem.findMany();
    res.json(items);
};

export const saveInventoryItem = async (req: Request, res: Response) => {
    const data = req.body;
    const item = await prisma.inventoryItem.upsert({
        where: { id: data.id || '' },
        update: data,
        create: data
    });
    res.json(item);
};

export const deleteInventoryItem = async (req: Request, res: Response) => {
    const { id } = req.params;
    await prisma.inventoryItem.delete({ where: { id: id as string } });
    res.json({ message: 'Item de estoque removido' });
};
