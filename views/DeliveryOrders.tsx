import React, { useState, useEffect, useRef } from 'react';
import { db } from '../services/db';
import { socket, clientChatUnreadManager } from '../services/socket';
import { Order, User, OrderStatusLabels, DeliveryDriver, Product, SaleType, BusinessSettings } from '../types';
import { Icons } from '../constants';
import { useToast } from '../hooks/useToast';
import CustomAlert from '../components/CustomAlert';
import { sendOrderToThermalPrinter } from '../services/printService';

interface DeliveryOrdersProps {
    currentUser: User;
}

const DeliveryOrders: React.FC<DeliveryOrdersProps> = ({ currentUser }) => {
    const { addToast } = useToast();
    const [orders, setOrders] = useState<Order[]>([]);
    const [clients, setClients] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [allProducts, setAllProducts] = useState<any[]>([]);
    const [drivers, setDrivers] = useState<DeliveryDriver[]>([]);
    const [products, setProducts] = useState<Product[]>([]);
    const [businessSettings, setBusinessSettings] = useState<BusinessSettings | null>(null);
    const [activeTab, setActiveTab] = useState<'active' | 'history' | 'chat'>('active');
    const [printingOrder, setPrintingOrder] = useState<Order | null>(null);
    const [supportMessages, setSupportMessages] = useState<any[]>([]);

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
            const [allOrders, allDrivers, allProducts, settings, supportMsgs] = await Promise.all([
                db.getOrders(),
                db.getDrivers(),
                db.getProducts(),
                db.getSettings(),
                db.getSupportMessages()
            ]);
            setOrders(allOrders.filter(o => o.isOriginDeliveryApp || o.type === SaleType.OWN_DELIVERY));
            setDrivers(allDrivers);
            setProducts(allProducts);
            setBusinessSettings(settings as BusinessSettings);
            setSupportMessages(supportMsgs);
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

    const handlePrintOrder = async () => {
        if (!printingOrder) return;
        try {
            const res = await sendOrderToThermalPrinter(printingOrder, businessSettings!);
            if (!res.fallback) {
                addToast({ title: "Impressão", message: "Cupom térmico enviado com sucesso", type: "SUCCESS" });
            }
        } catch(e: any) {
            setAlertConfig({ isOpen: true, title: "Erro de Impressão ESC/POS", message: e.message || "Impressora Offline", type: "DANGER", onConfirm: () => setAlertConfig(prev => ({ ...prev, isOpen: false })) });
        }
    };

    const activeOrders = orders.filter(o => !['DELIVERED', 'CANCELLED'].includes(o.status));
    const historyOrders = orders.filter(o => ['DELIVERED', 'CANCELLED'].includes(o.status));

    const chatClients = new Map<string, any>();
    
    // Add clients from orders
    orders.forEach(o => {
        chatClients.set(o.clientId || o.id, { 
            id: o.id, 
            clientId: o.clientId, 
            name: o.clientName || 'Cliente', 
            orderId: o.id 
        });
    });

    // Add clients from support messages who don't have orders in the current list
    supportMessages.forEach(m => {
        if (m.clientId && !chatClients.has(m.clientId)) {
            chatClients.set(m.clientId, {
                id: `support-${m.clientId}`,
                clientId: m.clientId,
                name: m.userName || 'Cliente (Suporte)',
                orderId: null,
                isSupportOnly: true
            });
        }
    });



    return (
        <div className="p-6 h-full flex flex-col bg-slate-50 dark:bg-slate-950 relative">
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
            <div className="flex flex-col md:flex-row md:items-center gap-4 md:gap-6 mb-8 no-print shrink-0">
                <div className="flex items-center gap-4 bg-white dark:bg-slate-900 p-1.5 md:p-2 rounded-2xl md:rounded-full w-full md:w-max shadow-sm border border-slate-100 dark:border-slate-800 overflow-x-auto hide-scrollbar">
                    <button
                        onClick={() => setActiveTab('active')}
                        className={`flex-1 md:flex-none px-6 md:px-8 py-3 md:py-3.5 rounded-xl md:rounded-full text-[10px] md:text-[11px] font-black uppercase tracking-widest transition-all whitespace-nowrap ${activeTab === 'active' ? 'bg-slate-900 dark:bg-blue-600 text-white shadow-xl' : 'text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'}`}
                    >
                        Entregas
                    </button>
                    <button
                        onClick={() => setActiveTab('history')}
                        className={`flex-1 md:flex-none px-6 md:px-8 py-3 md:py-3.5 rounded-xl md:rounded-full text-[10px] md:text-[11px] font-black uppercase tracking-widest transition-all whitespace-nowrap ${activeTab === 'history' ? 'bg-slate-900 dark:bg-blue-600 text-white shadow-xl' : 'text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'}`}
                    >
                        Histórico
                    </button>
                    <button
                        onClick={() => setActiveTab('chat')}
                        className={`flex-1 md:flex-none px-6 md:px-8 py-3 md:py-3.5 rounded-xl md:rounded-full text-[10px] md:text-[11px] font-black uppercase tracking-widest transition-all relative whitespace-nowrap ${activeTab === 'chat' ? 'bg-slate-900 dark:bg-blue-600 text-white shadow-xl' : 'text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'}`}
                    >
                        Chat
                        {globalUnreads.size > 0 && (
                            <span className="absolute -top-1 -right-1 w-3 h-3 bg-rose-500 rounded-full border-2 border-white dark:border-slate-800 animate-pulse shadow-sm" />
                        )}
                    </button>
                </div>
            </div>

            <div className="flex flex-1 gap-6 overflow-hidden">
                {/* Active Orders View */}
                {activeTab === 'active' && (
                    <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar flex flex-col">
                        {activeOrders.length === 0 ? (
                            <div className="w-full h-full flex-1 bg-white dark:bg-slate-900 p-20 rounded-[3rem] border-2 border-dashed border-slate-100 dark:border-slate-800 flex flex-col items-center justify-center text-center animate-in fade-in zoom-in duration-500">
                                <div className="w-20 h-20 bg-slate-50 dark:bg-slate-800/50 rounded-full flex items-center justify-center mb-6 shadow-inner">
                                    <Icons.Clock className="w-10 h-10 text-slate-200 dark:text-slate-700" />
                                </div>
                                <h3 className="text-[10px] font-black text-slate-300 dark:text-slate-600 uppercase tracking-[0.2em]">Sem entregas pendentes no momento...</h3>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                                {activeOrders.map(order => (
                                    <div key={order.id} className="bg-white dark:bg-slate-900 p-5 md:p-6 rounded-3xl md:rounded-[2.5rem] border border-slate-100 dark:border-slate-800 shadow-sm flex flex-col hover:shadow-xl transition-all h-fit">
                                        <div className="flex justify-between items-start mb-4">
                                            <h3 className="font-black text-xl md:text-2xl text-slate-800 dark:text-white tracking-tighter">#{order.id.slice(-4).toUpperCase()}</h3>
                                            <p className="text-lg md:text-xl font-black text-slate-800 dark:text-white">R$ {order.total.toFixed(2)}</p>
                                        </div>
                                        <div className="space-y-4 mb-6">
                                            <p className="font-bold text-slate-700 dark:text-slate-300 leading-tight uppercase text-xs">{order.clientName}</p>
                                            <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase leading-relaxed">{order.clientAddress}</p>
                                            <div className="bg-slate-50 dark:bg-slate-800/50 rounded-2xl p-4">
                                                {order.items.map((it, idx) => (
                                                    <div key={idx} className="flex gap-2 text-xs font-bold text-slate-600 dark:text-slate-400">
                                                        <span className="text-indigo-600 dark:text-indigo-400">{it.quantity}x</span> {it.product?.name || 'Item'}
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                        <div className="flex gap-3 mt-auto pt-4 border-t border-slate-50 dark:border-slate-800">
                                            {order.status === 'PENDING' ? (
                                                <>
                                                    <button onClick={() => approveOrder(order.id)} className="flex-1 py-4 bg-indigo-600 text-white rounded-2xl font-black uppercase text-[10px] tracking-widest shadow-lg shadow-indigo-100 dark:shadow-indigo-900/20 transition-all">Aceitar</button>
                                                    <button 
                                                        onClick={() => addToast({
                                                            title: 'EDITAR PEDIDO',
                                                            message: 'Controle de itens em desenvolvimento para este módulo.',
                                                            type: 'INFO'
                                                        })} 
                                                        className="w-12 h-12 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-400 dark:text-slate-500 hover:text-indigo-600 dark:hover:text-indigo-400 rounded-2xl flex items-center justify-center transition-all"
                                                    >
                                                        <Icons.Edit className="w-5 h-5" />
                                                    </button>
                                                    <button onClick={() => rejectOrder(order.id)} className="w-12 h-12 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-900/40 rounded-2xl flex items-center justify-center transition-all"><Icons.Delete className="w-5 h-5" /></button>
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
                    <div className="flex-1 overflow-auto bg-white dark:bg-slate-900 rounded-[2.5rem] border border-slate-100 dark:border-slate-800 shadow-sm custom-scrollbar">
                        <table className="w-full text-left border-collapse min-w-[800px]">
                            <thead>
                                <tr className="bg-slate-50/50 dark:bg-slate-800/30 border-b border-slate-100 dark:border-slate-800">
                                    <th className="px-8 py-5 text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">Status</th>
                                    <th className="px-8 py-5 text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">Tipo / Origem</th>
                                    <th className="px-8 py-5 text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">Atendimento</th>
                                    <th className="px-8 py-5 text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">Data / Hora</th>
                                    <th className="px-8 py-5 text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">Total</th>
                                    <th className="px-8 py-5 text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest text-right">Ações</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
                                {historyOrders.map(order => (
                                    <tr key={order.id} className="hover:bg-slate-50/30 dark:hover:bg-slate-800/20 group transition-colors">
                                        <td className="px-8 py-5">
                                            <span className={`px-3 py-1.5 rounded-xl text-[9px] font-black uppercase text-white shadow-sm ${order.status === 'DELIVERED' ? 'bg-emerald-500' : 'bg-slate-500'}`}>
                                                {order.status === 'DELIVERED' ? 'FINALIZADA' : 'CANCELADA'}
                                            </span>
                                        </td>
                                        <td className="px-8 py-5">
                                            <p className="font-black text-slate-800 dark:text-white text-[11px] uppercase tracking-tighter">
                                                {order.isOriginDeliveryApp ? 'APP' : 'DELIVERY'}
                                                <span className="text-[9px] ml-2 text-slate-400 font-bold tracking-widest"># {order.id.slice(-4).toUpperCase()}</span>
                                            </p>
                                            <p className="text-[9px] text-slate-400 dark:text-slate-500 font-bold uppercase truncate max-w-[150px]">
                                                {order.clientName}
                                            </p>
                                        </td>
                                        <td className="px-8 py-5">
                                            <div className="flex items-center gap-2">
                                                <div className="w-6 h-6 bg-slate-100 dark:bg-slate-800 rounded-lg flex items-center justify-center text-[9px] font-black text-slate-500">
                                                    <Icons.Logistics className="w-3 h-3" />
                                                </div>
                                                <p className="text-[10px] font-bold text-slate-600 dark:text-slate-400 uppercase">
                                                    {getDriverName(order.driverId)}
                                                </p>
                                            </div>
                                        </td>
                                        <td className="px-8 py-5">
                                            <div className="space-y-0.5">
                                                <p className="text-[10px] font-bold text-slate-700 dark:text-slate-300">
                                                    {new Date(order.createdAt).toLocaleDateString('pt-BR')}
                                                </p>
                                                <p className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase">
                                                    {new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(new Date(order.createdAt))}
                                                </p>
                                            </div>
                                        </td>
                                        <td className="px-8 py-5">
                                            <p className="text-[11px] font-black text-blue-600 dark:text-blue-400">
                                                R$ {order.total.toFixed(2)}
                                            </p>
                                        </td>
                                        <td className="px-8 py-5 text-right">
                                            <button
                                                onClick={() => handlePrint(order)}
                                                className="p-2.5 text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 bg-slate-50 dark:bg-slate-800/50 rounded-xl transition-all"
                                                title="Imprimir Cupom"
                                            >
                                                <Icons.Print size={18} />
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}

                {/* Chat View */}
                {activeTab === 'chat' && (
                    <div className="flex-1 flex bg-white dark:bg-slate-900 rounded-[2.5rem] border border-slate-100 dark:border-slate-800 shadow-sm overflow-hidden animate-in zoom-in-95">
                        <div className="w-80 border-r border-slate-100 dark:border-slate-800 flex flex-col overflow-hidden">
                            <div className="p-6 border-b border-slate-100 dark:border-slate-800 bg-slate-50/10 dark:bg-slate-800/10">
                                <h3 className="text-[10px] font-black uppercase tracking-widest text-indigo-600 dark:text-indigo-400">Atendimentos</h3>
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
                                            className={`flex items-center gap-3 p-4 rounded-3xl transition-all font-black uppercase relative ${selectedOrderChat?.id === client.id ? 'bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-100 dark:border-indigo-800 text-indigo-600 dark:text-indigo-400' : 'hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400'}`}
                                        >
                                            {hasUnread && <span className="absolute top-3 right-3 w-3 h-3 bg-rose-500 rounded-full animate-pulse border-2 border-white dark:border-slate-800 shadow-sm" />}
                                            <div className={`w-10 h-10 rounded-2xl flex items-center justify-center text-white ${selectedOrderChat?.id === client.id ? 'bg-indigo-600' : 'bg-slate-300 dark:bg-slate-700'} text-xs shrink-0`}>{getInitials(client.name)}</div>
                                            <div className="flex-1 text-left min-w-0 pr-4">
                                                <p className="text-[11px] truncate">{client.name}</p>
                                                <p className="text-[8px] opacity-40">
                                                    {client.orderId ? `#${client.orderId.slice(-4).toUpperCase()}` : '#SUPORTE'}
                                                </p>
                                            </div>
                                        </button>
                                    )
                                })}
                            </div>
                        </div>

                        <div className="flex-1 flex flex-col">
                            {selectedOrderChat ? (
                                <>
                                    <div className="flex-1 overflow-y-auto p-8 flex flex-col gap-6 custom-scrollbar bg-slate-50/10 dark:bg-slate-800/10">
                                        {messages.map((msg, i) => (
                                            <div key={i} className={`flex ${msg.isFromClient ? 'justify-start' : 'justify-end'}`}>
                                                <div className={`max-w-[80%] p-6 rounded-[2rem] shadow-sm text-sm ${msg.isFromClient ? 'bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200' : 'bg-slate-900 dark:bg-blue-600 text-white'}`}>
                                                    <p className="font-bold leading-tight">{msg.text}</p>
                                                    <span className="text-[8px] opacity-30 uppercase mt-2 block">{new Date(msg.createdAt).toLocaleTimeString()}</span>
                                                </div>
                                            </div>
                                        ))}
                                        <div ref={chatEndRef} />
                                    </div>
                                    <form onSubmit={handleSendMessage} className="p-6 bg-white dark:bg-slate-900 border-t border-slate-100 dark:border-slate-800 flex gap-4">
                                        <input
                                            type="text"
                                            value={newMessage}
                                            onChange={e => setNewMessage(e.target.value)}
                                            placeholder="Digite sua mensagem..."
                                            className="flex-1 bg-slate-50 dark:bg-slate-800 border-none rounded-2xl px-6 text-sm font-bold outline-none text-slate-800 dark:text-white"
                                        />
                                        <button type="submit" className="px-8 bg-indigo-600 text-white rounded-2xl font-black uppercase text-xs tracking-widest shadow-xl shadow-indigo-100 dark:shadow-indigo-900/20">Enviar</button>
                                    </form>
                                </>
                            ) : (
                                <div className="flex-1 flex flex-col items-center justify-center text-slate-300 dark:text-slate-700 p-12 text-center">
                                    <div className="w-20 h-20 bg-slate-50 dark:bg-slate-800/50 rounded-full flex items-center justify-center mb-6"><Icons.Message className="w-10 h-10 text-slate-200 dark:text-slate-700" /></div>
                                    <h3 className="text-sm font-black text-slate-800 dark:text-white uppercase tracking-widest">Abrir Atendimento</h3>
                                    <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 mt-2 max-w-xs uppercase">Selecione um cliente para conversar.</p>
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
                    <div className="relative w-full max-w-[48mm] bg-white p-4 shadow-2xl font-receipt text-[10px] text-black print-container is-receipt animate-in zoom-in duration-200">
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
                                onClick={handlePrintOrder}
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

        </div>
    );
};

export default DeliveryOrders;
