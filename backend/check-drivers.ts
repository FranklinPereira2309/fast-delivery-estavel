import { PrismaClient } from '@prisma/client';
import 'dotenv/config';

const prisma = new PrismaClient();

async function main() {
    try {
        const count = await prisma.deliveryDriver.count();
        console.log('Total drivers in database:', count);

        const drivers = await prisma.deliveryDriver.findMany();
        console.log('Driver list:', JSON.stringify(drivers, null, 2));
    } catch (error) {
        console.error('Error checking drivers:', error);
    } finally {
        await prisma.$disconnect();
    }
}

main();
