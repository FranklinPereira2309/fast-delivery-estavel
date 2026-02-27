
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const settings = await prisma.businessSettings.findFirst({ where: { key: 'main' } });
    if (!settings) {
        console.log('No settings found');
        return;
    }
    console.log('---CONFIG---');
    console.log('Lat:', settings.restaurantLat);
    console.log('Lng:', settings.restaurantLng);
    console.log('Radius:', settings.geofenceRadius);
    console.log('---END---');
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
