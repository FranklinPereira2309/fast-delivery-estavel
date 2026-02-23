import { useState, useEffect, useCallback } from 'react';
import { socket } from '../services/socket';

let globalIsAlerting = false;
const listeners = new Set<(val: boolean) => void>();

const setGlobalAlert = (val: boolean) => {
    globalIsAlerting = val;
    listeners.forEach(fn => fn(val));
};

const handleNewOrder = () => {
    setGlobalAlert(true);
};

// Binds to socket globally ONCE
socket.on('newOrder', handleNewOrder);

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
