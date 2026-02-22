const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function deepCleanTable1() {
    try {
        console.log("=== VERIFICANDO DADOS DA MESA 1 ===");

        // 1. Procurar qualquer TableSession para mesa 1
        const session = await prisma.tableSession.findUnique({
            where: { tableNumber: 1 },
            include: { items: true }
        });
        console.log("Sessão Ativa:", session ? "SIM, encontrada." : "NÃO.");

        if (session) {
            await prisma.tableSession.delete({ where: { tableNumber: 1 } });
            console.log("> Sessão da Mesa 1 removida.");
        }

        // 2. Procurar TODOS os pedidos da Mesa 1 que não estão cancelados ou entregues
        const activeOrders = await prisma.order.findMany({
            where: {
                // Procurar por 'tableNumber: 1' ou id que começa com 'TABLE-1'
                OR: [
                    { tableNumber: 1 },
                    { id: 'TABLE-1' }
                ],
                NOT: {
                    status: {
                        in: ['DELIVERED', 'CANCELLED']
                    }
                }
            },
            include: { items: true }
        });

        console.log(`Pedidos Abertos/Ativos da Mesa 1 encontrados: ${activeOrders.length}`);

        for (const order of activeOrders) {
            console.log(`> Fechando pedido: ${order.id} (Status atual: ${order.status})`);

            // Marcar itens como prontos para sair da cozinha
            for (const item of order.items) {
                if (!item.isReady) {
                    await prisma.orderItem.update({
                        where: { id: item.id },
                        data: { isReady: true, readyAt: new Date() }
                    });
                }
            }

            // Marcar pedido como DELIVERED
            await prisma.order.update({
                where: { id: order.id },
                data: { status: 'DELIVERED' }
            });
        }

        console.log("=== LIMPEZA CONCLUÍDA ===");
    } catch (e) {
        console.error("Erro na limpeza:", e);
    } finally {
        await prisma.$disconnect();
    }
}

deepCleanTable1();
