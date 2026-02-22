const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkDB() {
    try {
        const order = await prisma.order.findUnique({
            where: { id: 'TABLE-3' },
            include: { items: true }
        });

        if (order) {
            for (const item of order.items) {
                await prisma.orderItem.update({
                    where: { id: item.id },
                    data: { observations: 'Sem cebola, bem passado (INJETADO MANUALMENTE PARA TESTE)' }
                });
            }
            console.log("Updated Table-3 with observations!");
        }

        const tableOrder = await prisma.order.findUnique({
            where: { id: 'TABLE-3' },
            include: { items: true }
        });

        console.log("Order TABLE-3:", tableOrder ? {
            id: tableOrder.id,
            status: tableOrder.status,
            createdAt: tableOrder.createdAt,
            items: tableOrder.items.map(it => ({ obs: it.observations, ready: it.isReady }))
        } : "Not found");

    } catch (e) {
        console.error(e);
    } finally {
        await prisma.$disconnect();
    }
}
checkDB();
