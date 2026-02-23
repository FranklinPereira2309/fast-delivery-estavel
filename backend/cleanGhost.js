const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function clean() {
    console.log("Cleaning corrupted pendingReviewItems on all tables...");
    await prisma.tableSession.updateMany({
        data: { pendingReviewItems: null, hasPendingDigital: false }
    });
    console.log("Done.");
}

clean().catch(console.error).finally(() => prisma.$disconnect());
