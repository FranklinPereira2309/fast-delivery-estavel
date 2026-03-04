const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    try {
        await prisma.$executeRawUnsafe(`ALTER TABLE "BusinessSettings" ADD COLUMN IF NOT EXISTS "enableDeliveryApp" BOOLEAN NOT NULL DEFAULT true;`);
        await prisma.$executeRawUnsafe(`ALTER TABLE "BusinessSettings" ADD COLUMN IF NOT EXISTS "enableDigitalMenu" BOOLEAN NOT NULL DEFAULT true;`);
        await prisma.$executeRawUnsafe(`ALTER TABLE "BusinessSettings" ADD COLUMN IF NOT EXISTS "enableWaiterApp" BOOLEAN NOT NULL DEFAULT true;`);
        console.log("Columns added successfully");
    } catch (e) {
        console.error("Error adding columns (they might already exist):", e);
    }
}
main().catch(console.error).finally(() => prisma.$disconnect());
