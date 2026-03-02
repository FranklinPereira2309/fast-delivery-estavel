import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
    const session = await prisma.tableSession.findUnique({
        where: { tableNumber: 10 },
        include: { items: true }
    });
    console.log('TABLE 10 SESSION:', JSON.stringify(session, null, 2));
}

main().finally(() => prisma.$disconnect());
