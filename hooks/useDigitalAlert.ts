import { useState, useEffect, useRef, useCallback } from 'react';
import { socket } from '../services/socket';

export const useDigitalAlert = () => {
    const [isAlerting, setIsAlerting] = useState(false);
    const audioRef = useRef<HTMLAudioElement | null>(null);
    const playCountRef = useRef(0);
    const maxPlays = 3;

    useEffect(() => {
        // Initialize audio instance
        audioRef.current = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3');

        const handleAudioEnded = () => {
            playCountRef.current += 1;
            if (playCountRef.current < maxPlays && isAlerting) {
                audioRef.current?.play().catch(e => console.log('Audio play blocked', e));
            }
        };

        audioRef.current.addEventListener('ended', handleAudioEnded);

        return () => {
            if (audioRef.current) {
                audioRef.current.removeEventListener('ended', handleAudioEnded);
            }
        };
    }, [isAlerting]);

    useEffect(() => {
        const handleNewOrder = () => {
            setIsAlerting(true);
            playCountRef.current = 0;
            audioRef.current?.play().catch(e => console.log('Audio play blocked (needs interaction)', e));
        };

        socket.on('newOrder', handleNewOrder);

        return () => {
            socket.off('newOrder', handleNewOrder);
        };
    }, []);

    const dismissAlert = useCallback(() => {
        setIsAlerting(false);
        if (audioRef.current) {
            audioRef.current.pause();
            audioRef.current.currentTime = 0;
        }
    }, []);

    return { isAlerting, dismissAlert };
};
