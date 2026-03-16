import React, { useEffect, useState } from 'react';
import { Bell, Ticket, MessageSquare, X } from 'lucide-react';
import { api } from '../services/api';

interface NotificationCenterModalProps {
    isOpen: boolean;
    onClose: () => void;
    clientId: string;
}

const NotificationCenterModal: React.FC<NotificationCenterModalProps> = ({ isOpen, onClose, clientId }) => {
    const [loading, setLoading] = useState(true);
    const [data, setData] = useState<{
        notifications: any[],
        coupons: any[],
        campaigns: any[]
    }>({ notifications: [], coupons: [], campaigns: [] });

    useEffect(() => {
        if (isOpen && clientId) {
            fetchData();
        }
    }, [isOpen, clientId]);

    const fetchData = async () => {
        try {
            setLoading(true);
            const res = await api.getNotifications(clientId);
            setData(res);
        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 animate-in fade-in duration-300">
            <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={onClose}></div>
            
            <div className="bg-white dark:bg-slate-900 w-full max-w-lg h-[80vh] rounded-[2.5rem] shadow-2xl dark:shadow-none relative animate-in zoom-in slide-in-from-bottom-8 duration-500 overflow-hidden flex flex-col">
                <div className="p-8 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-white dark:bg-slate-900 shrink-0">
                  <div className="flex items-center gap-3">
                      <div className="bg-indigo-50 dark:bg-indigo-900/40 p-2.5 rounded-2xl text-indigo-600 dark:text-indigo-400">
                          <Bell className="w-6 h-6" />
                      </div>
                      <h2 className="text-2xl font-black text-slate-800 dark:text-white tracking-tight">Notificações</h2>
                  </div>
                  <button onClick={onClose} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300">
                      <X className="w-6 h-6" />
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto p-6 space-y-8 bg-slate-50/50 dark:bg-slate-950/50">
                    {loading ? (
                        <div className="h-full flex flex-col items-center justify-center">
                            <div className="w-10 h-10 border-4 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin"></div>
                        </div>
                    ) : (
                        <>
                            {/* Campaigns Section */}
                            {data.campaigns.length > 0 && (
                                <div>
                                    <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 mb-4 ml-2">Campanhas Recentes</h3>
                                    <div className="space-y-3">
                                        {data.campaigns.map(camp => (
                                            <div key={camp.id} className="bg-white dark:bg-slate-900 p-5 rounded-3xl shadow-sm dark:shadow-none border border-slate-100 dark:border-slate-800">
                                                <div className="flex justify-between items-start mb-2">
                                                    <h4 className="font-bold text-slate-800 dark:text-white">{camp.title}</h4>
                                                    <span className="text-[9px] font-black text-indigo-500 bg-indigo-50 dark:bg-indigo-900/40 px-2 py-1 rounded-full">{new Date(camp.sentAt).toLocaleDateString()}</span>
                                                </div>
                                                <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">{camp.message}</p>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Coupons Section */}
                            {data.coupons.length > 0 && (
                                <div>
                                    <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 mb-4 ml-2">Seus Cupons</h3>
                                    <div className="space-y-3">
                                        {data.coupons.map(coupon => (
                                            <div key={coupon.id} className="bg-white dark:bg-slate-900 p-5 rounded-3xl shadow-sm dark:shadow-none border border-dashed border-indigo-200 dark:border-indigo-500/30 flex items-center gap-4">
                                                <div className="w-12 h-12 bg-indigo-50 dark:bg-indigo-900/40 rounded-2xl flex items-center justify-center text-indigo-600 dark:text-indigo-400 shrink-0">
                                                    <Ticket className="w-6 h-6" />
                                                </div>
                                                <div className="flex-1">
                                                    <div className="flex items-center gap-2 mb-1">
                                                        <span className="font-black text-indigo-600 dark:text-indigo-400 uppercase tracking-widest text-sm">{coupon.code}</span>
                                                    </div>
                                                    <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-1">{coupon.description}</p>
                                                </div>
                                                {coupon.endDate && (
                                                    <div className="text-right whitespace-nowrap">
                                                        <span className="text-[9px] font-black text-rose-500 dark:text-rose-400 uppercase block">Vence em</span>
                                                        <span className="text-[10px] font-bold text-slate-700 dark:text-slate-300">{new Date(coupon.endDate).toLocaleDateString()}</span>
                                                    </div>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Direct Notifications Section */}
                            {data.notifications.length > 0 && (
                                <div>
                                    <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 mb-4 ml-2">Histórico de Mensagens</h3>
                                    <div className="space-y-3">
                                        {data.notifications.map(notif => (
                                            <div key={notif.id} className="bg-white dark:bg-slate-900 p-5 rounded-3xl shadow-sm dark:shadow-none border border-slate-100 dark:border-slate-800 flex gap-4">
                                                <div className="w-10 h-10 bg-slate-50 dark:bg-slate-800 rounded-xl flex items-center justify-center text-slate-400 dark:text-slate-500 shrink-0">
                                                    <MessageSquare className="w-5 h-5" />
                                                </div>
                                                <div>
                                                    <h4 className="font-bold text-slate-800 dark:text-white text-sm mb-1">{notif.title}</h4>
                                                    <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">{notif.message}</p>
                                                    <span className="text-[9px] font-medium text-slate-400 dark:text-slate-500 mt-2 block">{new Date(notif.createdAt).toLocaleString()}</span>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {data.campaigns.length === 0 && data.coupons.length === 0 && data.notifications.length === 0 && (
                                <div className="h-full flex flex-col items-center justify-center text-center p-12">
                                    <div className="w-20 h-20 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center text-slate-300 dark:text-slate-600 mb-4">
                                        <Bell className="w-10 h-10" />
                                    </div>
                                    <p className="font-bold text-slate-400 dark:text-slate-500 tracking-tight">Cofre de notificações vazio!</p>
                                    <p className="text-sm text-slate-400 dark:text-slate-500 mt-1">Fique de olho, em breve novidades!</p>
                                </div>
                            )}
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};

export default NotificationCenterModal;
