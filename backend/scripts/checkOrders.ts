
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function check() {
    const orders = await prisma.order.findMany({
        take: 5,
        orderBy: { createdAt: 'desc' },
        select: { id: true, waiterId: true, type: true }
    });

    console.log('RECENT ORDERS:');
    console.dir(orders);

    await prisma.$disconnect();
}

check().catch(console.error);
