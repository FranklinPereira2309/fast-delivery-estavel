const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function check() {
    const order = await prisma.order.findUnique({
        where: { id: 'TABLE-9' },
        include: { items: true }
    });
    console.log("Order TABLE-9:", JSON.stringify(order, null, 2));

    const tableItems = await prisma.orderItem.findMany({
        where: { tableSessionId: 9 }
    });
    console.log("Items with session 9:", JSON.stringify(tableItems, null, 2));
}

check().catch(console.error).finally(() => prisma.$disconnect());
