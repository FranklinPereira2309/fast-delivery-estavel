import React, { useState, useEffect } from 'react';
import { db } from '../services/db';
import { socket } from '../services/socket';
import { Order, OrderStatus, User, OrderStatusLabels } from '../types';
import { Icons, formatImageUrl } from '../constants';
import { audioAlert } from '../services/audioAlert';
import CustomAlert from '../components/CustomAlert';

interface DeliveryOrdersProps {
    currentUser: User;
}

const DeliveryOrders: React.FC<DeliveryOrdersProps> = ({ currentUser }) => {
    const [orders, setOrders] = useState<Order[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [editingOrder, setEditingOrder] = useState<Order | null>(null);
    const [allProducts, setAllProducts] = useState<any[]>([]);
    const [activeTab, setActiveTab] = useState<'active' | 'history'>('active');
    const [businessSettings, setBusinessSettings] = useState<any>(null);
    const [printingOrder, setPrintingOrder] = useState<Order | null>(null);
    const [supportMessages, setSupportMessages] = useState<any[]>([]);
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
        'pix': 'PIX',
        'PIX': 'PIX',
        'cartao_credito': 'Cartão de Crédito',
        'CREDIT': 'Cartão de Crédito',
        'CRÉDITO': 'Cartão de Crédito',
        'cartao_debito': 'Cartão de Débito',
        'DEBIT': 'Cartão de Débito',
        'DÉBITO': 'Cartão de Débito',
        'dinheiro': 'Dinheiro',
        'CASH': 'Dinheiro',
        'DINHEIRO': 'Dinheiro'
    };

    const fetchOrders = async () => {
        setIsLoading(true);
        const [allOrders, prods, settings] = await Promise.all([
            db.getOrders(),
            db.getProducts(),
            db.getSettings()
        ]);
        setAllProducts(prods);
        setBusinessSettings(settings);

        // Separate orders by status
        const appOrders = allOrders.filter(o => o.isOriginDeliveryApp);

        if (activeTab === 'active') {
            setOrders(appOrders.filter(o => !['DELIVERED', 'CANCELLED'].includes(o.status)));
        } else {
            setOrders(appOrders.filter(o => ['DELIVERED', 'CANCELLED'].includes(o.status)));
        }

        setIsLoading(false);
    };

    const fetchSupportMessages = async () => {
        try {
            const msgs = await db.getSupportMessages();
            setSupportMessages(msgs);
        } catch (e) {
            console.error("Error fetching support messages", e);
        }
    };

    useEffect(() => {
        fetchOrders();
        fetchSupportMessages();
    }, [activeTab]);

    useEffect(() => {
        const handleOrdersUpdate = () => {
            fetchOrders();
        };

        const handleNewOrder = (order: Order) => {
            if (activeTab === 'active' && order.isOriginDeliveryApp) {
                audioAlert.play();
                setOrders((prev) => [order, ...prev.filter(o => o.id !== order.id)]);
            }
        };

        const handleOrderChange = () => {
            fetchOrders();
        };

        const handleNewSupportMessage = (msg: any) => {
            setSupportMessages(prev => [...prev.filter(m => m.id !== msg.id), msg]);
            audioAlert.play();
        };

        socket.on('ordersUpdated', handleOrdersUpdate);
        socket.on('newOrder', handleNewOrder);
        socket.on('orderStatusChanged', handleOrdersUpdate);
        socket.on('new_support_message', handleNewSupportMessage);

        return () => {
            socket.off('ordersUpdated', handleOrdersUpdate);
            socket.off('newOrder', handleNewOrder);
            socket.off('orderStatusChanged', handleOrdersUpdate);
            socket.off('new_support_message', handleNewSupportMessage);
        };
    }, []);

    const approveOrder = async (orderId: string) => {
        await db.updateOrderStatus(orderId, 'PREPARING', currentUser);
        await fetchOrders();
    };

    const rejectOrder = async (orderId: string) => {
        setAlertConfig({
            isOpen: true,
            title: 'REJEITAR PEDIDO',
            message: 'Deseja realmente rejeitar/excluir este pedido? Esta ação não pode ser desfeita.',
            type: 'DANGER',
            onConfirm: async () => {
                await db.updateOrderStatus(orderId, 'CANCELLED', currentUser);
                await fetchOrders();
                setAlertConfig(prev => ({ ...prev, isOpen: false }));
            }
        });
    };

    const handlePrint = (order: Order) => {
        setPrintingOrder(order);
    };

    if (isLoading) {
        return <div className="p-8 flex items-center justify-center">Carregando pedidos...</div>;
    }

    return (
        <div className="p-6 h-full flex flex-col bg-slate-50">
            <div className="flex items-center justify-between mb-6 no-print">
                <div>
                    <h1 className="text-2xl font-black text-slate-800 uppercase tracking-tighter flex items-center gap-3">
                        <div className="w-10 h-10 bg-indigo-100 text-indigo-600 rounded-xl flex items-center justify-center">
                            <Icons.Smartphone className="w-6 h-6" />
                        </div>
                        Gerenciador Delivery App
                    </h1>
                    <p className="text-sm text-slate-500 font-medium ml-14">Aprove, edite e envie pedidos do app para a cozinha.</p>
                </div>

                <div className="flex bg-white p-1 rounded-2xl border border-slate-200 shadow-sm">
                    <button
                        onClick={() => setActiveTab('active')}
                        className={`px-6 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'active' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-200' : 'text-slate-400 hover:bg-slate-50'}`}
                    >
                        Pedidos Ativos
                    </button>
                    <button
                        onClick={() => setActiveTab('history')}
                        className={`px-6 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'history' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-200' : 'text-slate-400 hover:bg-slate-50'}`}
                    >
                        Histórico
                    </button>
                </div>
            </div>

            <div className="flex flex-1 gap-6 overflow-hidden mt-6">
                <div className="flex-1 overflow-y-auto pr-2 pb-20 no-print">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 gap-6">
                        {orders.length === 0 ? (
                            <div className="col-span-full h-64 flex flex-col items-center justify-center border-2 border-dashed border-slate-200 rounded-3xl bg-white">
                                <Icons.Smartphone className="w-12 h-12 text-slate-300 mb-4" />
                                <p className="text-slate-500 font-medium">Nenhum pedido pendente do App Delivery.</p>
                            </div>
                        ) : (
                            orders.map(order => (
                                <div key={order.id} className="bg-white p-6 rounded-[2.5rem] shadow-sm border border-slate-100 flex flex-col hover:shadow-xl hover:shadow-indigo-100/20 transition-all relative h-fit group">
                                    <div className="flex flex-wrap justify-between items-start mb-2 gap-y-3">
                                        <div className="flex flex-wrap items-center gap-3">
                                            <h3 className="font-black text-2xl text-slate-800 tracking-tighter">#{order.id.slice(-4).toUpperCase()}</h3>
                                        </div>
                                        <div className="text-left sm:text-right w-full sm:w-auto mt-2 sm:mt-0">
                                            <p className="text-xl font-black text-slate-800 tracking-tighter">R$ {order.total.toFixed(2)}</p>
                                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest break-words">{paymentLabels[order.paymentMethod || ''] || order.paymentMethod || 'Não Informado'}</p>
                                        </div>
                                    </div>

                                    <div className="mb-6">
                                        <div className={`text-[10px] font-black px-3 py-1 rounded-full w-fit uppercase tracking-widest ${order.status === 'PENDING' ? 'bg-amber-100 text-amber-600' :
                                            order.status === 'CANCELLED' ? 'bg-rose-100 text-rose-600' : 'bg-green-100 text-green-600'
                                            }`}>
                                            {OrderStatusLabels[order.status] || order.status}
                                        </div>
                                    </div>

                                    <div className="space-y-4 mb-6">
                                        <div>
                                            <p className="text-[10px] font-black text-slate-300 uppercase tracking-widest mb-1">Cliente</p>
                                            <p className="font-bold text-slate-700 leading-tight break-words">{order.clientName}</p>
                                            {order.clientPhone && <p className="text-xs font-bold text-slate-400 mt-0.5">{order.clientPhone}</p>}
                                        </div>
                                        {order.clientAddress && (
                                            <div>
                                                <p className="text-[10px] font-black text-slate-300 uppercase tracking-widest mb-1">Endereço</p>
                                                <p className="text-xs font-bold text-slate-500 leading-relaxed break-words">{order.clientAddress}</p>
                                            </div>
                                        )}
                                    </div>

                                    <div className="bg-slate-50 rounded-[2rem] p-5 mb-6 flex-1 min-h-[100px]">
                                        <p className="text-[10px] font-black text-slate-300 uppercase tracking-widest mb-3">Itens</p>
                                        <div className="space-y-2 max-h-40 overflow-y-auto pr-1 custom-scrollbar">
                                            {(order.items || []).map((item, idx) => (
                                                <div key={idx} className="flex gap-2 text-sm">
                                                    <span className="text-indigo-600 font-black">{item.quantity}x</span>
                                                    <span className="font-bold text-slate-600 leading-tight">
                                                        {item.product?.name || allProducts.find(p => p.id === item.productId)?.name || 'Produto'}
                                                    </span>
                                                </div>
                                            ))}
                                            {(!order.items || order.items.length === 0) && (
                                                <p className="text-[10px] text-slate-400 italic">Nenhum item</p>
                                            )}
                                        </div>
                                    </div>

                                    <div className="flex gap-3 mt-auto pt-4 border-t border-slate-50">
                                        {order.status === 'PENDING' ? (
                                            <>
                                                <button onClick={() => approveOrder(order.id)} className="flex-1 py-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl font-black uppercase text-[10px] tracking-widest transition-all shadow-lg shadow-indigo-100 flex justify-center items-center gap-2">
                                                    Aceitar
                                                </button>
                                                <button onClick={() => handlePrint(order)} className="w-12 h-12 bg-white border border-slate-200 text-slate-400 hover:text-indigo-600 rounded-2xl flex items-center justify-center transition-all shadow-sm">
                                                    <Icons.Print className="w-5 h-5" />
                                                </button>
                                                <button onClick={() => setEditingOrder(order)} className="w-12 h-12 bg-white border border-slate-200 text-slate-400 hover:text-indigo-600 rounded-2xl flex items-center justify-center transition-all">
                                                    <Icons.Edit className="w-5 h-5" />
                                                </button>
                                                <button onClick={() => rejectOrder(order.id)} className="w-12 h-12 bg-white border border-slate-200 text-rose-400 hover:bg-rose-50 rounded-2xl flex items-center justify-center transition-all">
                                                    <Icons.Delete className="w-5 h-5" />
                                                </button>
                                            </>
                                        ) : (
                                            <>
                                                <div className="flex-1 py-4 bg-slate-50 text-slate-400 rounded-2xl font-black uppercase text-[10px] tracking-widest flex items-center justify-center">
                                                    {OrderStatusLabels[order.status] || order.status}
                                                </div>
                                                <button
                                                    onClick={() => handlePrint(order)}
                                                    className="flex-1 py-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl font-black uppercase text-[10px] tracking-widest transition-all shadow-lg shadow-indigo-100 flex items-center justify-center gap-2"
                                                >
                                                    <Icons.Print className="w-4 h-4" /> Cupom
                                                </button>
                                            </>
                                        )}
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>

                {/* Messages Panel */}
                <div className="w-96 bg-white rounded-[2.5rem] border border-slate-100 shadow-sm flex flex-col overflow-hidden no-print">
                    <div className="p-6 border-b border-slate-50 bg-slate-50/50">
                        <h2 className="font-black text-slate-800 uppercase tracking-tighter flex items-center gap-2">
                            <Icons.Message className="w-5 h-5 text-indigo-500" />
                            Mensagens de Clientes
                        </h2>
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">Chat do App Delivery</p>
                    </div>
                    <div className="flex-1 overflow-y-auto p-6 space-y-4 custom-scrollbar">
                        {supportMessages.length === 0 ? (
                            <div className="flex flex-col items-center justify-center h-full text-center p-8">
                                <div className="w-16 h-16 bg-slate-50 rounded-2xl flex items-center justify-center text-slate-300 mb-4 transform rotate-12">
                                    <Icons.Message className="w-8 h-8" />
                                </div>
                                <p className="text-[10px] font-black text-slate-300 uppercase tracking-widest">Nenhuma mensagem no momento.</p>
                            </div>
                        ) : (
                            supportMessages.map(msg => (
                                <div key={msg.id} className="bg-slate-50 rounded-3xl p-5 border border-slate-100 animate-in slide-in-from-right duration-300">
                                    <div className="flex justify-between items-start mb-2">
                                        <span className="text-[10px] font-black text-indigo-500 uppercase tracking-widest bg-indigo-50 px-2 py-0.5 rounded-md">
                                            {msg.userName || 'Anônimo'}
                                        </span>
                                        <span className="text-[9px] font-bold text-slate-400">
                                            {new Date(msg.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                                        </span>
                                    </div>
                                    <p className="text-sm font-bold text-slate-700 leading-relaxed break-words">{msg.message}</p>
                                </div>
                            ))
                        )}
                    </div>
                    <div className="p-4 bg-slate-50 border-t border-slate-100">
                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest text-center">As mensagens são limpas diariamente na abertura do caixa.</p>
                    </div>
                </div>
            </div>

            {printingOrder && businessSettings && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-md animate-in fade-in duration-300">
                    <div className="absolute inset-0 no-print" onClick={() => setPrintingOrder(null)}></div>
                    <div className="bg-white w-full max-w-[80mm] border border-dashed shadow-2xl p-8 is-receipt animate-in zoom-in duration-300 overflow-y-auto max-h-[95vh] custom-scrollbar relative">
                        <div className="text-center mb-6 border-b border-dashed pb-4">
                            <h2 className="font-black text-sm uppercase tracking-tighter">{businessSettings.name}</h2>
                            <p className="text-[9px] font-bold mt-1">CNPJ: {businessSettings.cnpj}</p>
                            <p className="text-[10px] font-black mt-3 border border-slate-900 py-1 uppercase tracking-widest">Comprovante de Pagamento</p>
                        </div>

                        <div className="space-y-1 mb-4 text-[11px] font-receipt">
                            <p>DATA: {new Date(printingOrder.createdAt).toLocaleString('pt-BR')}</p>
                            <p className="uppercase">CLIENTE: {printingOrder.clientName}</p>
                            <p>FONE: {printingOrder.clientPhone}</p>
                            {printingOrder.clientAddress && (
                                <p className="font-bold border-t border-dashed mt-2 pt-1 uppercase leading-tight">ENTREGA: {printingOrder.clientAddress}</p>
                            )}
                            <p>STATUS: {(OrderStatusLabels[printingOrder.status] || printingOrder.status).toUpperCase()}</p>

                            <div className="mt-2 pt-2 border-t border-dashed w-full">
                                <div className="flex justify-between items-center bg-slate-50 p-2 rounded-lg border border-slate-100 no-print">
                                    <p className="font-black text-[10px]">PAGTO: {(paymentLabels[(printingOrder.paymentMethod || '').toUpperCase()] || printingOrder.paymentMethod).toUpperCase()}</p>
                                </div>
                                <p className="font-black hidden print:block pt-1 text-[10px]">PAGTO: {(paymentLabels[(printingOrder.paymentMethod || '').toUpperCase()] || printingOrder.paymentMethod).toUpperCase()}</p>
                            </div>
                        </div>

                        <div className="border-t border-dashed my-3 py-3 font-receipt">
                            {printingOrder.items.map((it: any, idx: number) => {
                                const prodName = it.product?.name || allProducts.find(p => p.id === it.productId)?.name || 'PRODUTO';
                                return (
                                    <div key={idx} className="flex justify-between font-black uppercase py-0.5 text-[11px]">
                                        <span>{it.quantity}x {prodName.substring(0, 18)}</span>
                                        <span>R$ {(it.price * it.quantity).toFixed(2)}</span>
                                    </div>
                                );
                            })}
                        </div>

                        <div className="flex justify-between items-end border-t border-dashed pt-4 mb-1 font-receipt">
                            <span className="font-black text-[9px] uppercase tracking-widest">SUBTOTAL:</span>
                            <span className="text-sm font-black text-slate-800">R$ {(printingOrder.total - (printingOrder.deliveryFee || 0)).toFixed(2)}</span>
                        </div>

                        {printingOrder.deliveryFee > 0 && (
                            <div className="flex justify-between items-end mb-1 font-receipt">
                                <span className="font-black text-[9px] uppercase tracking-widest">TAXA ENTREGA:</span>
                                <span className="text-sm font-black text-slate-800">R$ {printingOrder.deliveryFee.toFixed(2)}</span>
                            </div>
                        )}

                        <div className="flex justify-between items-end border-t border-dashed pt-2 mb-6 font-receipt">
                            <span className="font-black text-[9px] uppercase tracking-widest">TOTAL:</span>
                            <span className="text-2xl font-black text-slate-900">R$ {printingOrder.total.toFixed(2)}</span>
                        </div>

                        <div className="flex flex-col gap-2 no-print">
                            <div className="flex gap-2">
                                <button
                                    onClick={() => window.print()}
                                    className="flex-[2] bg-slate-900 text-white py-4 rounded-2xl font-black uppercase text-[10px] tracking-widest shadow-xl transition-all active:scale-95"
                                >
                                    Imprimir
                                </button>
                                <button
                                    onClick={() => setPrintingOrder(null)}
                                    className="flex-1 bg-slate-100 text-slate-600 py-4 rounded-2xl font-black uppercase text-[10px] tracking-widest transition-all"
                                >
                                    Fechar
                                </button>
                            </div>
                        </div>

                        <div className="w-full text-center mt-6 border-t border-dashed border-slate-200 pt-4 hidden print:block">
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Delivery Fast - Obrigado pela preferência</p>
                        </div>
                    </div>
                </div>
            )}

            {editingOrder && (
                <OrderEditModal
                    order={editingOrder}
                    allProducts={allProducts}
                    onClose={() => setEditingOrder(null)}
                    onSave={async (updatedItems, paymentMethod) => {
                        await db.updateOrderItems(editingOrder.id, updatedItems, currentUser);
                        await db.updateOrderPaymentMethod(editingOrder.id, paymentMethod, currentUser);
                        setEditingOrder(null);
                        await fetchOrders();
                    }}
                />
            )}

            <CustomAlert
                isOpen={alertConfig.isOpen}
                title={alertConfig.title}
                message={alertConfig.message}
                type={alertConfig.type}
                onConfirm={alertConfig.onConfirm}
                onCancel={() => setAlertConfig(prev => ({ ...prev, isOpen: false }))}
            />
        </div>
    );
};

const OrderEditModal: React.FC<{
    order: Order,
    allProducts: any[],
    onClose: () => void,
    onSave: (items: any[], payment: string) => Promise<void>
}> = ({ order, allProducts, onClose, onSave }) => {
    const [items, setItems] = useState([...order.items]);
    const [paymentMethod, setPaymentMethod] = useState(order.paymentMethod);
    const [isSaving, setIsSaving] = useState(false);

    const addItem = (product: any) => {
        setItems([...items, { productId: product.id, product, quantity: 1, price: product.price }]);
    };

    const updateQty = (idx: number, delta: number) => {
        const newItems = [...items];
        newItems[idx].quantity = Math.max(0.5, newItems[idx].quantity + delta);
        setItems(newItems);
    };

    const removeItem = (idx: number) => {
        setItems(items.filter((_, i) => i !== idx));
    };

    const handleSave = async () => {
        setIsSaving(true);
        try {
            const formattedItems = items.map(it => ({
                productId: it.productId,
                quantity: it.quantity,
                price: it.price,
                observations: it.observations
            }));
            await onSave(formattedItems, paymentMethod);
        } catch (e) {
            alert("Erro ao salvar alterações");
        } finally {
            setIsSaving(false);
        }
    };

    const total = items.reduce((acc, it) => acc + (it.price * it.quantity), 0) + (order.deliveryFee || 0);

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in">
            <div className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden animate-in zoom-in">
                <div className="p-8 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                    <div>
                        <h4 className="text-xl font-black text-slate-800 uppercase tracking-tighter">Editar Pedido #{order.id.slice(-4)}</h4>
                        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Mude itens, avalie o resumo e atualize as opções de pagamento</p>
                    </div>
                    <button onClick={onClose} className="p-3 bg-white text-slate-400 rounded-2xl hover:bg-slate-100 hover:text-rose-500 transition-all shadow-sm">
                        <Icons.X className="w-5 h-5" />
                    </button>
                </div>

                <div className="flex-1 overflow-hidden flex flex-col md:flex-row gap-6 p-6 md:p-8">
                    {/* Items List */}
                    <div className="flex-1 flex flex-col gap-4 overflow-y-auto pr-4 custom-scrollbar">
                        <h5 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Itens do Pedido</h5>
                        <div className="bg-slate-50 p-5 rounded-3xl border border-slate-100 font-receipt">
                            {items.length === 0 && <p className="text-[10px] uppercase font-black text-slate-400 tracking-widest text-center py-4">Nenhum item</p>}
                            {items.map((it, idx) => (
                                <div key={idx} className="flex items-center justify-between py-2.5 border-b border-dashed border-slate-200 last:border-0 hover:bg-white/50 transition-colors -mx-2 px-2 rounded-xl group/item">
                                    <div className="flex-1 flex flex-col pr-2">
                                        <span className="font-black text-sm text-slate-800 uppercase tracking-tighter">{it.product?.name || allProducts.find(p => p.id === it.productId)?.name || 'PRODUTO'}</span>
                                        <span className="text-[10px] font-bold text-slate-500 tracking-widest mt-0.5">{it.quantity}x R$ {it.price.toFixed(2)}</span>
                                    </div>
                                    <div className="flex items-center gap-1 bg-white p-1 rounded-lg border border-slate-200 shadow-sm opacity-100 md:opacity-50 group-hover/item:opacity-100 transition-opacity">
                                        <button onClick={() => updateQty(idx, -1)} className="w-6 h-6 flex items-center justify-center rounded text-slate-500 hover:bg-slate-100 hover:text-slate-800 font-black">-</button>
                                        <button onClick={() => updateQty(idx, 1)} className="w-6 h-6 flex items-center justify-center rounded text-slate-500 hover:bg-slate-100 hover:text-slate-800 font-black">+</button>
                                        <button onClick={() => removeItem(idx)} className="w-6 h-6 flex items-center justify-center rounded text-rose-400 hover:bg-rose-50 hover:text-rose-600 transition-all ml-0.5">
                                            <Icons.X className="w-3.5 h-3.5" />
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Menu & Summary */}
                    <div className="w-full md:w-72 flex flex-col gap-6 shrink-0 border-t md:border-t-0 md:border-l border-slate-100 pt-6 md:pt-0 md:pl-6">
                        <div className="bg-slate-50 rounded-3xl p-5 flex flex-col border border-slate-100 shrink-0">
                            <h5 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Adicionar Item</h5>
                            <select
                                className="w-full bg-white border border-slate-200 rounded-xl p-3 text-xs font-bold text-slate-600 uppercase tracking-tighter outline-none focus:ring-2 focus:ring-indigo-500/20"
                                value=""
                                onChange={(e) => {
                                    if (e.target.value) {
                                        const p = allProducts.find(prod => prod.id === e.target.value);
                                        if (p) addItem(p);
                                    }
                                }}
                            >
                                <option value="">Selecione um Produto...</option>
                                {allProducts.map(p => (
                                    <option key={p.id} value={p.id}>{p.name} - R$ {p.price.toFixed(2)}</option>
                                ))}
                            </select>
                        </div>

                        <div className="bg-indigo-600 text-white p-6 rounded-[2rem] shadow-xl shadow-indigo-100">
                            <div className="flex justify-between items-center mb-4">
                                <span className="text-[10px] font-black uppercase opacity-60">Subtotal</span>
                                <span className="font-bold text-xs">R$ {(total - (order.deliveryFee || 0)).toFixed(2)}</span>
                            </div>
                            <div className="flex justify-between items-center mb-4 border-t border-white/10 pt-4">
                                <span className="text-[10px] font-black uppercase opacity-60">Entrega</span>
                                <span className="font-bold text-xs">R$ {(order.deliveryFee || 0).toFixed(2)}</span>
                            </div>
                            <div className="flex justify-between items-center mb-6 pt-2">
                                <span className="text-xs font-black uppercase">Total</span>
                                <span className="text-xl font-black">R$ {total.toFixed(2)}</span>
                            </div>

                            <div className="space-y-4">
                                <div className="space-y-2">
                                    <label className="text-[8px] font-black uppercase opacity-60 ml-2">Forma de Pagamento</label>
                                    <select
                                        value={paymentMethod}
                                        onChange={e => setPaymentMethod(e.target.value)}
                                        className="w-full bg-white/10 border-white/20 rounded-xl p-3 text-[10px] font-black uppercase outline-none focus:ring-2 focus:ring-white/20"
                                    >
                                        <option value="PIX" className="text-slate-900">PIX</option>
                                        <option value="CREDIT" className="text-slate-900">Cartão de Crédito</option>
                                        <option value="DEBIT" className="text-slate-900">Cartão de Débito</option>
                                        <option value="CASH" className="text-slate-900">Dinheiro</option>
                                        <option value="pix" className="hidden">PIX</option>
                                        <option value="cartao_credito" className="hidden">Cartão de Crédito</option>
                                        <option value="cartao_debito" className="hidden">Cartão de Débito</option>
                                        <option value="dinheiro" className="hidden">Dinheiro</option>
                                    </select>
                                </div>
                                <button
                                    onClick={handleSave}
                                    disabled={isSaving}
                                    className="w-full bg-white text-indigo-600 py-4 rounded-xl font-black uppercase text-[10px] tracking-widest hover:bg-indigo-50 transition-all"
                                >
                                    {isSaving ? 'Salvando...' : 'Salvar Alterações'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default DeliveryOrders;
