const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const users = await prisma.user.findMany();
    const waiters = await prisma.waiter.findMany();

    console.log('--- USERS ---');
    users.forEach(u => console.log(`${u.email} | ID: ${u.id} | Name: ${u.name}`));

    console.log('\n--- WAITERS ---');
    waiters.forEach(w => console.log(`${w.email} | ID: ${w.id} | Name: ${w.name}`));
}

main().catch(console.error).finally(() => prisma.$disconnect());
