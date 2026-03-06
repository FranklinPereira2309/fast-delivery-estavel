import React, { useState } from 'react';
import { useLocation } from 'react-router-dom';
import FooterNav from './FooterNav';
import { Icons } from '../constants';
import { api } from '../services/api';
import { socket } from '../services/socket';
import CustomAlert from './CustomAlert';
import type { StoreStatus } from '../types';

const Layout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const location = useLocation();
    const hideFooterPaths = ['/login', '/register', '/recover'];
    const shouldShowFooter = !hideFooterPaths.includes(location.pathname);

    const [isChatOpen, setIsChatOpen] = useState(false);
    const [hasUnread, setHasUnread] = useState(false);
    const [supportName, setSupportName] = useState('');
    const [supportMsg, setSupportMsg] = useState('');
    const [isSendingSupport, setIsSendingSupport] = useState(false);
    const [chatAlert, setChatAlert] = useState<{ type: 'SUCCESS' | 'DANGER' | 'INFO', title: string, message: string } | null>(null);

    // Business Status & Countdown
    const [isClosingSoon, setIsClosingSoon] = useState(false);
    const [countdown, setCountdown] = useState<string>('');
    const settingsRef = React.useRef<any>(null);
    const [storeStatus, setStoreStatus] = useState<StoreStatus | null>(null);

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
            setStoreStatus(status);
            settingsRef.current = s;
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
        const handleNewMessage = () => {
            if (!isChatOpen) {
                setHasUnread(true);
            }
        };

        socket.on('new_message', handleNewMessage);
        socket.on('new_support_message', handleNewMessage);
        socket.on('store_status_changed', (newStatus: StoreStatus) => {
            setStoreStatus(newStatus);
        });

        return () => {
            socket.off('new_message', handleNewMessage);
            socket.off('new_support_message', handleNewMessage);
            socket.off('store_status_changed');
        };
    }, [isChatOpen]);

    React.useEffect(() => {
        if (isChatOpen) {
            setHasUnread(false);
        }
    }, [isChatOpen]);

    const handleSendSupport = async () => {
        if (!supportMsg.trim()) {
            setChatAlert({ type: 'INFO', title: 'Atenção', message: 'Por favor, preencha sua solicitação.' });
            return;
        }
        setIsSendingSupport(true);
        try {
            await api.sendSupportMessage(supportName || null, supportMsg);
            setChatAlert({ type: 'SUCCESS', title: 'Sucesso', message: 'Solicitação enviada com sucesso!' });
            setSupportMsg('');
            setTimeout(() => {
                setIsChatOpen(false);
                setChatAlert(null);
            }, 2000);
        } catch (e) {
            setChatAlert({ type: 'DANGER', title: 'Erro', message: 'Erro ao enviar. Tente novamente.' });
        } finally {
            setIsSendingSupport(false);
        }
    };

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

            {children}

            {shouldShowFooter && (
                <FooterNav
                    onOpenChat={() => setIsChatOpen(true)}
                    hasUnread={hasUnread}
                />
            )}

            {/* Chat Modal */}
            {isChatOpen && (
                <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-4">
                    <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={() => !isSendingSupport && setIsChatOpen(false)}></div>
                    <div className="bg-white w-full max-w-md rounded-[2.5rem] shadow-2xl relative z-10 overflow-hidden animate-in slide-in-from-bottom duration-300">
                        <div className="p-8">
                            <div className="flex justify-between items-center mb-6">
                                <div>
                                    <h2 className="text-2xl font-black text-slate-800 tracking-tighter uppercase">Do que você precisa?</h2>
                                    <p className="text-[10px] font-black text-indigo-500 uppercase tracking-widest mt-1">Chat de Suporte</p>
                                </div>
                                <button onClick={() => setIsChatOpen(false)} className="w-10 h-10 flex items-center justify-center bg-slate-50 rounded-xl text-slate-400">
                                    <Icons.X className="w-5 h-5" />
                                </button>
                            </div>

                            <div className="space-y-4">
                                <div>
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 mb-1 block">Seu Nome (Opcional)</label>
                                    <input
                                        type="text"
                                        placeholder="Informe seu nome"
                                        value={supportName}
                                        onChange={e => setSupportName(e.target.value)}
                                        className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl font-bold text-sm focus:ring-4 focus:ring-indigo-50 transition-all"
                                    />
                                </div>
                                <div>
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 mb-1 block">Sua mensagem</label>
                                    <textarea
                                        placeholder="Preencha aqui sua solicitação"
                                        value={supportMsg}
                                        onChange={e => setSupportMsg(e.target.value)}
                                        rows={4}
                                        className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl font-bold text-sm focus:ring-4 focus:ring-indigo-50 transition-all resize-none"
                                    />
                                </div>
                            </div>

                            <button
                                onClick={handleSendSupport}
                                disabled={isSendingSupport}
                                className="w-full mt-6 bg-indigo-600 text-white p-5 rounded-3xl font-black uppercase text-[10px] tracking-widest shadow-xl shadow-indigo-200 disabled:opacity-50 transition-all active:scale-95 flex items-center justify-center gap-2"
                            >
                                {isSendingSupport ? (
                                    <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin"></div>
                                ) : (
                                    <>
                                        <Icons.MessageSquare className="w-4 h-4" />
                                        Enviar Solicitação
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {chatAlert && (
                <CustomAlert
                    isOpen={!!chatAlert}
                    type={chatAlert.type}
                    title={chatAlert.title}
                    message={chatAlert.message}
                    onConfirm={() => setChatAlert(null)}
                />
            )}
        </div>
    );
};

export default Layout;
