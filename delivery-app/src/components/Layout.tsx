import React, { useState } from 'react';
import { useLocation } from 'react-router-dom';
import FooterNav from './FooterNav';
import { X, Phone, Facebook, Instagram, Globe, Ticket, ChevronRight } from 'lucide-react';
import { api } from '../services/api';
import { socket } from '../services/socket';
import type { BusinessSettings, StoreStatus } from '../types';

const Layout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const location = useLocation();
    const hideFooterPaths = ['/login', '/register', '/recover'];
    const shouldShowFooter = !hideFooterPaths.includes(location.pathname);

    const [hasUnread, setHasUnread] = useState(false);
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const [coupons, setCoupons] = useState<any[]>([]);

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
            
            // Also fetch coupons if sidebar is being prepared
            const c = await api.getCoupons();
            setCoupons(c || []);
            
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
                <>
                    {/* Hamburger Menu Button */}
                    <div className="fixed top-4 left-4 z-[70]">
                        <button
                            onClick={() => setIsSidebarOpen(true)}
                            className="w-12 h-12 bg-[#4f39f6] rounded-xl flex flex-col items-center justify-center gap-1.5 shadow-xl shadow-[#4f39f6]/20 active:scale-90 transition-all border-b-4 border-[#3a29c4]"
                        >
                            <div className="w-6 h-1 bg-white rounded-full"></div>
                            <div className="w-6 h-1 bg-white rounded-full"></div>
                            <div className="w-6 h-1 bg-white rounded-full"></div>
                        </button>
                    </div>

                    {/* Sidebar Overlay */}
                    <div
                        className={`fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[80] transition-opacity duration-300 ${isSidebarOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
                        onClick={() => setIsSidebarOpen(false)}
                    />

                    {/* Sidebar Content */}
                    <aside
                        className={`fixed top-0 left-0 h-full w-[85%] max-w-sm bg-white z-[90] shadow-2xl transition-transform duration-500 ease-out flex flex-col ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}
                    >
                        {/* Header with Campaign Logo */}
                        <div className="relative bg-[#4f39f6] p-8 pb-12 flex flex-col items-center justify-center text-center overflow-hidden">
                            <div className="absolute top-0 right-0 p-4">
                                <button onClick={() => setIsSidebarOpen(false)} className="bg-white/20 p-2 rounded-xl text-white">
                                    <X className="w-5 h-5" />
                                </button>
                            </div>
                            
                            <div className="absolute -bottom-12 -left-12 w-32 h-32 bg-white/10 rounded-full blur-2xl"></div>
                            <div className="absolute -top-12 -right-12 w-32 h-32 bg-black/10 rounded-full blur-2xl"></div>

                            {settings?.campaignLogoUrl ? (
                                <img src={settings.campaignLogoUrl} alt="Logo" className="w-24 h-24 object-contain mb-4 animate-in zoom-in duration-500 relative z-10" />
                            ) : (
                                <div className="w-20 h-20 bg-white/20 rounded-full flex items-center justify-center mb-4 relative z-10">
                                    <Globe className="w-10 h-10 text-white" />
                                </div>
                            )}
                            
                            <h2 className="text-white font-black uppercase tracking-tight text-xl relative z-10">Informações</h2>
                        </div>

                        {/* Content Scrollable */}
                        <div className="flex-1 overflow-y-auto px-6 py-8 space-y-8">
                            {/* Contact Info */}
                            <section className="space-y-4">
                                <h3 className="text-[10px] font-black uppercase text-slate-400 tracking-widest px-1">Contato & Social</h3>
                                <div className="space-y-2">
                                    <div className="bg-white p-4 rounded-2xl border border-slate-100 flex items-center gap-4 shadow-sm">
                                        <div className="w-10 h-10 bg-indigo-50 rounded-xl flex items-center justify-center text-[#4f39f6]">
                                            <Phone className="w-5 h-5" />
                                        </div>
                                        <div>
                                            <p className="text-[10px] font-black text-slate-400 uppercase">Telefone</p>
                                            <p className="text-sm font-bold text-slate-700">{settings?.phone || 'Não informado'}</p>
                                        </div>
                                    </div>

                                    {settings?.facebook && (
                                        <div className="bg-white p-4 rounded-2xl border border-slate-100 flex items-center gap-4">
                                            <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center text-blue-600">
                                                <Facebook className="w-5 h-5" />
                                            </div>
                                            <div>
                                                <p className="text-[10px] font-black text-slate-400 uppercase">Facebook</p>
                                                <p className="text-sm font-bold text-slate-700">@{settings.facebook}</p>
                                            </div>
                                        </div>
                                    )}

                                    {settings?.instagram && (
                                        <div className="bg-white p-4 rounded-2xl border border-slate-100 flex items-center gap-4">
                                            <div className="w-10 h-10 bg-rose-50 rounded-xl flex items-center justify-center text-rose-600">
                                                <Instagram className="w-5 h-5" />
                                            </div>
                                            <div>
                                                <p className="text-[10px] font-black text-slate-400 uppercase">Instagram</p>
                                                <p className="text-sm font-bold text-slate-700">@{settings.instagram}</p>
                                            </div>
                                        </div>
                                    )}

                                    {settings?.website && (
                                        <div className="bg-white p-4 rounded-2xl border border-slate-100 flex items-center gap-4">
                                            <div className="w-10 h-10 bg-slate-50 rounded-xl flex items-center justify-center text-slate-600">
                                                <Globe className="w-5 h-5" />
                                            </div>
                                            <div>
                                                <p className="text-[10px] font-black text-slate-400 uppercase">Site</p>
                                                <p className="text-sm font-bold text-slate-700">{settings.website.replace(/^https?:\/\//, '')}</p>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </section>

                            {/* Active Coupons */}
                            {coupons.length > 0 && (
                                <section className="space-y-4">
                                    <h3 className="text-[10px] font-black uppercase text-slate-400 tracking-widest px-1">Cupons Disponíveis</h3>
                                    <div className="space-y-3">
                                        {coupons.map(coupon => (
                                            <div key={coupon.id} className="bg-white p-4 rounded-2xl border-2 border-dashed border-[#4f39f6]/20 flex items-center gap-4 relative overflow-hidden group">
                                                <div className="absolute top-0 right-0 w-8 h-8 bg-[#4f39f6] rounded-bl-2xl flex items-center justify-center text-white scale-0 group-hover:scale-100 transition-transform">
                                                    <Ticket className="w-4 h-4" />
                                                </div>
                                                <div className="flex-1">
                                                    <div className="text-sm font-black text-slate-800 uppercase tracking-tight group-hover:text-[#4f39f6] transition-colors">{coupon.code}</div>
                                                    <div className="text-[10px] font-bold text-[#4f39f6] uppercase">{coupon.description || 'Desconto imperdível'}</div>
                                                </div>
                                                <div className="text-right">
                                                    <div className="text-xs font-black text-slate-400">VÁLIDO ATÉ</div>
                                                    <div className="text-[10px] font-bold text-slate-600">{coupon.endDate ? new Date(coupon.endDate).toLocaleDateString() : 'INDETERMINADO'}</div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </section>
                            )}
                        </div>

                        {/* Footer Section */}
                        <div className="p-6 border-t border-slate-100 bg-slate-50 flex flex-col gap-4">
                            <div className="flex flex-col items-center justify-center pt-2 opacity-50 grayscale hover:grayscale-0 transition-all">
                                <p className="text-[8px] font-black uppercase tracking-widest text-slate-400 mb-1">Tecnologia por</p>
                                <div className="flex items-center gap-1.5">
                                    <img src="/logo_fransoft.png" alt="Fransoft Logo" className="w-6 h-6 object-contain" />
                                    <span className="text-slate-900 font-extrabold text-xs tracking-tighter uppercase">Fransoft <span className="text-indigo-600 font-medium">Developer®</span></span>
                                </div>
                            </div>
                        </div>
                    </aside>

                    {children}
                </>
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
