import prisma from './prisma';
import { getStoreStatus, loadSettingsToCache } from './storeStatusCache';

async function check() {
    try {
        await loadSettingsToCache();
        const settings = await prisma.businessSettings.findUnique({ where: { key: 'main' } });
        console.log('--- DB SETTINGS ---');
        console.log('isManuallyClosed:', (settings as any)?.isManuallyClosed);
        console.log('operatingHours:', (settings as any)?.operatingHours);

        console.log('\n--- CALCULATED STATUS ---');
        const status = getStoreStatus();
        console.log(status);

        if (status.status === 'online') {
            console.log('\nSUCCESS: Store is ONLINE for ' + new Date().toLocaleTimeString());
        } else {
            console.log('\nWARNING: Store is still OFFLINE. Check logic.');
        }
    } catch (e) {
        console.error('Error during verification:', e);
    }
}

check();
