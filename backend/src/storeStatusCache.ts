import prisma from './prisma';
import { getIO } from './socket';

export interface StoreStatus {
    status: 'online' | 'offline';
    is_manually_closed: boolean;
    next_status_change: string | null;
}

let cachedSettings = {
    isManuallyClosed: true, // Começar fechado por segurança
    operatingHours: "[]"
};

let lastCalculatedStatus: 'online' | 'offline' = 'offline';

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
            cachedSettings.isManuallyClosed = (settings as any).isManuallyClosed ?? true;
            cachedSettings.operatingHours = (settings as any).operatingHours ?? "[]";
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
            return { status: 'offline', is_manually_closed: false, next_status_change: null };
        }

        const options: Intl.DateTimeFormatOptions = {
            timeZone: "America/Sao_Paulo",
            hour: 'numeric',
            minute: 'numeric',
            second: 'numeric',
            weekday: 'short',
            year: 'numeric',
            month: 'numeric',
            day: 'numeric',
            hour12: false
        };
        const formatter = new Intl.DateTimeFormat('en-US', options);
        const parts = formatter.formatToParts(new Date());
        const getPart = (type: string) => parts.find(p => p.type === type)?.value;

        // Current time in Sao Paulo
        const hour = parseInt(getPart('hour') || '0');
        const minute = parseInt(getPart('minute') || '0');
        const dayOfWeek = new Date().toLocaleDateString('en-US', { timeZone: 'America/Sao_Paulo', weekday: 'short' });
        const dayMap: Record<string, number> = { 'Sun': 0, 'Mon': 1, 'Tue': 2, 'Wed': 3, 'Thu': 4, 'Fri': 5, 'Sat': 6 };
        const currentDayNum = dayMap[dayOfWeek] ?? new Date().getDay();

        const currentTimeInt = hour * 60 + minute;

        // Log para depuração (apenas console do servidor)
        console.log(`[DEBUG StoreStatus] Dia: ${currentDayNum}, Hora SP: ${hour}:${minute}, TotalMin: ${currentTimeInt}`);

        const todayConfig = hours.find(h => h.dayOfWeek === currentDayNum);

        if (!todayConfig || !todayConfig.isOpen) {
            return { status: 'offline', is_manually_closed: false, next_status_change: getNextOpenTime(hours, new Date()) };
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

            // Get SP time parts again to create the closing date object
            const spString = new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" });
            const nextChangeDate = new Date(spString);

            if (closeTimeInt < openTimeInt && currentTimeInt >= openTimeInt) {
                // Closes tomorrow
                nextChangeDate.setDate(nextChangeDate.getDate() + 1);
            }
            nextChangeDate.setHours(closeParts[0], closeParts[1], 0, 0);

            return { status: 'online', is_manually_closed: false, next_status_change: nextChangeDate.toISOString() };
        } else {
            // It's closed.
            return { status: 'offline', is_manually_closed: false, next_status_change: getNextOpenTime(hours, new Date()) };
        }

    } catch (e) {
        console.error("Store status calculation error:", e);
        return { status: 'offline', is_manually_closed: false, next_status_change: null };
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
