import { Request, Response } from 'express';
import prisma from '../prisma';

export const getAllProducts = async (req: Request, res: Response) => {
    const products = await prisma.product.findMany({
        where: { active: true },
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
    const id = req.params.id as string;
    try {
        // Check if there are any order items linked to this product
        const linkedOrderItemsCount = await prisma.orderItem.count({
            where: { productId: id }
        });

        if (linkedOrderItemsCount > 0) {
            // Soft delete: just mark as inactive
            await prisma.product.update({
                where: { id },
                data: { active: false }
            });
            return res.json({ message: 'O produto possui histórico de vendas e foi apenas removido do cardápio comercial.' });
        }

        // Permanent delete for items without history
        // Delete recipe first
        await prisma.recipeItem.deleteMany({
            where: { productId: id }
        });

        await prisma.product.delete({ where: { id } });
        res.json({ message: 'Produto removido permanentemente com sucesso.' });
    } catch (error: any) {
        console.error('Delete Product Error:', error);

        // Fallback for foreign key constraints if count failed or race condition
        if (error.code === 'P2003' || (error.message && error.message.includes('Foreign key constraint failed'))) {
            try {
                await prisma.product.update({
                    where: { id },
                    data: { active: false }
                });
                return res.json({ message: 'O produto possui histórico de vendas e foi apenas removido do cardápio comercial.' });
            } catch (innerError) {
                return res.status(400).json({
                    message: 'Não é possível excluir este produto devido a restrições de integridade.'
                });
            }
        }

        res.status(500).json({ message: 'Erro interno ao remover produto.' });
    }
};

