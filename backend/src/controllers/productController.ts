import { Request, Response } from 'express';
import prisma from '../prisma';

export const getAllProducts = async (req: Request, res: Response) => {
    const products = await prisma.product.findMany({
        include: { recipe: true }
    });
    res.json(products);
};

export const saveProduct = async (req: Request, res: Response) => {
    const data = req.body;
    const { recipe, ...productData } = data;

    const product = await prisma.product.upsert({
        where: { id: data.id || '' },
        update: {
            ...productData,
            recipe: recipe ? {
                deleteMany: {},
                create: recipe.map((r: any) => ({
                    inventoryItemId: r.inventoryItemId,
                    quantity: r.quantity,
                    wasteFactor: r.wasteFactor
                }))
            } : undefined
        },
        create: {
            ...productData,
            recipe: recipe ? {
                create: recipe.map((r: any) => ({
                    inventoryItemId: r.inventoryItemId,
                    quantity: r.quantity,
                    wasteFactor: r.wasteFactor
                }))
            } : undefined
        },
        include: { recipe: true }
    });
    res.json(product);
};

export const deleteProduct = async (req: Request, res: Response) => {
    const { id } = req.params;
    await prisma.product.delete({ where: { id: id as string } });
    res.json({ message: 'Produto removido' });
};
