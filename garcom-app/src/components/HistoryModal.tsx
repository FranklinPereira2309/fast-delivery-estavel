import React, { useState, useEffect } from 'react';
import { X, TrendingUp, History, Clock, DollarSign, ClipboardList, Printer } from 'lucide-react';
import { db } from '../api';
import type { User, Order, TableSession, BusinessSettings } from '../types';

interface HistoryModalProps {
    user: User;
    tables: TableSession[];
    settings: BusinessSettings;
    resolvedWaiterId: string;
    onClose: () => void;
}

type Tab = 'COMMISSIONS' | 'ATTENDANCE';

const HistoryModal: React.FC<HistoryModalProps> = ({ user, tables, settings, resolvedWaiterId, onClose }) => {
    const [activeTab, setActiveTab] = useState<Tab>('COMMISSIONS');
    const [orders, setOrders] = useState<Order[]>([]);
    const [loading, setLoading] = useState(true);
    const [printingOrder, setPrintingOrder] = useState<Order | null>(null);

    useEffect(() => {
        const fetchOrders = async () => {
            try {
                const allOrders = await db.getOrders();

                // Fallback: If user.waiterId is missing (e.g. case mismatch during login), try matching by email
                let targetId = user.waiterId;
                if (!targetId) {
                    const waiters = await db.getWaiters();
                    const match = waiters.find((w: any) => w.email?.toLowerCase() === user.email.toLowerCase());
                    if (match) targetId = match.id;
                }

                const filtered = allOrders.filter((o: Order) =>
                    o.waiterId === targetId ||
                    o.waiterId === user.id ||
                    o.waiter?.email?.toLowerCase() === user.email.toLowerCase()
                );
                setOrders(filtered);
            } catch (err) {
                console.error('Error fetching orders for history:', err);
            } finally {
                setLoading(false);
            }
        };
        fetchOrders();
    }, [user.id, user.email]);

    const calculateCommissions = () => {
        const now = new Date();
        const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());

        // Start of week (Sunday)
        const startOfWeek = new Date(now);
        startOfWeek.setDate(now.getDate() - now.getDay());
        startOfWeek.setHours(0, 0, 0, 0);

        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

        const feePercentage = settings?.serviceFeePercentage || 10;
        const isFeeActive = settings?.serviceFeeStatus !== false;

        const getOrderCommission = (o: Order) => {
            if (o.appliedServiceFee !== null && o.appliedServiceFee !== undefined) return o.appliedServiceFee;
            if (isFeeActive && o.type === 'TABLE' && o.status !== 'CANCELLED') {
                return o.total - (o.total / (1 + (feePercentage / 100)));
            }
            return 0;
        };

        const dailyFinalized = orders
            .filter(o => new Date(o.createdAt || 0) >= startOfDay)
            .reduce((sum, o) => sum + getOrderCommission(o), 0);

        const weekly = orders
            .filter(o => new Date(o.createdAt || 0) >= startOfWeek)
            .reduce((sum, o) => sum + getOrderCommission(o), 0);

        const monthly = orders
            .filter(o => new Date(o.createdAt || 0) >= startOfMonth)
            .reduce((sum, o) => sum + getOrderCommission(o), 0);

        const currentWaiterId = resolvedWaiterId || user.waiterId || user.id;
        const isMyWaiter = (wid: string | null | undefined, wOrig?: any) =>
            wid === currentWaiterId ||
            wid === user.id ||
            wOrig?.email?.toLowerCase() === user.email.toLowerCase();

        const myActiveTables = tables.filter(t => {
            const isMyTable = isMyWaiter(t.waiterId) || (t.waiter && isMyWaiter(t.waiter.id));
            return t.status !== 'available' && isMyTable;
        });

        const activeCommission = myActiveTables.reduce((sum, t) => {
            if (!isFeeActive) return sum;
            const tableTotal = t.items.reduce((acc, it) => acc + (it.price * it.quantity), 0);
            return sum + (tableTotal * feePercentage / 100);
        }, 0);

        return { dailyFinalized, activeCommission, totalDaily: dailyFinalized + activeCommission, weekly, monthly };
    };

    const commissions = calculateCommissions();

    const formatTime = (dateStr?: string) => {
        if (!dateStr) return '';
        const date = new Date(dateStr);
        return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    };

    return (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-md flex flex-col p-4 animate-in fade-in duration-300" onClick={onClose}>
            <div
                className="mt-auto bg-slate-50 w-full rounded-[3rem] max-h-[92vh] flex flex-col shadow-2xl animate-in slide-in-from-bottom duration-500 overflow-hidden"
                onClick={e => e.stopPropagation()}
            >
                <header className="p-8 pb-4 flex justify-between items-start">
                    <div>
                        <div className="flex items-center gap-3 mb-2">
                            <span className="px-4 py-1.5 bg-blue-600 text-white text-[10px] font-black rounded-full uppercase tracking-widest shadow-lg shadow-blue-500/30">Meu Histórico</span>
                        </div>
                        <h2 className="text-2xl font-black text-slate-900 tracking-tighter uppercase leading-none">Desempenho</h2>
                    </div>
                    <button onClick={onClose} className="p-3 bg-white rounded-2xl text-slate-400 active:scale-90 transition-all shadow-sm border border-slate-100">
                        <X size={24} />
                    </button>
                </header>

                <div className="px-8 mb-6 flex gap-2">
                    <button
                        onClick={() => setActiveTab('COMMISSIONS')}
                        className={`flex-1 py-4 px-2 rounded-2xl border-2 transition-all flex items-center justify-center gap-2 font-black uppercase text-[10px] tracking-wider ${activeTab === 'COMMISSIONS' ? 'bg-blue-600 border-blue-700 text-white shadow-lg shadow-blue-500/20' : 'bg-white border-slate-100 text-slate-400'}`}
                    >
                        <DollarSign size={16} />
                        Comissões
                    </button>
                    <button
                        onClick={() => setActiveTab('ATTENDANCE')}
                        className={`flex-1 py-4 px-2 rounded-2xl border-2 transition-all flex items-center justify-center gap-2 font-black uppercase text-[10px] tracking-wider ${activeTab === 'ATTENDANCE' ? 'bg-blue-600 border-blue-700 text-white shadow-lg shadow-blue-500/20' : 'bg-white border-slate-100 text-slate-400'}`}
                    >
                        <ClipboardList size={16} />
                        Atendimentos
                    </button>
                </div>

                <main className="flex-1 overflow-y-auto px-8 pb-8 hide-scrollbar">
                    {loading ? (
                        <div className="flex flex-col items-center justify-center py-20 animate-pulse">
                            <Clock size={48} className="text-slate-200 mb-4" />
                            <p className="text-[10px] font-black uppercase tracking-widest text-slate-300 italic">Carregando dados...</p>
                        </div>
                    ) : (
                        <>
                            {activeTab === 'COMMISSIONS' && (
                                <div className="space-y-4">
                                    <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm flex flex-col gap-4 relative overflow-hidden">
                                        <div className="absolute top-0 right-0 w-32 h-32 bg-blue-50 rounded-bl-full -z-0 opacity-50"></div>
                                        <div className="flex justify-between items-center relative z-10 w-full mb-2">
                                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Produção Hoje</p>
                                            <TrendingUp className="text-blue-500" size={18} />
                                        </div>

                                        <div className="flex gap-4 relative z-10 border-b border-slate-100 pb-4">
                                            <div className="flex-1">
                                                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest leading-none mb-1">Finalizado</p>
                                                <h3 className="text-xl font-black text-emerald-600 tracking-tighter">R$ {commissions.dailyFinalized.toFixed(2)}</h3>
                                            </div>
                                            <div className="w-px bg-slate-100"></div>
                                            <div className="flex-1">
                                                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest leading-none mb-1">Em Aberto</p>
                                                <h3 className="text-xl font-black text-amber-500 tracking-tighter">+ R$ {commissions.activeCommission.toFixed(2)}</h3>
                                            </div>
                                        </div>

                                        <div className="flex justify-between items-end relative z-10">
                                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Total Projetado</p>
                                            <h3 className="text-3xl font-black text-blue-600 tracking-tighter">R$ {commissions.totalDaily.toFixed(2)}</h3>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm flex flex-col">
                                            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2">Semana</p>
                                            <h4 className="text-lg font-black text-slate-900 tracking-tighter mt-auto">R$ {commissions.weekly.toFixed(2)}</h4>
                                        </div>
                                        <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm flex flex-col">
                                            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2">Este Mês</p>
                                            <h4 className="text-lg font-black text-slate-900 tracking-tighter mt-auto">R$ {commissions.monthly.toFixed(2)}</h4>
                                        </div>
                                    </div>

                                    <div className="mt-8">
                                        <h5 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 mb-4 px-2">Dica de Desempenho</h5>
                                        <div className="bg-blue-50 p-6 rounded-[2rem] border border-blue-100 italic text-[11px] text-blue-600 leading-relaxed">
                                            "Mantenha um atendimento ágil e cordial para maximizar suas comissões diárias. Cada sorriso é uma oportunidade!"
                                        </div>
                                    </div>
                                </div>
                            )}

                            {activeTab === 'ATTENDANCE' && (
                                <div className="space-y-3">
                                    {orders.length === 0 ? (
                                        <div className="flex flex-col items-center justify-center py-20 text-slate-300">
                                            <History size={48} className="opacity-20 mb-4" />
                                            <p className="text-[10px] font-black uppercase tracking-widest italic">Nenhum atendimento recente</p>
                                        </div>
                                    ) : (
                                        orders.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()).map(order => (
                                            <div key={order.id} className="bg-white p-5 rounded-[1.5rem] border border-slate-100 shadow-sm flex items-center gap-4 active:scale-[0.98] transition-all">
                                                <div className="w-12 h-12 bg-slate-50 rounded-xl flex items-center justify-center text-slate-900 font-black italic text-lg border border-slate-100">
                                                    {order.tableNumber || 'B'}
                                                </div>
                                                <div className="flex-1">
                                                    <div className="flex items-center gap-2 mb-1">
                                                        <span className={`text-[8px] font-black px-2 py-0.5 rounded-full uppercase ${order.status === 'DELIVERED' ? 'bg-emerald-100 text-emerald-600' : 'bg-amber-100 text-amber-600'}`}>
                                                            {order.status === 'DELIVERED' ? 'Finalizado' : 'Em curso'}
                                                        </span>
                                                        <span className="text-[9px] font-black text-slate-300 flex items-center gap-1">
                                                            <Clock size={10} /> {formatTime(order.createdAt?.toString())}
                                                        </span>
                                                    </div>
                                                    <h4 className="text-xs font-black text-slate-900 uppercase truncate">
                                                        {order.clientName}
                                                        {order.type === 'COUNTER' && <span className="text-[8px] ml-2 text-slate-400 font-normal">(Balcão)</span>}
                                                    </h4>
                                                </div>
                                                <div className="text-right">
                                                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">Total</p>
                                                    <p className="text-sm font-black text-blue-600 tracking-tighter">R$ {order.total.toFixed(2)}</p>
                                                </div>
                                                <button
                                                    onClick={() => setPrintingOrder(order)}
                                                    className="p-2 text-blue-600 hover:bg-blue-50 rounded-xl transition-colors active:scale-95 border border-slate-50 shadow-sm ml-2"
                                                >
                                                    <Printer size={16} />
                                                </button>
                                            </div>
                                        ))
                                    )}
                                </div>
                            )}
                        </>
                    )}
                </main>
            </div>

            {printingOrder && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-md" onClick={() => setPrintingOrder(null)}>
                    <div className="relative w-full max-w-[80mm] bg-[#f9f9f5] p-8 shadow-2xl font-mono text-[11px] text-black animate-in zoom-in duration-200" onClick={e => e.stopPropagation()}>
                        <div className="text-center mb-6 border-b border-dashed border-slate-300 pb-4">
                            <h2 className="font-bold text-sm uppercase">{settings?.name || 'ESTABELECIMENTO'}</h2>
                            <p className="text-[10px] mt-2 uppercase">CÓPIA DE COMPROVANTE</p>
                        </div>
                        <div className="space-y-2 mb-6 border-b border-dashed border-slate-300 pb-4">
                            <p>DATA: {new Date(printingOrder.createdAt || new Date()).toLocaleString('pt-BR')}</p>
                            <p>CLIENTE: {printingOrder.clientName || 'Consumidor'}</p>
                            <p>PAGAMENTO: {printingOrder.paymentMethod || 'Pendente'}</p>
                            <p>GARÇOM: {user.name?.toUpperCase()}</p>
                        </div>

                        <div className="flex justify-between items-end mb-4 font-bold border-b border-dashed border-slate-300 pb-4">
                            <span className="text-[10px] uppercase">TAXA SERVIÇO:</span>
                            <span className="text-[11px]">R$ {((printingOrder.appliedServiceFee !== null && printingOrder.appliedServiceFee !== undefined) ? printingOrder.appliedServiceFee : (printingOrder.total - (printingOrder.total / (1 + ((settings?.serviceFeePercentage || 10) / 100))))).toFixed(2)}</span>
                        </div>

                        <div className="flex justify-between items-center mb-8">
                            <span className="font-bold text-[11px] uppercase">TOTAL:</span>
                            <span className="text-3xl font-bold tracking-tighter">R$ {printingOrder.total.toFixed(2)}</span>
                        </div>

                        <div className="flex flex-col gap-2 no-print">
                            <div className="flex gap-2">
                                <button onClick={() => window.print()} className="flex-[2] bg-slate-900 text-white font-bold py-4 rounded-3xl uppercase text-[10px] tracking-widest shadow-xl active:scale-95 transition-all">Imprimir</button>
                                <button onClick={() => setPrintingOrder(null)} className="flex-1 bg-slate-200 text-slate-600 font-bold py-4 rounded-3xl uppercase text-[10px] tracking-widest active:scale-95 transition-all">Fechar</button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default HistoryModal;
