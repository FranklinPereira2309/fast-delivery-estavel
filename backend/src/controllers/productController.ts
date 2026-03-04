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
    try {
        const id = req.params.id as string;

        // Delete recipe first
        await prisma.recipeItem.deleteMany({
            where: { productId: id }
        });

        // Try to delete the product
        await prisma.product.delete({ where: { id } });
        res.json({ message: 'Produto removido com sucesso.' });
    } catch (error: any) {
        console.error('Delete Product Error:', error);

        // Handle foreign key constraint (Prisma code P2003)
        if (error.code === 'P2003' || (error.message && error.message.includes('Foreign key constraint failed'))) {
            return res.status(400).json({
                message: 'Não é possível excluir este produto pois ele possui histórico de vendas. Sugerimos apenas renomeá-lo ou deixá-lo fora de estoque.'
            });
        }

        res.status(500).json({ message: 'Erro interno ao remover produto.' });
    }
};

