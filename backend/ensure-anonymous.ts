import { PrismaClient } from '@prisma/client';
import 'dotenv/config';

const prisma = new PrismaClient();

async function main() {
    try {
        const client = await prisma.client.upsert({
            where: { id: 'ANONYMOUS' },
            update: {},
            create: {
                id: 'ANONYMOUS',
                name: 'Consumidor Final',
                phone: '0000000000',
                addresses: ['Balcão']
            }
        });
        console.log('Default anonymous client ensured:', client);
    } catch (error) {
        console.error('Error ensuring anonymous client:', error);
    } finally {
        await prisma.$disconnect();
    }
}

main();
