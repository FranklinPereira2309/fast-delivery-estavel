import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
    const tableNumber = 10;
    console.log(`Cleaning table ${tableNumber}...`);
    try {
        const deleted = await prisma.tableSession.deleteMany({
            where: { tableNumber: tableNumber }
        });
        console.log(`Deleted sessions for table ${tableNumber}:`, deleted.count);
    } catch (error) {
        console.error('Error cleaning table:', error);
    } finally {
        await prisma.$disconnect();
    }
}

main();
