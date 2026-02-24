import prisma from './prisma';
import { getIO } from './socket';

export interface StoreStatus {
    status: 'online' | 'offline';
    is_manually_closed: boolean;
    next_status_change: string | null;
}

let cachedSettings = {
    isManuallyClosed: false,
    operatingHours: "[]"
};

let lastCalculatedStatus: 'online' | 'offline' = 'online';

export const updateCacheAndEmit = (isManuallyClosed: boolean, operatingHours: string) => {
    cachedSettings.isManuallyClosed = isManuallyClosed;
    cachedSettings.operatingHours = operatingHours;

    const current = calculateCurrentStoreStatus();
    if (current.status !== lastCalculatedStatus) {
        lastCalculatedStatus = current.status;
        getIO().emit('store_status_changed', current);
    }
}

export const loadSettingsToCache = async () => {
    try {
        const settings = await prisma.businessSettings.findUnique({ where: { key: 'main' } });
        if (settings) {
            cachedSettings.isManuallyClosed = settings.isManuallyClosed;
            cachedSettings.operatingHours = settings.operatingHours;
            // Initially set lastCalculatedStatus without emitting since no clients are connected yet
            lastCalculatedStatus = calculateCurrentStoreStatus().status;
        }
    } catch (e) {
        console.error("Error loading settings to cache", e);
    }
};

export const getStoreStatus = (): StoreStatus => {
    return calculateCurrentStoreStatus();
}

const calculateCurrentStoreStatus = (): StoreStatus => {
    if (cachedSettings.isManuallyClosed) {
        return {
            status: 'offline',
            is_manually_closed: true,
            next_status_change: null
        };
    }

    try {
        const hours = JSON.parse(cachedSettings.operatingHours);
        if (!Array.isArray(hours) || hours.length === 0) {
            return { status: 'online', is_manually_closed: false, next_status_change: null };
        }

        const nowObj = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
        const dayOfWeek = nowObj.getDay(); // 0 = Sunday
        const currentTimeInt = nowObj.getHours() * 60 + nowObj.getMinutes();

        const todayConfig = hours.find(h => h.dayOfWeek === dayOfWeek);

        if (!todayConfig || !todayConfig.isOpen) {
            return { status: 'offline', is_manually_closed: false, next_status_change: getNextOpenTime(hours, nowObj) };
        }

        const openParts = todayConfig.openTime.split(':').map(Number);
        const closeParts = todayConfig.closeTime.split(':').map(Number);
        const openTimeInt = openParts[0] * 60 + openParts[1];
        let closeTimeInt = closeParts[0] * 60 + closeParts[1];

        // Handle cases where store closes past midnight (e.g., 02:00)
        let isOpenNow = false;
        if (closeTimeInt < openTimeInt) {
            // Closes next day
            if (currentTimeInt >= openTimeInt || currentTimeInt < closeTimeInt) {
                isOpenNow = true;
            }
        } else {
            // Closes same day
            if (currentTimeInt >= openTimeInt && currentTimeInt < closeTimeInt) {
                isOpenNow = true;
            }
        }

        if (isOpenNow) {
            // It's open! Calculate next_status_change (closing time)
            const nextChangeDate = new Date(nowObj);
            if (closeTimeInt < openTimeInt && currentTimeInt >= openTimeInt) {
                // Closes tomorrow
                nextChangeDate.setDate(nextChangeDate.getDate() + 1);
            }
            nextChangeDate.setHours(closeParts[0], closeParts[1], 0, 0);

            // Format to ISO with offset -03:00 to be safe, or just use ISOString which is UTC.
            // Let's ensure the ISO string reflects the local time intent so frontend can parse easily.
            // standard ISO string is UTC, so we will just return it. The frontend `new Date(utcString)` will translate correctly to user's timezone.
            return { status: 'online', is_manually_closed: false, next_status_change: nextChangeDate.toISOString() };
        } else {
            // It's closed.
            return { status: 'offline', is_manually_closed: false, next_status_change: getNextOpenTime(hours, nowObj) };
        }

    } catch (e) {
        return { status: 'online', is_manually_closed: false, next_status_change: null };
    }
};

const getNextOpenTime = (hours: any[], nowObj: Date): string | null => {
    for (let i = 0; i < 7; i++) {
        const checkDate = new Date(nowObj);
        checkDate.setDate(checkDate.getDate() + i);
        const dayOfWeek = checkDate.getDay();
        const config = hours.find(h => h.dayOfWeek === dayOfWeek);

        if (config && config.isOpen) {
            const openParts = config.openTime.split(':').map(Number);
            const openTimeInt = openParts[0] * 60 + openParts[1];

            if (i === 0) {
                const currentTimeInt = nowObj.getHours() * 60 + nowObj.getMinutes();
                if (currentTimeInt >= openTimeInt) {
                    continue;
                }
            }

            checkDate.setHours(openParts[0], openParts[1], 0, 0);
            return checkDate.toISOString();
        }
    }
    return null;
}

// Check every minute if the status changed automatically
setInterval(() => {
    const current = calculateCurrentStoreStatus();
    if (current.status !== lastCalculatedStatus) {
        lastCalculatedStatus = current.status;
        getIO().emit('store_status_changed', current);
    }
}, 60000);
