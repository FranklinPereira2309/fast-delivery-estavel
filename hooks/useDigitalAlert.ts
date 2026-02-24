import { useState, useEffect, useCallback } from 'react';
import { socket } from '../services/socket';

let globalIsAlerting = false;
const listeners = new Set<(val: boolean) => void>();

const setGlobalAlert = (val: boolean) => {
    globalIsAlerting = val;
    listeners.forEach(fn => fn(val));
};

// Binds to socket globally ONCE
socket.on('newOrder', (data: { type?: string }) => {
    // Only alert for TABLE type (includes Digital Menu and manual table orders)
    // Ignore DELIVERY or TAKEAWAY for this specific module-wide alert
    if (data.type === 'TABLE') {
        setGlobalAlert(true);
    }
});

export const useDigitalAlert = () => {
    const [isAlerting, setIsAlerting] = useState(globalIsAlerting);

    useEffect(() => {
        setIsAlerting(globalIsAlerting);
        listeners.add(setIsAlerting);
        return () => {
            listeners.delete(setIsAlerting);
        };
    }, []);

    const dismissAlert = useCallback(() => {
        setGlobalAlert(false);
    }, []);

    return { isAlerting, dismissAlert };
};
