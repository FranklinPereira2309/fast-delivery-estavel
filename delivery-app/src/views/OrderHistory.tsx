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
            <div className="bg-white p-6 pb-8 rounded-b-[3rem] shadow-sm flex items-center gap-4">
                <button onClick={() => navigate('/')} className="p-3 bg-slate-100 rounded-2xl text-slate-600">
                    <Icons.ArrowLeft className="w-5 h-5" />
                </button>
                <h1 className="text-xl font-black text-slate-800 uppercase tracking-tighter">Meus Pedidos</h1>
            </div>

            <div className="p-6 space-y-4">
                {orders.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-20 opacity-40">
                        <Icons.Smartphone className="w-16 h-16 mb-4" />
                        <p className="font-bold uppercase text-xs tracking-widest">Nenhum pedido encontrado</p>
                    </div>
                ) : (
                    orders.map(order => (
                        <div key={order.id} className="bg-white p-6 rounded-[2.5rem] shadow-sm border border-slate-100 space-y-4">
                            <div className="flex justify-between items-start">
                                <div>
                                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Pedido #{order.id.slice(-4).toUpperCase()}</p>
                                    <p className="text-xs font-bold text-slate-500 mt-1">{new Date(order.createdAt).toLocaleDateString('pt-BR')} às {new Date(order.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</p>
                                </div>
                                <span className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest ${getStatusStyle(order.status)}`}>
                                    {getStatusLabel(order.status)}
                                </span>
                            </div>

                            <div className="py-2 border-y border-slate-50 space-y-2">
                                {order.items.map((item: any, idx) => (
                                    <div key={idx} className="flex justify-between text-xs font-bold text-slate-600">
                                        <span>{item.quantity}x {item.productName || 'Item'}</span>
                                        <span>R$ {(item.price * item.quantity).toFixed(2)}</span>
                                    </div>
                                ))}
                            </div>

                            <div className="flex justify-between items-center pt-2">
                                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Total Pago</span>
                                <span className="text-lg font-black text-slate-800 tracking-tighter">R$ {order.total.toFixed(2)}</span>
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
};

export default OrderHistory;
