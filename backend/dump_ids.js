const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    console.log('--- USERS ---');
    const users = await prisma.user.findMany();
    users.forEach(u => console.log(`User: ${u.name}, ID: ${u.id}, Email: ${u.email}`));

    console.log('\n--- WAITERS ---');
    const waiters = await prisma.waiter.findMany();
    waiters.forEach(w => console.log(`Waiter: ${w.name}, ID: ${w.id}, Email: ${w.email}`));
}

main().catch(console.error).finally(() => prisma.$disconnect());
