import React, { useState, useEffect, useRef } from 'react';
import { db } from '../services/db';
import { socket, clientChatUnreadManager } from '../services/socket';
import { Order, User, OrderStatusLabels, DeliveryDriver, Product, SaleType, BusinessSettings } from '../types';
import { Icons } from '../constants';
import CustomAlert from '../components/CustomAlert';

interface DeliveryOrdersProps {
    currentUser: User;
}

const DeliveryOrders: React.FC<DeliveryOrdersProps> = ({ currentUser }) => {
    const [orders, setOrders] = useState<Order[]>([]);
    const [clients, setClients] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [editingOrder, setEditingOrder] = useState<Order | null>(null);
    const [allProducts, setAllProducts] = useState<any[]>([]);
    const [drivers, setDrivers] = useState<DeliveryDriver[]>([]);
    const [products, setProducts] = useState<Product[]>([]);
    const [businessSettings, setBusinessSettings] = useState<BusinessSettings | null>(null);
    const [activeTab, setActiveTab] = useState<'active' | 'history' | 'chat'>('active');
    const [printingOrder, setPrintingOrder] = useState<Order | null>(null);

    const [selectedOrderChat, setSelectedOrderChat] = useState<Order | null>(null);
    const [globalUnreads, setGlobalUnreads] = useState<Set<string>>(new Set());
    const [messages, setMessages] = useState<any[]>([]);
    const [newMessage, setNewMessage] = useState('');
    const [isSending, setIsSending] = useState(false);
    const chatEndRef = useRef<HTMLDivElement>(null);

    const [alertConfig, setAlertConfig] = useState<{
        isOpen: boolean;
        title: string;
        message: string;
        type: 'INFO' | 'DANGER' | 'SUCCESS';
        onConfirm: () => void;
    }>({
        isOpen: false,
        title: '',
        message: '',
        type: 'INFO',
        onConfirm: () => { }
    });

    const paymentLabels: { [key: string]: string } = {
        'pix': 'PIX', 'PIX': 'PIX',
        'cartao_credito': 'Cartão de Crédito', 'CREDIT': 'Cartão de Crédito',
        'cartao_debito': 'Cartão de Débito', 'DEBIT': 'Cartão de Débito',
        'dinheiro': 'Dinheiro', 'CASH': 'Dinheiro'
    };

    const getInitials = (name: any) => {
        if (!name || typeof name !== 'string') return '??';
        return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
    };

    const getDriverName = (driverId?: string) => {
        if (!driverId) return 'Desconhecido';
        return drivers.find(d => d.id === driverId)?.name || 'Removido';
    };

    const fetchOrders = async () => {
        setIsLoading(true);
        try {
            const [allOrders, allDrivers, allProducts, settings] = await Promise.all([
                db.getOrders(),
                db.getDrivers(),
                db.getProducts(),
                db.getSettings()
            ]);
            setOrders(allOrders.filter(o => o.isOriginDeliveryApp || o.type === SaleType.OWN_DELIVERY));
            setDrivers(allDrivers);
            setProducts(allProducts);
            setBusinessSettings(settings as BusinessSettings);
        } catch (error) {
            console.error('Error fetching orders:', error);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchOrders();
        const interval = setInterval(() => fetchOrders(), 15000);
        return () => clearInterval(interval);
    }, []);

    useEffect(() => {
        const unsubscribe = clientChatUnreadManager.subscribe((unreads) => {
            setGlobalUnreads(new Set(unreads));
        });
        setGlobalUnreads(clientChatUnreadManager.getUnreads());
        return () => unsubscribe();
    }, []);

    const loadChatHistory = async (orderId?: string, clientId?: string) => {
        let history: any[] = [];
        if (orderId) {
            const orderHistory = await db.getClientChatHistory(orderId);
            history = [...orderHistory];
        }
        if (clientId) {
            const supportHistory = await db.getClientSupportHistory(clientId);
            const translatedSupport = supportHistory.map(m => ({
                ...m,
                isFromClient: !m.isAdmin,
                text: m.message,
                createdAt: m.createdAt
            }));
            history = [...history, ...translatedSupport].sort((a, b) =>
                new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
            );
        }
        setMessages(history);
    };

    useEffect(() => {
        if (selectedOrderChat) {
            loadChatHistory(selectedOrderChat.id, selectedOrderChat.clientId);
            // Assuming chat view is open, remove from unreads
            clientChatUnreadManager.removeUnread(selectedOrderChat.clientId || selectedOrderChat.id);
        }

        const handleNewOrderMessage = (data: any) => {
            const { orderId, message } = data;
            if (activeTab === 'chat' && selectedOrderChat && String(selectedOrderChat.id) === String(orderId)) {
                loadChatHistory(selectedOrderChat.id, selectedOrderChat.clientId);
                clientChatUnreadManager.removeUnread(orderId);
            }
        };

        const handleNewSupportMessage = (msg: any) => {
            if (activeTab === 'chat' && selectedOrderChat && String(selectedOrderChat.clientId) === String(msg.clientId)) {
                loadChatHistory(selectedOrderChat.id, selectedOrderChat.clientId);
                clientChatUnreadManager.removeUnread(msg.clientId);
            }
        };

        socket.on('newOrderMessage', handleNewOrderMessage);
        socket.on('new_support_message', handleNewSupportMessage);

        return () => {
            socket.off('newOrderMessage', handleNewOrderMessage);
            socket.off('new_support_message', handleNewSupportMessage);
        };
    }, [selectedOrderChat, activeTab]);

    const handleSendMessage = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newMessage.trim() || !currentUser || !selectedOrderChat || isSending) return;

        try {
            const text = newMessage.trim();
            setNewMessage('');
            setIsSending(true);

            if (selectedOrderChat.clientId) {
                await db.sendAdminSupportMessage(selectedOrderChat.clientId, text, currentUser.name);
            } else {
                const savedMsg = await db.sendClientChatMessage(selectedOrderChat.id, text, 'Atendimento', false);
                socket.emit('send_message', { ...(savedMsg as any), orderId: selectedOrderChat.id });
            }

            await loadChatHistory(selectedOrderChat.id, selectedOrderChat.clientId);
            setIsSending(false);
        } catch (e) {
            console.error("Erro ao enviar:", e);
            setIsSending(false);
        }
    };

    const approveOrder = async (id: string) => {
        await db.updateOrderStatus(id, 'PREPARING', currentUser);
        await fetchOrders();
    };

    const rejectOrder = async (id: string) => {
        setAlertConfig({
            isOpen: true,
            title: 'REJEITAR PEDIDO',
            message: 'Tem certeza que deseja cancelar este pedido?',
            type: 'DANGER',
            onConfirm: async () => {
                await db.updateOrderStatus(id, 'CANCELLED', currentUser);
                setAlertConfig(prev => ({ ...prev, isOpen: false }));
                await fetchOrders();
            }
        });
    };

    const handlePrint = (order: Order) => {
        setPrintingOrder(order);
    };

    const activeOrders = orders.filter(o => !['DELIVERED', 'CANCELLED'].includes(o.status));
    const historyOrders = orders.filter(o => ['DELIVERED', 'CANCELLED'].includes(o.status));

    const chatClients = new Map<string, any>();
    orders.forEach(o => {
        chatClients.set(o.id, { id: o.id, clientId: o.clientId, name: o.clientName || 'Cliente', orderId: o.id });
    });



    return (
        <div className="p-6 h-full flex flex-col bg-slate-50 relative">
            {isLoading && (
                <div className="absolute top-0 left-0 w-full h-1 bg-indigo-100 overflow-hidden z-50">
                    <div className="h-full bg-indigo-600 animate-[loading_2s_infinite]"></div>
                </div>
            )}
            <style>{`
                @keyframes loading {
                    0% { transform: translateX(-100%); }
                    100% { transform: translateX(100%); }
                }
            `}</style>
            {/* Header / Tabs */}
            <div className="flex items-center gap-6 mb-8 no-print shrink-0">
                <div className="flex items-center gap-4 bg-white p-2 rounded-full w-max shadow-sm border border-slate-100 flex-shrink-0">
                    <button
                        onClick={() => setActiveTab('active')}
                        className={`px-8 py-3.5 rounded-full text-[11px] font-black uppercase tracking-widest transition-all ${activeTab === 'active' ? 'bg-slate-900 text-white shadow-xl' : 'text-slate-400 hover:bg-slate-50'}`}
                    >
                        Entregas
                    </button>
                    <button
                        onClick={() => setActiveTab('history')}
                        className={`px-8 py-3.5 rounded-full text-[11px] font-black uppercase tracking-widest transition-all ${activeTab === 'history' ? 'bg-slate-900 text-white shadow-xl' : 'text-slate-400 hover:bg-slate-50'}`}
                    >
                        Histórico
                    </button>
                    <button
                        onClick={() => setActiveTab('chat')}
                        className={`px-8 py-3.5 rounded-full text-[11px] font-black uppercase tracking-widest transition-all relative ${activeTab === 'chat' ? 'bg-slate-900 text-white shadow-xl' : 'text-slate-400 hover:bg-slate-50'}`}
                    >
                        Chat Clientes
                        {globalUnreads.size > 0 && (
                            <span className="absolute -top-1 -right-1 w-3 h-3 bg-rose-500 rounded-full border-2 border-white animate-pulse shadow-sm" />
                        )}
                    </button>
                </div>
            </div>

            <div className="flex flex-1 gap-6 overflow-hidden">
                {/* Active Orders View */}
                {activeTab === 'active' && (
                    <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar">
                        {activeOrders.length === 0 ? (
                            <div className="w-full bg-white p-20 rounded-[3rem] border-2 border-dashed border-slate-100 flex flex-col items-center justify-center text-center animate-in fade-in zoom-in duration-500">
                                <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center mb-6 shadow-inner">
                                    <Icons.Clock className="w-10 h-10 text-slate-200" />
                                </div>
                                <h3 className="text-[10px] font-black text-slate-300 uppercase tracking-[0.2em]">Sem entregas pendentes no momento...</h3>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                                {activeOrders.map(order => (
                                    <div key={order.id} className="bg-white p-6 rounded-[2.5rem] border border-slate-100 shadow-sm flex flex-col hover:shadow-xl transition-all h-fit">
                                        <div className="flex justify-between items-start mb-4">
                                            <h3 className="font-black text-2xl text-slate-800 tracking-tighter">#{order.id.slice(-4).toUpperCase()}</h3>
                                            <p className="text-xl font-black text-slate-800">R$ {order.total.toFixed(2)}</p>
                                        </div>
                                        <div className="space-y-4 mb-6">
                                            <p className="font-bold text-slate-700 leading-tight uppercase text-xs">{order.clientName}</p>
                                            <p className="text-[10px] font-bold text-slate-400 uppercase leading-relaxed">{order.clientAddress}</p>
                                            <div className="bg-slate-50 rounded-2xl p-4">
                                                {order.items.map((it, idx) => (
                                                    <div key={idx} className="flex gap-2 text-xs font-bold text-slate-600">
                                                        <span className="text-indigo-600">{it.quantity}x</span> {it.product?.name || 'Item'}
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                        <div className="flex gap-3 mt-auto pt-4 border-t border-slate-50">
                                            {order.status === 'PENDING' ? (
                                                <>
                                                    <button onClick={() => approveOrder(order.id)} className="flex-1 py-4 bg-indigo-600 text-white rounded-2xl font-black uppercase text-[10px] tracking-widest shadow-lg shadow-indigo-100 transition-all">Aceitar</button>
                                                    <button onClick={() => setEditingOrder(order)} className="w-12 h-12 bg-white border border-slate-200 text-slate-400 hover:text-indigo-600 rounded-2xl flex items-center justify-center transition-all"><Icons.Edit className="w-5 h-5" /></button>
                                                    <button onClick={() => rejectOrder(order.id)} className="w-12 h-12 bg-white border border-slate-200 text-rose-400 hover:bg-rose-50 rounded-2xl flex items-center justify-center transition-all"><Icons.Delete className="w-5 h-5" /></button>
                                                </>
                                            ) : (
                                                <button onClick={() => handlePrint(order)} className="flex-1 py-4 bg-indigo-600 text-white rounded-2xl font-black uppercase text-[10px] tracking-widest shadow-lg flex items-center justify-center gap-2"><Icons.Print className="w-4 h-4" /> Cupom</button>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {/* History View */}
                {activeTab === 'history' && (
                    <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar">
                        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                            {historyOrders.map(order => (
                                <div key={order.id} className="bg-white p-6 rounded-[2.5rem] border border-slate-100 shadow-sm flex flex-col hover:shadow-xl transition-all h-max">
                                    <div className="flex justify-between items-start mb-2">
                                        <h3 className="font-black text-xl text-slate-800 tracking-tighter uppercase">APP</h3>
                                        <div className="px-3 py-1 bg-emerald-500 text-white rounded-full text-[8px] font-black uppercase tracking-widest shadow-sm">
                                            FINALIZADA
                                        </div>
                                    </div>

                                    <div className="mb-6">
                                        <p className="font-bold text-slate-400 text-[10px] uppercase tracking-widest mb-1">{order.clientName}</p>
                                        <p className="text-[10px] font-bold text-slate-400 uppercase">DATA: {new Date(order.createdAt).toLocaleDateString('pt-BR')}</p>
                                    </div>

                                    <div className="bg-slate-50 p-4 rounded-3xl flex items-center gap-4 mb-6">
                                        <div className="bg-white p-2 rounded-xl shadow-sm">
                                            <Icons.Logistics className="w-5 h-5 text-slate-800" />
                                        </div>
                                        <div>
                                            <p className="text-[8px] font-black text-slate-400 uppercase tracking-[0.2em] mb-0.5">ENTREGUE POR:</p>
                                            <p className="text-sm font-black text-slate-800">{getDriverName(order.driverId)}</p>
                                        </div>
                                    </div>

                                    <div className="flex justify-between items-center border-t border-slate-50 pt-4">
                                        <div className="flex items-center gap-2">
                                            <span className="text-[10px] font-black text-slate-300 uppercase tracking-widest">TOTAL:</span>
                                            <span className="font-black text-lg text-slate-800">R$ {order.total.toFixed(2)}</span>
                                        </div>
                                        <button
                                            onClick={() => handlePrint(order)}
                                            className="p-3 bg-slate-50 text-slate-300 hover:text-indigo-600 rounded-xl transition-all"
                                            title="Imprimir Cupom"
                                        >
                                            <Icons.Print className="w-5 h-5" />
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Chat View */}
                {activeTab === 'chat' && (
                    <div className="flex-1 flex bg-white rounded-[2.5rem] border border-slate-100 shadow-sm overflow-hidden animate-in zoom-in-95">
                        <div className="w-80 border-r border-slate-100 flex flex-col overflow-hidden">
                            <div className="p-6 border-b border-slate-100 bg-slate-50/10">
                                <h3 className="text-[10px] font-black uppercase tracking-widest text-indigo-600">Atendimentos</h3>
                            </div>
                            <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-2 custom-scrollbar">
                                {Array.from(chatClients.values()).map(client => {
                                    const hasUnread = globalUnreads.has(client.clientId) || globalUnreads.has(client.orderId);
                                    return (
                                        <button
                                            key={client.id}
                                            onClick={() => {
                                                setSelectedOrderChat(client as any);
                                                clientChatUnreadManager.removeUnread(client.clientId || client.orderId);
                                            }}
                                            className={`flex items-center gap-3 p-4 rounded-3xl transition-all font-black uppercase relative ${selectedOrderChat?.id === client.id ? 'bg-indigo-50 border border-indigo-100 text-indigo-600' : 'hover:bg-slate-50 text-slate-600'}`}
                                        >
                                            {hasUnread && <span className="absolute top-3 right-3 w-3 h-3 bg-rose-500 rounded-full animate-pulse border-2 border-white shadow-sm" />}
                                            <div className={`w-10 h-10 rounded-2xl flex items-center justify-center text-white ${selectedOrderChat?.id === client.id ? 'bg-indigo-600' : 'bg-slate-300'} text-xs shrink-0`}>{getInitials(client.name)}</div>
                                            <div className="flex-1 text-left min-w-0 pr-4">
                                                <p className="text-[11px] truncate">{client.name}</p>
                                                <p className="text-[8px] opacity-40">#{client.id.slice(-4).toUpperCase()}</p>
                                            </div>
                                        </button>
                                    )
                                })}
                            </div>
                        </div>

                        <div className="flex-1 flex flex-col">
                            {selectedOrderChat ? (
                                <>
                                    <div className="flex-1 overflow-y-auto p-8 flex flex-col gap-6 custom-scrollbar bg-slate-50/10">
                                        {messages.map((msg, i) => (
                                            <div key={i} className={`flex ${msg.isFromClient ? 'justify-start' : 'justify-end'}`}>
                                                <div className={`max-w-[80%] p-6 rounded-[2rem] shadow-sm text-sm ${msg.isFromClient ? 'bg-white text-slate-800' : 'bg-slate-900 text-white'}`}>
                                                    <p className="font-bold leading-tight">{msg.text}</p>
                                                    <span className="text-[8px] opacity-30 uppercase mt-2 block">{new Date(msg.createdAt).toLocaleTimeString()}</span>
                                                </div>
                                            </div>
                                        ))}
                                        <div ref={chatEndRef} />
                                    </div>
                                    <form onSubmit={handleSendMessage} className="p-6 bg-white border-t border-slate-100 flex gap-4">
                                        <input
                                            type="text"
                                            value={newMessage}
                                            onChange={e => setNewMessage(e.target.value)}
                                            placeholder="Digite sua mensagem..."
                                            className="flex-1 bg-slate-50 border-none rounded-2xl px-6 text-sm font-bold outline-none"
                                        />
                                        <button type="submit" className="px-8 bg-indigo-600 text-white rounded-2xl font-black uppercase text-xs tracking-widest shadow-xl">Enviar</button>
                                    </form>
                                </>
                            ) : (
                                <div className="flex-1 flex flex-col items-center justify-center text-slate-300 p-12 text-center">
                                    <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center mb-6"><Icons.Message className="w-10 h-10 text-slate-200" /></div>
                                    <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest">Abrir Atendimento</h3>
                                    <p className="text-[10px] font-bold text-slate-400 mt-2 max-w-xs uppercase">Selecione um cliente para conversar.</p>
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>

            {/* Modals & Alerts */}
            <CustomAlert
                isOpen={alertConfig.isOpen}
                title={alertConfig.title}
                message={alertConfig.message}
                type={alertConfig.type}
                onConfirm={alertConfig.onConfirm}
                onCancel={() => setAlertConfig(prev => ({ ...prev, isOpen: false }))}
            />

            {printingOrder && businessSettings && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-md">
                    <div className="relative w-full max-w-[80mm] bg-white p-8 border border-dashed shadow-2xl font-receipt text-[11px] text-black print-container is-receipt animate-in zoom-in duration-200">
                        <div className="text-center mb-6 border-b border-dashed pb-4">
                            <h2 className="font-black text-sm uppercase tracking-tighter">{businessSettings.name}</h2>
                            <p className="text-[9px] font-bold mt-1 uppercase">Comprovante de Pedido</p>
                        </div>

                        <div className="space-y-1 mb-4">
                            <p>DATA: {new Date(printingOrder.createdAt).toLocaleString('pt-BR')}</p>
                            <p>CLIENTE: {printingOrder.clientName}</p>
                            {printingOrder.clientPhone && <p>FONE: {printingOrder.clientPhone}</p>}
                            {printingOrder.clientAddress && (
                                <p className="font-bold border-t border-dashed mt-2 pt-1 uppercase leading-tight">ENTREGA: {printingOrder.clientAddress}</p>
                            )}
                        </div>

                        <div className="border-t border-dashed my-3 py-3">
                            {printingOrder.items.map((it, idx) => (
                                <div key={idx} className="flex justify-between font-black uppercase py-0.5">
                                    <span>{it.quantity}X {(it.product?.name || 'Item').substring(0, 18)}</span>
                                    <span>R$ {((it.quantity || 1) * (it.price || 0)).toFixed(2)}</span>
                                </div>
                            ))}
                        </div>

                        <div className="flex justify-between items-end border-t border-dashed pt-4 mb-8">
                            <span className="font-black text-[10px] uppercase tracking-widest">TOTAL:</span>
                            <span className="text-2xl font-black">R$ {printingOrder.total.toFixed(2)}</span>
                        </div>

                        <div className="grid grid-cols-2 gap-4 no-print mt-6">
                            <button
                                onClick={() => window.print()}
                                className="bg-slate-900 text-white py-4 rounded-[22px] font-receipt font-black uppercase text-[11px] shadow-xl hover:bg-black active:scale-95 transition-all flex items-center justify-center"
                            >
                                IMPRIMIR
                            </button>
                            <button
                                onClick={() => setPrintingOrder(null)}
                                className="bg-slate-50 text-slate-400 py-4 rounded-[22px] font-receipt font-black uppercase text-[11px] hover:bg-slate-100 active:scale-95 transition-all flex items-center justify-center"
                            >
                                FECHAR
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {editingOrder && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/80">
                    <div className="bg-white w-full max-w-md p-8 rounded-[2.5rem]">
                        <h2 className="font-black text-xl mb-6 uppercase">Editar Pedido</h2>
                        <p className="text-slate-500 mb-8 text-sm">Controle de itens em desenvolvimento para este módulo.</p>
                        <button onClick={() => setEditingOrder(null)} className="w-full bg-indigo-600 text-white py-4 rounded-2xl font-black uppercase">Fechar</button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default DeliveryOrders;
