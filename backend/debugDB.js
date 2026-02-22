const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkDB() {
    try {
        const order = await prisma.order.findUnique({
            where: { id: 'TABLE-3' },
            include: { items: true }
        });

        console.log("Order TABLE-3:", order ? {
            id: order.id,
            status: order.status,
            createdAt: order.createdAt,
            items: order.items.map(it => ({ obs: it.observations, ready: it.isReady }))
        } : "Not found");

        const session = await prisma.tableSession.findUnique({
            where: { tableNumber: 3 }
        });

        console.log("Session TABLE-3:", session ? {
            status: session.status,
            startTime: session.startTime,
            pending: session.pendingReviewItems,
            hasPending: session.hasPendingDigital
        } : "Not found");

    } catch (e) {
        console.error(e);
    } finally {
        await prisma.$disconnect();
    }
}
checkDB();
