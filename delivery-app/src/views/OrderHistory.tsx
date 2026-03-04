import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../services/api';
import type { Order } from '../types';
import { Icons } from '../constants';

const OrderHistory: React.FC = () => {
    const [orders, setOrders] = useState<Order[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const navigate = useNavigate();

    useEffect(() => {
        const fetchOrders = async () => {
            try {
                const data = await api.getMyOrders();
                setOrders(data);
            } catch (err) {
                console.error(err);
            } finally {
                setIsLoading(false);
            }
        };
        fetchOrders();
    }, []);

    const getStatusStyle = (status: string) => {
        switch (status) {
            case 'PENDING': return 'bg-amber-100 text-amber-700';
            case 'PREPARING': return 'bg-blue-100 text-blue-700';
            case 'READY': return 'bg-emerald-100 text-emerald-700';
            case 'OUT_FOR_DELIVERY': return 'bg-indigo-100 text-indigo-700';
            case 'DELIVERED': return 'bg-slate-100 text-slate-700';
            case 'CANCELLED': return 'bg-rose-100 text-rose-700';
            default: return 'bg-slate-100 text-slate-700';
        }
    };

    const getStatusLabel = (status: string) => {
        switch (status) {
            case 'PENDING': return 'Pendente';
            case 'PREPARING': return 'Em Preparo';
            case 'READY': return 'Pronto';
            case 'OUT_FOR_DELIVERY': return 'Em Rota';
            case 'DELIVERED': return 'Finalizado';
            case 'CANCELLED': return 'Cancelado';
            default: return status;
        }
    };

    if (isLoading) return <div className="h-screen flex items-center justify-center font-bold text-slate-400">Carregando histórico...</div>;

    return (
        <div className="min-h-screen bg-slate-50 pb-12">
            <div className="bg-white p-6 pb-8 rounded-b-[3.5rem] shadow-xl shadow-slate-200/40 flex items-center gap-4 relative overflow-hidden border-b border-slate-100">
                <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-50 rounded-full mix-blend-multiply filter blur-3xl opacity-50 animate-float"></div>
                <div className="absolute bottom-0 left-0 w-64 h-64 bg-rose-50 rounded-full mix-blend-multiply filter blur-3xl opacity-50 animate-float" style={{ animationDelay: '2s' }}></div>

                <button onClick={() => navigate('/')} className="w-12 h-12 bg-slate-50 rounded-2xl flex items-center justify-center text-slate-400 hover:text-indigo-600 hover:bg-white transition-all shadow-sm border border-slate-100 active:scale-95 z-10">
                    <Icons.ArrowLeft className="w-5 h-5" />
                </button>
                <div className="flex-1 z-10">
                    <h1 className="text-xl font-black text-slate-800 uppercase tracking-tighter italic">Meus Pedidos</h1>
                </div>
            </div>

            <div className="p-6 space-y-5 max-w-lg mx-auto">
                {orders.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-24 text-slate-400">
                        <div className="w-24 h-24 bg-slate-100 rounded-full flex items-center justify-center mb-6 shadow-inner">
                            <Icons.Smartphone className="w-10 h-10 text-slate-300" />
                        </div>
                        <p className="font-black uppercase text-xs tracking-widest text-slate-500">Nenhum Pedido Encontrado</p>
                        <p className="text-[10px] font-bold mt-2 text-slate-400">Faça seu primeiro pedido na tela inicial!</p>
                        <button onClick={() => navigate('/')} className="mt-8 px-8 py-4 bg-indigo-600 text-white rounded-2xl font-black uppercase text-[10px] tracking-widest shadow-xl shadow-indigo-200 hover:bg-indigo-700 transition-all">
                            Ir para o Cardápio
                        </button>
                    </div>
                ) : (
                    orders.map(order => (
                        <div key={order.id} className="bg-white p-6 rounded-[2rem] shadow-sm border border-slate-100 hover:shadow-md transition-shadow relative overflow-hidden group">
                            {/* Accent Line for pending/preparing */}
                            {['PENDING', 'PREPARING'].includes(order.status) && (
                                <div className="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-indigo-500 to-rose-500"></div>
                            )}

                            <div className="flex justify-between items-start mb-4">
                                <div>
                                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Pedido <span className="text-slate-700">#{order.id.slice(-4).toUpperCase()}</span></p>
                                    <p className="text-[11px] font-bold text-slate-500 mt-1 flex items-center gap-1.5">
                                        <Icons.Clock className="w-3 h-3" />
                                        {new Date(order.createdAt).toLocaleDateString('pt-BR')} às {new Date(order.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                                    </p>
                                </div>
                                <span className={`px-4 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest flex items-center gap-1.5 ${getStatusStyle(order.status)}`}>
                                    <span className="w-1.5 h-1.5 rounded-full bg-current opacity-60"></span>
                                    {getStatusLabel(order.status)}
                                </span>
                            </div>

                            <div className="py-4 border-y border-dashed border-slate-100 space-y-3">
                                {order.items.map((item: any, idx) => (
                                    <div key={idx} className="flex justify-between items-center text-sm">
                                        <span className="font-bold text-slate-700 flex items-center gap-2">
                                            <span className="text-indigo-600 font-black text-[10px] bg-indigo-50 px-2 py-0.5 rounded-lg">{item.quantity}x</span>
                                            {item.product?.name || item.productName || 'Item'}
                                        </span>
                                        <span className="font-black text-slate-500 text-xs">R$ {((item.price || 0) * item.quantity).toFixed(2)}</span>
                                    </div>
                                ))}
                            </div>

                            <div className="flex flex-col gap-2 pt-4">
                                {order.deliveryFee > 0 && (
                                    <div className="flex justify-between items-center text-slate-400">
                                        <span className="text-[10px] font-bold uppercase tracking-widest flex items-center gap-1.5">
                                            <Icons.Smartphone className="w-3 h-3 opacity-50" />
                                            Taxa de Entrega
                                        </span>
                                        <span className="text-xs font-bold">R$ {order.deliveryFee.toFixed(2)}</span>
                                    </div>
                                )}
                                <div className="flex justify-between items-center">
                                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Total Pago</span>
                                    <span className="text-xl font-black text-indigo-600 tracking-tighter">R$ {order.total.toFixed(2)}</span>
                                </div>
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
};

export default OrderHistory;
