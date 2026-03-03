
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function check() {
    const users = await prisma.user.findMany({
        where: { permissions: { has: 'waiter' } },
        select: { id: true, name: true, email: true }
    });

    const waiters = await prisma.waiter.findMany({
        select: { id: true, name: true, email: true }
    });

    console.log('USERS with waiter permission:');
    console.dir(users);

    console.log('WAITERS in table:');
    console.dir(waiters);

    await prisma.$disconnect();
}

check().catch(console.error);
