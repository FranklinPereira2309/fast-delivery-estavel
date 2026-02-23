const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
prisma.tableSession.findUnique({ where: { tableNumber: 9 } }).then(s => console.log(JSON.stringify(s, null, 2))).finally(() => prisma.$disconnect());
