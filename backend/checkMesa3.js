const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function check() {
    const o3 = await prisma.order.findUnique({
        where: { id: 'TABLE-3' },
        include: { items: true }
    });
    console.log("Mesa 3 Order items count: ", o3?.items?.length);
    if (o3?.items?.length) console.log(JSON.stringify(o3.items, null, 2));

    const t3 = await prisma.tableSession.findUnique({
        where: { tableNumber: 3 },
        include: { items: true }
    });
    console.log("Mesa 3 Session items count: ", t3?.items?.length);


    const o7 = await prisma.order.findUnique({
        where: { id: 'TABLE-7' },
        include: { items: true }
    });
    console.log("Mesa 7 Order items count: ", o7?.items?.length);

}

check().catch(console.error).finally(() => prisma.$disconnect());
