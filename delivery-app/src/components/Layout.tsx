import React, { useState } from 'react';
import { useLocation } from 'react-router-dom';
import FooterNav from './FooterNav';
import { api } from '../services/api';
import { socket } from '../services/socket';
import type { BusinessSettings, StoreStatus } from '../types';

const Layout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const location = useLocation();
    const hideFooterPaths = ['/login', '/register', '/recover'];
    const shouldShowFooter = !hideFooterPaths.includes(location.pathname);

    const [hasUnread, setHasUnread] = useState(false);

    // Business Status & Countdown
    const [isClosingSoon, setIsClosingSoon] = useState(false);
    const [countdown, setCountdown] = useState<string>('');
    const settingsRef = React.useRef<BusinessSettings | null>(null);
    const [storeStatus, setStoreStatus] = useState<StoreStatus | null>(null);
    const [settings, setSettings] = useState<BusinessSettings | null>(null);

    const updateCountdown = React.useCallback(() => {
        const s = settingsRef.current;
        if (s && s.operatingHours && !s.isManuallyClosed) {
            try {
                const hours = JSON.parse(s.operatingHours);
                const now = new Date();
                const day = now.getDay();
                const config = hours.find((h: any) => h.dayOfWeek === day);

                if (config && config.isOpen) {
                    const [closeH, closeM] = config.closeTime.split(':').map(Number);
                    const closeDate = new Date();
                    closeDate.setHours(closeH, closeM, 0);

                    const diffMs = closeDate.getTime() - now.getTime();
                    if (diffMs > 0 && diffMs <= 30 * 60 * 1000) {
                        setIsClosingSoon(true);
                        const mins = Math.floor(diffMs / 60000);
                        const secs = Math.floor((diffMs % 60000) / 1000);
                        setCountdown(`${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`);
                    } else {
                        setIsClosingSoon(false);
                    }
                } else {
                    setIsClosingSoon(false);
                }
            } catch (e) {
                console.error("Error parsing operating hours:", e);
            }
        }
    }, []);

    const fetchSettings = React.useCallback(async () => {
        try {
            const [s, status] = await Promise.all([
                api.getSettings(),
                api.getStoreStatus()
            ]);
            setStoreStatus(status as StoreStatus);
            settingsRef.current = s as BusinessSettings;
            setSettings(s as BusinessSettings);
            updateCountdown();
        } catch (err) {
            console.error("Error fetching settings in Layout:", err);
        }
    }, [updateCountdown]);

    // Initial fetch and periodic settings fetch (every 15s)
    React.useEffect(() => {
        fetchSettings();
        const settingsInterval = setInterval(fetchSettings, 15000);
        return () => clearInterval(settingsInterval);
    }, [fetchSettings]);

    // Real-time countdown interval (every 1s)
    React.useEffect(() => {
        const countdownInterval = setInterval(updateCountdown, 1000);
        return () => clearInterval(countdownInterval);
    }, [updateCountdown]);

    React.useEffect(() => {
        const handleNewMessage = (msg: any) => {
            const clientStr = localStorage.getItem('delivery_app_client');
            if (clientStr) {
                const client = JSON.parse(clientStr);
                // Only mark as unread if it's for this client, it's from admin, and we're not on chat page
                if (msg.clientId === client.id && msg.isAdmin && location.pathname !== '/chat') {
                    setHasUnread(true);
                }
            }
        };

        socket.on('new_support_message', handleNewMessage);
        socket.on('store_status_changed', (newStatus: StoreStatus) => {
            setStoreStatus(newStatus);
        });

        return () => {
            socket.off('new_support_message', handleNewMessage);
            socket.off('store_status_changed');
        };
    }, [location.pathname]);

    React.useEffect(() => {
        if (location.pathname === '/chat') {
            setHasUnread(false);
        }
    }, [location.pathname]);

    return (
        <div className={`min-h-screen bg-slate-50 ${shouldShowFooter ? 'pb-28' : ''}`}>
            {/* Banner de Status da Loja (Global) */}
            {(storeStatus?.status === 'offline' || isClosingSoon) && (
                <div className={`text-center py-2 text-[10px] font-black uppercase tracking-widest text-white px-4 sticky top-0 z-[60] animate-in slide-in-from-top duration-300 ${storeStatus?.status === 'offline' ? 'bg-rose-600/90 backdrop-blur-md' : 'bg-orange-500/90 backdrop-blur-md'}`}>
                    {storeStatus?.status === 'offline'
                        ? (storeStatus.is_manually_closed
                            ? 'Estamos fechados no momento. Retornaremos em breve!'
                            : 'Loja fora do horário de funcionamento')
                        : `Atenção: A loja fechará em ${countdown} minutos!`
                    }
                </div>
            )}

            {settings && settings.enableDeliveryApp === false ? (
                <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-8 text-center select-none relative overflow-hidden">
                    <div className="w-24 h-24 bg-rose-600 rounded-3xl flex items-center justify-center shadow-2xl shadow-rose-500/20 transform -rotate-12 mb-8 animate-bounce">
                        <span className="text-white text-4xl font-black">!</span>
                    </div>
                    <h1 className="text-3xl font-black text-white tracking-tighter uppercase mb-4">Módulo Desativado</h1>
                    <p className="text-slate-400 font-bold uppercase text-[10px] tracking-widest leading-relaxed max-w-xs">
                        O acesso ao aplicativo de delivery foi desativado nas configurações do estabelecimento.
                    </p>
                    <div className="mt-12 h-1 w-12 bg-rose-600 rounded-full"></div>
                </div>
            ) : (
                children
            )}

            {shouldShowFooter && (
                <FooterNav
                    hasUnread={hasUnread}
                />
            )}
        </div>
    );
};

export default Layout;
