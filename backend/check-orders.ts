import { PrismaClient } from '@prisma/client';
import 'dotenv/config';

const prisma = new PrismaClient();

async function main() {
    try {
        const orderCount = await prisma.order.count();
        const itemCount = await prisma.orderItem.count();
        console.log('Total orders:', orderCount);
        console.log('Total items:', itemCount);

        const orders = await prisma.order.findMany({
            include: { items: true }
        });
        console.log('Order Details:', JSON.stringify(orders, null, 2));
    } catch (error) {
        console.error('Error checking database:', error);
    } finally {
        await prisma.$disconnect();
    }
}

main();
