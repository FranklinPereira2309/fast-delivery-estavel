
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const settings = await prisma.businessSettings.findFirst();
    console.log('---DATABASE_SETTINGS_START---');
    console.log(JSON.stringify(settings, null, 2));
    console.log('---DATABASE_SETTINGS_END---');
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
