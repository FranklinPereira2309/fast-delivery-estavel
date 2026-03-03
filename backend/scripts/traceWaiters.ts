
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function check() {
    const users = await prisma.user.findMany({ select: { id: true, name: true } });
    const waiters = await prisma.waiter.findMany({ select: { id: true, name: true } });

    const ordersWithWaiter = await prisma.order.findMany({
        where: { waiterId: { not: null } },
        select: { waiterId: true }
    });

    const uniqueWaiterIdsInOrders = [...new Set(ordersWithWaiter.map(o => o.waiterId))];

    console.log('Unique waiterIds in Orders table:');
    uniqueWaiterIdsInOrders.forEach(id => {
        const isUser = users.find(u => u.id === id);
        const isWaiter = waiters.find(w => w.id === id);
        console.log(`ID: ${id} - User: ${isUser?.name || 'NO'} - Waiter: ${isWaiter?.name || 'NO'}`);
    });

    await prisma.$disconnect();
}

check().catch(console.error);
