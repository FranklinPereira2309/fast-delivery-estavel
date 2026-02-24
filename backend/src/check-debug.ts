import prisma from './prisma';

async function check() {
    try {
        const settings = await prisma.businessSettings.findUnique({ where: { key: 'main' } });
        console.log('--- DB SETTINGS ---');
        console.log('Object keys:', Object.keys(settings || {}));
        console.log('Raw:', settings);
        console.log('isManuallyClosed:', (settings as any)?.isManuallyClosed);
        console.log('operatingHours:', (settings as any)?.operatingHours);
    } catch (e) {
        console.error('Error fetching settings:', e);
    }
}

check();
