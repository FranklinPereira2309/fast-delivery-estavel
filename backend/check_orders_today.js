const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const orders = await prisma.order.findMany({
        where: {
            createdAt: {
                gte: today
            },
            status: 'DELIVERED'
        },
        orderBy: { createdAt: 'desc' }
    });

    console.log(`--- DELIVERED ORDERS TODAY (${today.toLocaleDateString()}) ---`);
    orders.forEach(o => {
        console.log(`ID: ${o.id}, Table: ${o.tableNumber}, Client: ${o.clientName}, Total: ${o.total}, Service: ${o.appliedServiceFee}, WaiterID: ${o.waiterId}`);
    });
}

main().catch(console.error).finally(() => prisma.$disconnect());
