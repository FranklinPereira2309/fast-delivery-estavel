const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const orders = await prisma.order.findMany({
        where: {
            createdAt: { gte: today },
            status: 'DELIVERED',
            waiterId: null,
            type: 'TABLE'
        }
    });

    console.log(`Encontrados ${orders.length} pedidos de mesa sem garçom hoje.`);

    for (const order of orders) {
        // Tentar encontrar o garçom pelo nome do cliente ou mesa (heurística simples)
        // No caso do Kiko Pereira (Mesa 9), vamos tentar buscar se houve algum garçom logado com essa mesa
        // Como o log de sessões é deletado na finalização, se não houver registros históricos, 
        // talvez tenhamos que perguntar ao usuário ou buscar por outros pedidos da mesma mesa no mesmo dia.

        console.log(`Processando Pedido: ${order.id}, Mesa: ${order.tableNumber}, Cliente: ${order.clientName}`);

        // Vamos buscar o primeiro garçom ativo como fallback se não encontrarmos nada melhor
        // Mas o ideal é que o usuário nos diga.
    }
}

main().catch(console.error).finally(() => prisma.$disconnect());
