const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const waiters = await prisma.waiter.findMany();
    console.log('--- WAITERS ---');
    waiters.forEach(w => console.log(`ID: ${w.id}, Name: ${w.name}`));

    // Fix specific order for Mesa 9 (Kiko Pereira)
    const orderIdToFix = 'TABLE-9-F-1772537099775';

    // Heurística: Se houver apenas um garçom ativo, ou se o usuário nos disser.
    // Como não sabemos, vamos apenas listar e deixar o script de correção pronto para quando o usuário responder.
}

main().catch(console.error).finally(() => prisma.$disconnect());
