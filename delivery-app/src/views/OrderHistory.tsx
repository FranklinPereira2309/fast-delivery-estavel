import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../services/api';
import { socket } from '../services/socket';
import type { Order } from '../types';
import { Icons } from '../constants';

const paymentLabels: Record<string, string> = {
    'CREDIT': 'Cartão de Crédito',
    'DEBIT': 'Cartão de Débito',
    'CASH': 'Dinheiro',
    'PIX': 'PIX'
};

const OrderHistory: React.FC = () => {
    const [orders, setOrders] = useState<Order[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [printingOrder, setPrintingOrder] = useState<Order | null>(null);
    const [businessSettings, setBusinessSettings] = useState<any>(null);
    const navigate = useNavigate();

    useEffect(() => {
        const clientStr = localStorage.getItem('delivery_app_client');
        const client = clientStr ? JSON.parse(clientStr) : null;

        const joinRoom = () => {
            if (client && client.id) {
                socket.emit('join_client', client.id);
            }
        };

        joinRoom();

        const fetchData = async () => {
            try {
                const [ordersData, settingsData] = await Promise.all([
                    api.getMyOrders(),
                    api.getSettings().catch(() => null)
                ]);
                setOrders(ordersData);
                setBusinessSettings(settingsData);
            } catch (err) {
                console.error(err);
            } finally {
                setIsLoading(false);
            }
        };

        fetchData();
        const interval = setInterval(fetchData, 5000);

        const handleOrderUpdate = (data?: any) => {
            console.log('Real-time order update received:', data);
            fetchData();
        };

        socket.on('connect', joinRoom);
        socket.on('orderUpdated', handleOrderUpdate);
        socket.on('statusUpdated', handleOrderUpdate);
        socket.on('newOrder', handleOrderUpdate);

        return () => {
            clearInterval(interval);
            socket.off('connect', joinRoom);
            socket.off('orderUpdated', handleOrderUpdate);
            socket.off('statusUpdated', handleOrderUpdate);
            socket.off('newOrder', handleOrderUpdate);
        };
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
                                {((order.deliveryFee ?? 0) > 0) && (
                                    <div className="flex justify-between items-center text-slate-400">
                                        <span className="text-[10px] font-bold uppercase tracking-widest flex items-center gap-1.5">
                                            <Icons.Smartphone className="w-3 h-3 opacity-50" />
                                            Taxa de Entrega
                                        </span>
                                        <span className="text-xs font-bold">R$ {(order.deliveryFee ?? 0).toFixed(2)}</span>
                                    </div>
                                )}
                                <div className="flex justify-between items-center">
                                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Total Pago</span>
                                    <span className="text-xl font-black text-indigo-600 tracking-tighter">R$ {order.total.toFixed(2)}</span>
                                </div>
                                <button
                                    onClick={() => setPrintingOrder(order)}
                                    className="mt-2 w-full flex items-center justify-center gap-2 py-3 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl font-black uppercase text-[10px] tracking-widest transition-all"
                                >
                                    <Icons.Print className="w-4 h-4" /> Comprovante
                                </button>
                            </div>
                        </div>
                    ))
                )}
            </div>

            {printingOrder && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-md animate-in fade-in duration-300">
                    <div className="absolute inset-0 no-print" onClick={() => setPrintingOrder(null)}></div>
                    <div className="bg-white w-full max-w-[80mm] border border-dashed shadow-2xl p-8 is-receipt animate-in zoom-in duration-300 overflow-y-auto max-h-[95vh] custom-scrollbar relative">
                        <div className="text-center mb-6 border-b border-dashed pb-4">
                            <h2 className="font-black text-sm uppercase tracking-tighter">{businessSettings?.name || 'Sistema de Delivery'}</h2>
                            {businessSettings?.cnpj && <p className="text-[9px] font-bold mt-1">CNPJ: {businessSettings.cnpj}</p>}
                            <p className="text-[10px] font-black mt-3 border border-slate-900 py-1 uppercase tracking-widest">Comprovante de Pagamento</p>
                        </div>

                        <div className="space-y-1 mb-4 text-[11px] font-receipt">
                            <p>DATA: {new Date(printingOrder.createdAt).toLocaleString('pt-BR')}</p>
                            <p className="uppercase">CLIENTE: {printingOrder.clientName}</p>
                            {printingOrder.clientPhone && <p>FONE: {printingOrder.clientPhone}</p>}
                            {printingOrder.clientAddress && (
                                <p className="font-bold border-t border-dashed mt-2 pt-1 uppercase leading-tight">ENTREGA: {printingOrder.clientAddress}</p>
                            )}
                            <p>STATUS: {(getStatusLabel(printingOrder.status)).toUpperCase()}</p>

                            <div className="mt-2 pt-2 border-t border-dashed w-full">
                                <div className="flex justify-between items-center bg-slate-50 p-2 rounded-lg border border-slate-100 no-print">
                                    <p className="font-black text-[10px]">PAGTO: {(paymentLabels[(printingOrder.paymentMethod || '').toUpperCase()] || printingOrder.paymentMethod || 'PENDENTE').toUpperCase()}</p>
                                </div>
                                <p className="font-black hidden print:block pt-1 text-[10px]">PAGTO: {(paymentLabels[(printingOrder.paymentMethod || '').toUpperCase()] || printingOrder.paymentMethod || 'PENDENTE').toUpperCase()}</p>
                            </div>
                        </div>

                        <div className="border-t border-dashed my-3 py-3 font-receipt">
                            {printingOrder.items.map((it: any, idx: number) => {
                                const prodName = it.product?.name || it.productName || 'PRODUTO';
                                return (
                                    <div key={idx} className="flex justify-between font-black uppercase py-0.5 text-[11px]">
                                        <span>{it.quantity}x {prodName.substring(0, 18)}</span>
                                        <span>R$ {((it.price || 0) * it.quantity).toFixed(2)}</span>
                                    </div>
                                );
                            })}
                        </div>

                        <div className="flex flex-col gap-1 font-receipt">
                            <div className="flex justify-between items-center py-1">
                                <span className="text-[10px] font-black uppercase">SUBTOTAL:</span>
                                <span className="font-black text-xs">R$ {(printingOrder.total - (printingOrder.deliveryFee || 0)).toFixed(2)}</span>
                            </div>

                            {((printingOrder.deliveryFee || 0) > 0) && (
                                <div className="flex justify-between items-center py-1">
                                    <span className="text-[10px] uppercase font-bold">TAXA ENTREGA:</span>
                                    <span className="font-bold text-[11px]">R$ {(printingOrder.deliveryFee || 0).toFixed(2)}</span>
                                </div>
                            )}
                        </div>

                        <div className="flex justify-between items-end border-t border-black pt-4 mb-2 mt-2 font-receipt">
                            <span className="font-black text-xs uppercase tracking-widest">TOTAL:</span>
                            <span className="text-xl font-black">R$ {printingOrder.total.toFixed(2)}</span>
                        </div>

                        <div className="mt-8 text-center text-[9px] text-slate-500 font-bold border-t border-dashed pt-4 font-receipt">
                            <p>OBRIGADO POR ESCOLHER NOSSO DELIVERY!</p>
                            <p className="mt-1">ESTE DOCUMENTO NÃO É DOCUMENTO FISCAL</p>
                        </div>

                        <div className="mt-8 flex gap-2 no-print">
                            <button
                                onClick={() => window.print()}
                                className="flex-1 bg-slate-900 hover:bg-black text-white py-4 rounded-xl font-black uppercase text-[10px] shadow-xl transition-all flex items-center justify-center gap-2"
                            >
                                <Icons.Print className="w-4 h-4" /> Imprimir
                            </button>
                            <button
                                onClick={() => setPrintingOrder(null)}
                                className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-600 py-4 rounded-xl font-black uppercase text-[10px] transition-all"
                            >
                                Fechar
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default OrderHistory;
