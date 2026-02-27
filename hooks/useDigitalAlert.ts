import { useState, useEffect, useCallback } from 'react';
import { socket } from '../services/socket';

let globalIsAlerting = false;
const listeners = new Set<(val: boolean) => void>();

// Reliable notification sound
const ALERT_SOUND_URL = 'https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3';
const audio = new Audio(ALERT_SOUND_URL);

const setGlobalAlert = (val: boolean) => {
    globalIsAlerting = val;
    listeners.forEach(fn => fn(val));

    if (val) {
        audio.play().catch(e => console.log('Audio play blocked by browser policy. User must interact first.', e));
    }
};

// Binds to socket globally ONCE
socket.on('newOrder', (data: any) => {
    // Only alert for TABLE type (includes Digital Menu and manual table orders)
    // Ignore DELIVERY or TAKEAWAY for this specific module-wide alert
    if (data.type === 'TABLE' || data.isOriginDigitalMenu) {
        setGlobalAlert(true);
    }
});

socket.on('newFeedback', () => {
    setGlobalAlert(true);
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
