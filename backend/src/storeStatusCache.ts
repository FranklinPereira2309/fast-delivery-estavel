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

export const loadSettingsToCache = async (retries = 3) => {
    for (let i = 0; i < retries; i++) {
        try {
            const settings = await prisma.businessSettings.findUnique({ where: { key: 'main' } });
            if (settings) {
                cachedSettings.isManuallyClosed = (settings as any).isManuallyClosed ?? true;
                cachedSettings.operatingHours = (settings as any).operatingHours ?? "[]";
                // Initially set lastCalculatedStatus without emitting since no clients are connected yet
                lastCalculatedStatus = calculateCurrentStoreStatus().status;
                console.log(`[STATUS-CACHE] Settings loaded successfully (attempt ${i + 1})`);
                break;
            } else {
                console.warn(`[STATUS-CACHE] Main settings not found, using defaults.`);
                break;
            }
        } catch (e) {
            console.error(`[STATUS-CACHE] Error loading settings to cache (attempt ${i + 1}/${retries}):`, e);
            if (i < retries - 1) {
                // Wait 2 seconds before retrying
                await new Promise(resolve => setTimeout(resolve, 2000));
            }
        }
    }
};

export const getStoreStatus = (): StoreStatus => {
    return calculateCurrentStoreStatus();
}

const calculateCurrentStoreStatus = (): StoreStatus => {
    let hour = 0;
    let minute = 0;
    let todayConfig: any = null;

    const result = ((): StoreStatus => {
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

            // --- Lógica de Fuso Horário Robusta ---
            const now = new Date();
            
            // Usamos formatToParts para extrair os componentes EXATOS de SP, independente do fuso do servidor
            const formatter = new Intl.DateTimeFormat('en-US', {
                timeZone: "America/Sao_Paulo",
                hour: 'numeric', minute: 'numeric', second: 'numeric',
                weekday: 'short', year: 'numeric', month: 'numeric', day: 'numeric',
                hour12: false
            });
            
            const parts = formatter.formatToParts(now);
            const getP = (type: string) => parts.find(p => p.type === type)?.value || '0';
            
            hour = parseInt(getP('hour'));
            minute = parseInt(getP('minute'));
            
            const dayMap: Record<string, number> = { 'Sun': 0, 'Mon': 1, 'Tue': 2, 'Wed': 3, 'Thu': 4, 'Fri': 5, 'Sat': 6 };
            const currentDayNum = dayMap[getP('weekday')] ?? now.getDay();
            const currentTimeInt = hour * 60 + minute;

            todayConfig = hours.find((h: any) => h.dayOfWeek === currentDayNum);

            if (!todayConfig || !todayConfig.isOpen) {
                return { status: 'offline', is_manually_closed: false, next_status_change: getNextOpenTime(hours, now) };
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
                let y = parseInt(getP('year'));
                let m = parseInt(getP('month')) - 1; // 0-indexed month
                let d = parseInt(getP('day'));

                // If closes next day AND we are currently in the pre-midnight part of the shift
                if (closeTimeInt < openTimeInt && currentTimeInt >= openTimeInt) {
                    const tempDate = new Date(now.toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
                    tempDate.setDate(tempDate.getDate() + 1);
                    y = tempDate.getFullYear();
                    m = tempDate.getMonth();
                    d = tempDate.getDate();
                }

                // Construct Closing Date in SP context
                const closingDate = new Date(y, m, d, closeParts[0], closeParts[1], 0);
                
                // Convert back to real ISO (the closingDate created above is local to server, 
                // but we need the ISO to reflect the absolute time of SP)
                // A melhor forma de gerar o ISO correto sem depender do fuso do servidor:
                const closingISO = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}T${todayConfig.closeTime}:00-03:00`;

                return { status: 'online', is_manually_closed: false, next_status_change: new Date(closingISO).toISOString() };
            } else {
                // It's closed.
                const nextOpen = getNextOpenTime(hours, now);
                return { status: 'offline', is_manually_closed: false, next_status_change: nextOpen };
            }

        } catch (e) {
            console.error("Store status calculation error:", e);
            return { status: 'offline', is_manually_closed: false, next_status_change: null };
        }
    })();

    console.log(`[STATUS-CHECK] Status: ${result.status} (Manual: ${result.is_manually_closed}, Now: ${hour}:${minute}, Day: ${todayConfig?.dayOfWeek}, Open: ${todayConfig?.openTime})`);
    return result;
};

const getNextOpenTime = (hours: any[], nowObj: Date): string | null => {
    try {
        const spBase = new Date(nowObj.toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
        
        for (let i = 0; i < 7; i++) {
            const checkDate = new Date(spBase);
            checkDate.setDate(checkDate.getDate() + i);
            const dayOfWeek = checkDate.getDay();
            const config = hours.find(h => h.dayOfWeek === dayOfWeek);

            if (config && config.isOpen) {
                const openParts = config.openTime.split(':').map(Number);
                const openTimeInt = openParts[0] * 60 + openParts[1];

                if (i === 0) {
                    const currentTimeInt = spBase.getHours() * 60 + spBase.getMinutes();
                    if (currentTimeInt >= openTimeInt) {
                        continue;
                    }
                }

                const y = checkDate.getFullYear();
                const m = String(checkDate.getMonth() + 1).padStart(2, '0');
                const d = String(checkDate.getDate()).padStart(2, '0');
                
                const openISO = `${y}-${m}-${d}T${config.openTime}:00-03:00`;
                return new Date(openISO).toISOString();
            }
        }
    } catch (e) {
        console.error("Error calculating next open time:", e);
    }
    return null;
}

// Check every minute if the status changed automatically
setInterval(() => {
    const current = calculateCurrentStoreStatus();
    if (current.status !== lastCalculatedStatus) {
        console.log(`[AUTO-STATUS] Changing status from ${lastCalculatedStatus} to ${current.status}`);
        lastCalculatedStatus = current.status;
        getIO().emit('store_status_changed', current);
    }
}, 30000); // Check every 30 seconds for better precision
