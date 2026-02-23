import { useState, useEffect, useCallback } from 'react';
import { socket } from '../services/socket';

let globalIsAlerting = false;
let globalAudio: HTMLAudioElement | null = null;
let playCount = 0;
const MAX_PLAYS = 3;
const listeners = new Set<(val: boolean) => void>();

const setGlobalAlert = (val: boolean) => {
    globalIsAlerting = val;
    listeners.forEach(fn => fn(val));
};

const handleAudioEnded = () => {
    playCount += 1;
    if (playCount < MAX_PLAYS && globalIsAlerting && globalAudio) {
        globalAudio.play().catch(e => console.log('Audio loop blocked:', e));
    }
};

const handleNewOrder = () => {
    setGlobalAlert(true);
    playCount = 0;

    if (!globalAudio) {
        globalAudio = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3');
        globalAudio.addEventListener('ended', handleAudioEnded);
    }

    globalAudio.currentTime = 0;
    globalAudio.play().catch(e => console.log('Audio play blocked (needs interaction)', e));
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
        if (globalAudio) {
            globalAudio.pause();
            globalAudio.currentTime = 0;
        }
    }, []);

    return { isAlerting, dismissAlert };
};
