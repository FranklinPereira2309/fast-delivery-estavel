const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const orders = await prisma.order.findMany({
        where: { tableNumber: 9 },
        orderBy: { updatedAt: 'desc' },
        take: 3
    });

    const sessions = await prisma.tableSession.findMany({
        where: { tableNumber: 9 }
    });

    console.log('--- ORDERS (Table 9) ---');
    orders.forEach(o => {
        console.log(`ID: ${o.id}, Status: ${o.status}, CreatedAt: ${o.createdAt.toISOString()}, UpdatedAt: ${o.updatedAt.toISOString()}, Client: ${o.clientName}`);
    });

    console.log('\n--- SESSIONS (Table 9) ---');
    sessions.forEach(s => {
        console.log(`Table: ${s.tableNumber}, Status: ${s.status}, StartTime: ${s.startTime.toISOString()}, Client: ${s.clientName}`);
    });
}

main().catch(console.error).finally(() => prisma.$disconnect());
