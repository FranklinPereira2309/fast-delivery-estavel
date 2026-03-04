import React, { useState, useEffect } from 'react';
import { db } from '../services/db';
import { socket } from '../services/socket';
import { Order, OrderStatus, User, OrderStatusLabels } from '../types';
import { Icons, formatImageUrl } from '../constants';
import { audioAlert } from '../services/audioAlert';

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

    useEffect(() => {
        fetchOrders();
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

        socket.on('ordersUpdated', handleOrdersUpdate);
        socket.on('newOrder', handleNewOrder);
        socket.on('orderStatusChanged', handleOrdersUpdate);

        return () => {
            socket.off('ordersUpdated', handleOrdersUpdate);
            socket.off('newOrder', handleNewOrder);
            socket.off('orderStatusChanged', handleOrdersUpdate);
        };
    }, []);

    const approveOrder = async (orderId: string) => {
        await db.updateOrderStatus(orderId, 'PREPARING', currentUser);
        await fetchOrders();
    };

    const rejectOrder = async (orderId: string) => {
        if (window.confirm("Deseja realmente rejeitar/excluir este pedido?")) {
            await db.updateOrderStatus(orderId, 'CANCELLED', currentUser);
            await fetchOrders();
        }
    };

    const handlePrint = (order: Order) => {
        setPrintingOrder(order);
        setTimeout(() => window.print(), 500);
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

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 flex-1 overflow-y-auto pr-2 pb-20 no-print">
                {orders.length === 0 ? (
                    <div className="col-span-full h-64 flex flex-col items-center justify-center border-2 border-dashed border-slate-200 rounded-3xl bg-white">
                        <Icons.Smartphone className="w-12 h-12 text-slate-300 mb-4" />
                        <p className="text-slate-500 font-medium">Nenhum pedido pendente do App Delivery.</p>
                    </div>
                ) : (
                    orders.map(order => (
                        <div key={order.id} className="bg-white p-6 rounded-[2.5rem] shadow-sm border border-slate-100 flex flex-col hover:shadow-xl hover:shadow-indigo-100/20 transition-all relative overflow-hidden group">
                            <div className="flex justify-between items-start mb-2">
                                <h3 className="font-black text-2xl text-slate-800 tracking-tighter">#{order.id.slice(-4).toUpperCase()}</h3>
                                <div className="text-right">
                                    <p className="text-xl font-black text-slate-800 tracking-tighter">R$ {order.total.toFixed(2)}</p>
                                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{order.paymentMethod}</p>
                                </div>
                            </div>

                            <div className="mb-6">
                                <div className={`text-[10px] font-black px-3 py-1 rounded-full w-fit uppercase tracking-widest ${order.status === 'PENDING' ? 'bg-amber-100 text-amber-600' :
                                    order.status === 'CANCELLED' ? 'bg-rose-100 text-rose-600' : 'bg-green-100 text-green-600'
                                    }`}>
                                    {order.status === 'PENDING' ? 'Aguardando Aceite' : (OrderStatusLabels[order.status] || order.status)}
                                </div>
                            </div>

                            <div className="space-y-4 mb-6">
                                <div>
                                    <p className="text-[10px] font-black text-slate-300 uppercase tracking-widest mb-1">Cliente</p>
                                    <p className="font-bold text-slate-700 leading-tight">{order.clientName}</p>
                                    <p className="text-xs font-bold text-slate-400 mt-0.5">{order.clientPhone}</p>
                                </div>
                                {order.clientAddress && (
                                    <div>
                                        <p className="text-[10px] font-black text-slate-300 uppercase tracking-widest mb-1">Endereço</p>
                                        <p className="text-xs font-bold text-slate-500 leading-relaxed">{order.clientAddress}</p>
                                    </div>
                                )}
                            </div>

                            <div className="bg-slate-50 rounded-[2rem] p-5 mb-6 flex-1">
                                <p className="text-[10px] font-black text-slate-300 uppercase tracking-widest mb-3">Itens</p>
                                <div className="space-y-2 max-h-40 overflow-y-auto pr-1 custom-scrollbar">
                                    {order.items?.map((item, idx) => (
                                        <div key={idx} className="flex gap-2 text-sm">
                                            <span className="text-indigo-600 font-black">{item.quantity}x</span>
                                            <span className="font-bold text-slate-600 leading-tight">
                                                {item.product?.name || allProducts.find(p => p.id === item.productId)?.name || 'Produto'}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <div className="flex gap-3 mt-auto">
                                {order.status === 'PENDING' ? (
                                    <>
                                        <button onClick={() => approveOrder(order.id)} className="flex-1 py-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl font-black uppercase text-[10px] tracking-widest transition-all shadow-lg shadow-indigo-100 flex justify-center items-center gap-2">
                                            Aceitar
                                        </button>
                                        <button onClick={() => setEditingOrder(order)} className="w-12 h-12 bg-slate-100 hover:bg-indigo-50 text-slate-400 hover:text-indigo-600 rounded-2xl flex items-center justify-center transition-all">
                                            <Icons.Edit className="w-5 h-5" />
                                        </button>
                                        <button onClick={() => rejectOrder(order.id)} className="w-12 h-12 bg-rose-50 hover:bg-rose-500 text-rose-400 hover:text-white rounded-2xl flex items-center justify-center transition-all">
                                            <Icons.Delete className="w-5 h-5" />
                                        </button>
                                    </>
                                ) : (
                                    <>
                                        <div className="flex-1 py-4 bg-slate-50 text-slate-400 rounded-2xl font-black uppercase text-[10px] tracking-widest flex items-center justify-center">
                                            {order.status === 'DELIVERED' ? 'Finalizado' : OrderStatusLabels[order.status] || order.status}
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

            {printingOrder && businessSettings && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-md animate-in fade-in duration-300">
                    <div className="bg-white w-full max-w-[450px] rounded-[3rem] shadow-2xl p-10 flex flex-col items-center animate-in zoom-in duration-300 overflow-y-auto max-h-[95vh] custom-scrollbar">
                        <div className="w-full text-center space-y-1 mb-8">
                            <p className="font-black text-xl text-slate-800 tracking-tighter receipt-mono">{businessSettings.name?.toUpperCase()}</p>
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-relaxed">CNPJ: {businessSettings.cnpj}</p>
                        </div>

                        <div className="w-full border-2 border-slate-800 p-3 text-center mb-8">
                            <p className="font-black text-xs uppercase tracking-[0.2em] text-slate-800 receipt-mono">Comprovante de Pagamento</p>
                        </div>

                        <div className="w-full space-y-3 mb-8 text-[11px] font-bold text-slate-600 receipt-mono">
                            <div className="flex gap-2">
                                <span className="text-slate-400 uppercase">Data:</span>
                                <span>{new Date(printingOrder.createdAt).toLocaleString('pt-BR')}</span>
                            </div>
                            <div className="flex gap-2">
                                <span className="text-slate-400 uppercase">Cliente:</span>
                                <span className="text-slate-800">{printingOrder.clientName?.toUpperCase()}</span>
                            </div>
                            <div className="flex gap-2">
                                <span className="text-slate-400 uppercase">Fone:</span>
                                <span>{printingOrder.clientPhone}</span>
                            </div>
                            {printingOrder.clientAddress && (
                                <div className="flex gap-2">
                                    <span className="text-slate-400 uppercase shrink-0">Entrega:</span>
                                    <span className="leading-relaxed">{printingOrder.clientAddress.toUpperCase()}</span>
                                </div>
                            )}
                            <div className="flex gap-2 border-b border-dashed border-slate-200 pb-3">
                                <span className="text-slate-400 uppercase">Status:</span>
                                <span className="text-indigo-600">{(OrderStatusLabels[printingOrder.status] || printingOrder.status).toUpperCase()}</span>
                            </div>
                        </div>

                        <div className="w-full bg-slate-50 border border-slate-100 p-4 rounded-2xl flex justify-between items-center mb-10 receipt-mono">
                            <div className="flex gap-2 text-xs font-black uppercase">
                                <span className="text-slate-400">Pagto:</span>
                                <span className="text-slate-800">{printingOrder.paymentMethod}</span>
                            </div>
                            <button className="text-[10px] font-bold text-blue-600 underline">Editar</button>
                        </div>

                        <div className="w-full space-y-4 mb-8 receipt-mono border-t border-dashed border-slate-200 pt-6">
                            {printingOrder.items.map((it: any, idx: number) => (
                                <div key={idx} className="flex justify-between items-start text-xs font-bold text-slate-600">
                                    <span className="flex-1 mr-4">{it.quantity}X {it.product?.name || allProducts.find(p => p.id === it.productId)?.name || 'PRODUTO'}</span>
                                    <span className="text-slate-800 whitespace-nowrap">R$ {(it.price * it.quantity).toFixed(2)}</span>
                                </div>
                            ))}
                        </div>

                        <div className="w-full space-y-2 mb-8 receipt-mono border-t border-dashed border-slate-200 pt-6">
                            <div className="flex justify-between text-[11px] font-bold text-slate-500">
                                <span className="uppercase">Subtotal:</span>
                                <span className="text-slate-800">R$ {(printingOrder.total - (printingOrder.deliveryFee || 0)).toFixed(2)}</span>
                            </div>
                            {printingOrder.deliveryFee > 0 && (
                                <div className="flex justify-between text-[11px] font-bold text-slate-500">
                                    <span className="uppercase">Taxa Entrega:</span>
                                    <span className="text-slate-800">R$ {printingOrder.deliveryFee.toFixed(2)}</span>
                                </div>
                            )}
                        </div>

                        <div className="w-full flex justify-between items-baseline mb-12 receipt-mono border-t border-dashed border-slate-200 pt-6">
                            <span className="text-[11px] font-black text-slate-400 uppercase">Total:</span>
                            <span className="text-4xl font-black text-slate-800 tracking-tighter">R$ {printingOrder.total.toFixed(2)}</span>
                        </div>

                        <div className="w-full flex gap-4 no-print">
                            <button
                                onClick={() => window.print()}
                                className="flex-1 py-5 bg-[#0f172a] hover:bg-slate-800 text-white rounded-3xl font-black uppercase text-xs tracking-widest shadow-xl transition-all active:scale-95"
                            >
                                Imprimir
                            </button>
                            <button
                                onClick={() => setPrintingOrder(null)}
                                className="flex-1 py-5 bg-slate-50 hover:bg-slate-100 text-slate-500 rounded-3xl font-black uppercase text-xs tracking-widest transition-all"
                            >
                                Fechar
                            </button>
                        </div>

                        {/* Hidden Actual Printable Component */}
                        <div className="print-only fixed inset-0 bg-white text-black p-4 font-receipt text-[10px] is-receipt">
                            <div className="text-center mb-4 space-y-1">
                                <p className="font-bold">{businessSettings.name?.toUpperCase()}</p>
                                <p>CNPJ: {businessSettings.cnpj}</p>
                                <p className="border-y border-black py-1 my-2">COMPROVANTE DE PAGAMENTO</p>
                            </div>
                            <div className="space-y-1 mb-4">
                                <p>DATA: {new Date(printingOrder.createdAt).toLocaleString('pt-BR')}</p>
                                <p>CLIENTE: {printingOrder.clientName?.toUpperCase()}</p>
                                <p>FONE: {printingOrder.clientPhone}</p>
                                {printingOrder.clientAddress && <p>ENTREGA: {printingOrder.clientAddress.toUpperCase()}</p>}
                                <p>PAGTO: {printingOrder.paymentMethod?.toUpperCase()}</p>
                            </div>
                            <div className="border-t border-black pt-2 space-y-1">
                                {printingOrder.items.map((it: any, idx: number) => (
                                    <div key={idx} className="flex justify-between font-bold">
                                        <span>{it.quantity}X {it.product?.name || 'PRODUTO'}</span>
                                        <span>R$ {(it.price * it.quantity).toFixed(2)}</span>
                                    </div>
                                ))}
                            </div>
                            <div className="border-t border-black mt-2 pt-2 text-right space-y-1">
                                <p>SUBTOTAL R$ {(printingOrder.total - (printingOrder.deliveryFee || 0)).toFixed(2)}</p>
                                {printingOrder.deliveryFee > 0 && <p>TAXA ENTREGA R$ {printingOrder.deliveryFee.toFixed(2)}</p>}
                                <p className="font-bold text-base mt-2">TOTAL R$ {printingOrder.total.toFixed(2)}</p>
                            </div>
                            <div className="text-center mt-6 border-t border-black pt-2 op-70">
                                <p>DELIVERY FAST - OBRIGADO PELA PREFERENCIA</p>
                            </div>
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
            <div className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden animate-in zoom-in">
                <div className="p-8 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                    <div>
                        <h4 className="text-xl font-black text-slate-800 uppercase tracking-tighter">Editar Pedido #{order.id.slice(-4)}</h4>
                        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Ajuste itens, quantidades e pagamento</p>
                    </div>
                    <button onClick={onClose} className="p-3 bg-white text-slate-400 rounded-2xl hover:text-rose-500 transition-all shadow-sm">
                        <Icons.Delete className="w-5 h-5" />
                    </button>
                </div>

                <div className="flex-1 overflow-hidden flex gap-8 p-8">
                    {/* Items List */}
                    <div className="flex-1 flex flex-col gap-4 overflow-y-auto pr-4 custom-scrollbar">
                        <h5 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Itens do Pedido</h5>
                        {items.map((it, idx) => (
                            <div key={idx} className="bg-slate-50 p-4 rounded-2xl flex items-center gap-4 group">
                                <div className="w-12 h-12 bg-white rounded-xl shadow-sm flex items-center justify-center font-bold text-indigo-600">
                                    {it.quantity}x
                                </div>
                                <div className="flex-1">
                                    <p className="font-bold text-slate-700 text-sm">{it.product?.name || allProducts.find(p => p.id === it.productId)?.name || 'Produto'}</p>
                                    <p className="text-[10px] font-bold text-slate-400">R$ {it.price.toFixed(2)}/un</p>
                                </div>
                                <div className="flex items-center gap-2">
                                    <button onClick={() => updateQty(idx, -1)} className="w-8 h-8 bg-white border border-slate-200 rounded-lg flex items-center justify-center hover:bg-slate-100">-</button>
                                    <button onClick={() => updateQty(idx, 1)} className="w-8 h-8 bg-white border border-slate-200 rounded-lg flex items-center justify-center hover:bg-slate-100">+</button>
                                    <button onClick={() => removeItem(idx)} className="w-8 h-8 bg-rose-50 text-rose-500 rounded-lg flex items-center justify-center hover:bg-rose-500 hover:text-white transition-all ml-2">
                                        <Icons.Delete className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Menu & Summary */}
                    <div className="w-80 flex flex-col gap-6">
                        <div className="flex-1 bg-slate-50 rounded-[2rem] p-6 flex flex-col overflow-hidden">
                            <h5 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">Adicionar Item</h5>
                            <div className="flex-1 overflow-y-auto space-y-2 pr-2 custom-scrollbar text-xs">
                                {allProducts.map(p => (
                                    <button
                                        key={p.id}
                                        onClick={() => addItem(p)}
                                        className="w-full text-left p-3 bg-white rounded-xl hover:bg-indigo-50 border border-transparent hover:border-indigo-100 transition-all flex justify-between items-center group"
                                    >
                                        <span className="font-bold text-slate-600 group-hover:text-indigo-600 truncate mr-2">{p.name}</span>
                                        <span className="font-black text-slate-400 group-hover:text-indigo-600 flex-shrink-0">R$ {p.price}</span>
                                    </button>
                                ))}
                            </div>
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
                                        <option value="pix" className="text-slate-900">PIX</option>
                                        <option value="cartao_credito" className="text-slate-900">Cartão de Crédito</option>
                                        <option value="cartao_debito" className="text-slate-900">Cartão de Débito</option>
                                        <option value="dinheiro" className="text-slate-900">Dinheiro</option>
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
