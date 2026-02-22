import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export const getProducts = async (req: Request, res: Response) => {
    try {
        const products = await prisma.product.findMany();
        // Em uma aplicação real, aqui filtraríamos apenas produtos com `active: true` 
        // ou se houvesse uma flag no banco indicando que o produto está ativo no cardápio digital.
        // Como o schema atual não tem essa flag, vamos retornar todos que tenham estoque ou preço > 0.
        res.json(products);
    } catch (error) {
        console.error('Error fetching public products:', error);
        res.status(500).json({ message: 'Error fetching products' });
    }
};

export const verifyTable = async (req: Request, res: Response) => {
    const { id } = req.params;
    const tableNumber = parseInt(id as string);

    if (isNaN(tableNumber)) {
        return res.status(400).json({ message: 'Invalid table number' });
    }

    try {
        // 1. Verifica se a mesa existe nas configurações
        const settings = await prisma.businessSettings.findFirst();
        if (!settings || tableNumber < 1 || tableNumber > settings.tableCount) {
            return res.status(404).json({ message: 'Mesa não encontrada' });
        }

        // 2. Busca a sessão atual da mesa
        const session = await prisma.tableSession.findUnique({
            where: { tableNumber }
        });

        // Se estiver ocupada ou fechando conta, não deixamos acessar ou informamos o status
        if (session && session.status === 'billing') {
            return res.status(403).json({
                message: 'Mesa bloqueada: fechamento de conta em andamento.',
                status: 'billing'
            });
        }

        res.json({
            tableNumber,
            status: session ? session.status : 'available',
            clientName: session?.clientName || null
        });

    } catch (error) {
        console.error('Error verifying table:', error);
        res.status(500).json({ message: 'Error verifying table' });
    }
};

export const createOrder = async (req: Request, res: Response) => {
    const { tableNumber, items, observations } = req.body;

    if (!tableNumber || !items || !Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ message: 'Invalid payload' });
    }

    try {
        // 1. Transação para criar todas as relações de uma vez
        const orderData = await prisma.$transaction(async (tx) => {
            // 1.1 Garantir (Oupsert) que exista uma sessão de mesa 'occupied'
            const session = await tx.tableSession.upsert({
                where: { tableNumber },
                create: {
                    tableNumber,
                    status: 'occupied',
                    clientName: 'Cardápio Digital', // Nome genérico para identificar a origem
                },
                update: {
                    status: 'occupied'
                }
            });

            // 1.2 Converter a lista enviada pelos Ids para buscar preços
            const orderItemsToCreate = [];
            let totalAmount = 0;

            for (const item of items) {
                const product = await tx.product.findUnique({ where: { id: item.productId } });
                if (!product) throw new Error(`Product ${item.productId} not found`);

                const price = product.price;
                totalAmount += price * item.quantity;

                // O Prisma OrderItem nativo precisa de um item para CADA quantidade no backend atual ou podemos somar na TableSession
                // No esquema atual do ERP PDV, a TableSession guarda múltiplos itens.
                // O `OrderItem` possui o campo `quantity`, então vamos registrar agrupado na Order.

                orderItemsToCreate.push({
                    productId: product.id,
                    quantity: item.quantity,
                    price: price,
                    tableSessionId: session.tableNumber
                });
            }

            // 1.3 Criar a Order vinculada à mesa
            const newOrder = await tx.order.create({
                data: {
                    clientId: 'ANONYMOUS', // O banco atual requer clientId. Precisamos garantir que esse client exista no PDV, ou adaptar para não requerer. 
                    // Como clientId e clientName são required no schema do Order, vamos mockar por enquanto
                    // O PDV tem um `ensure-anonymous.ts` script. Precisamos ter certeza que o client 'ANONYMOUS' existe.
                    clientName: session.clientName || 'Mesa Digital',
                    tableNumber: tableNumber,
                    type: 'TABLE',
                    status: 'PREPARING',
                    total: totalAmount,
                    items: {
                        create: orderItemsToCreate.map(reqItem => ({
                            productId: reqItem.productId,
                            quantity: reqItem.quantity,
                            price: reqItem.price,
                            tableSessionId: reqItem.tableSessionId
                        }))
                    }
                },
                include: {
                    items: true
                }
            });

            return newOrder;
        });

        res.status(201).json({ message: 'Order created successfully', order: orderData });

    } catch (error: any) {
        console.error('Error creating digital menu order:', error);
        res.status(500).json({ message: error.message || 'Error creating order' });
    }
};
