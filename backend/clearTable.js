const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    await prisma.tableSession.deleteMany({ where: { tableNumber: 1 } });
    console.log("Table 1 cleared");
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
