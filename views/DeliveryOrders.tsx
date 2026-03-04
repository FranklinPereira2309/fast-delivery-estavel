import React, { useState, useEffect } from 'react';
import { db } from '../services/db';
import { socket } from '../services/socket';
import { Order, OrderStatus, User } from '../types';
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

    const fetchOrders = async () => {
        setIsLoading(true);
        const [allOrders, prods] = await Promise.all([db.getOrders(), db.getProducts()]);
        setAllProducts(prods);
        // Only fetch orders that are from the Delivery App AND not delivered/cancelled
        const appOrders = allOrders.filter(
            (o) => o.isOriginDeliveryApp && !['DELIVERED', 'CANCELLED'].includes(o.status)
        );
        setOrders(appOrders);
        setIsLoading(false);
    };

    useEffect(() => {
        fetchOrders();

        const handleOrdersUpdate = () => {
            fetchOrders();
        };

        const handleNewOrder = (order: Order) => {
            if (order.isOriginDeliveryApp) {
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

    // We will build edit and print logic next

    if (isLoading) {
        return <div className="p-8 flex items-center justify-center">Carregando pedidos...</div>;
    }

    return (
        <div className="p-6 h-full flex flex-col bg-slate-50">
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h1 className="text-2xl font-black text-slate-800 uppercase tracking-tighter flex items-center gap-3">
                        <div className="w-10 h-10 bg-indigo-100 text-indigo-600 rounded-xl flex items-center justify-center">
                            <Icons.Smartphone className="w-6 h-6" />
                        </div>
                        Gerenciador Delivery App
                    </h1>
                    <p className="text-sm text-slate-500 font-medium ml-14">Aprove, edite e envie pedidos do app para a cozinha.</p>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 flex-1 overflow-y-auto pr-2 pb-20">
                {orders.length === 0 ? (
                    <div className="col-span-full h-64 flex flex-col items-center justify-center border-2 border-dashed border-slate-200 rounded-3xl bg-white">
                        <Icons.Smartphone className="w-12 h-12 text-slate-300 mb-4" />
                        <p className="text-slate-500 font-medium">Nenhum pedido pendente do App Delivery.</p>
                    </div>
                ) : (
                    orders.map(order => (
                        <div key={order.id} className="bg-white p-5 rounded-3xl shadow-sm border border-slate-200 flex flex-col hover:shadow-md transition-shadow relative overflow-hidden group">
                            {order.status === 'PENDING' && (
                                <div className="absolute top-0 left-0 w-full h-1.5 bg-rose-500 animate-pulse"></div>
                            )}

                            <div className="flex justify-between items-start mb-4">
                                <div>
                                    <h3 className="font-bold text-lg text-slate-800">#{order.id.slice(-4).toUpperCase()}</h3>
                                    <div className="text-xs font-semibold px-2 py-1 rounded-full w-fit mt-1 bg-amber-100 text-amber-700">
                                        {order.status === 'PENDING' ? 'Aguardando Aceite' : order.status}
                                    </div>
                                </div>
                                <div className="text-right">
                                    <p className="text-xl font-black text-slate-800">R$ {order.total.toFixed(2)}</p>
                                    <p className="text-xs font-semibold text-slate-400 capitalize">{order.paymentMethod}</p>
                                </div>
                            </div>

                            <div className="space-y-2 mb-4">
                                <div>
                                    <p className="text-xs font-bold text-slate-400 uppercase">Cliente</p>
                                    <p className="font-semibold text-sm text-slate-700">{order.clientName}</p>
                                    <p className="text-xs text-slate-500">{order.clientPhone}</p>
                                </div>
                                {order.clientAddress && (
                                    <div>
                                        <p className="text-xs font-bold text-slate-400 uppercase">Endereço</p>
                                        <p className="text-xs text-slate-600 leading-tight">{order.clientAddress}</p>
                                    </div>
                                )}
                            </div>

                            <div className="flex-1 bg-slate-50 rounded-xl p-3 mb-4 overflow-y-auto max-h-32">
                                <p className="text-xs font-bold text-slate-400 uppercase mb-2">Itens</p>
                                {order.items?.map((item, idx) => (
                                    <div key={idx} className="flex justify-between items-center text-sm mb-1 pb-1 border-b border-slate-100 last:border-0 last:pb-0">
                                        <span className="font-medium text-slate-700 text-xs">
                                            <span className="text-indigo-600 font-bold mr-1">{item.quantity}x</span>
                                            {item.product?.name || allProducts.find(p => p.id === item.productId)?.name || 'Produto'}
                                        </span>
                                    </div>
                                ))}
                            </div>

                            {order.status === 'PENDING' ? (
                                <div className="flex gap-2 mt-auto">
                                    <button onClick={() => approveOrder(order.id)} className="flex-1 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl font-bold flex justify-center items-center gap-2 transition-colors">
                                        <Icons.Kitchen className="w-4 h-4" /> Aceitar
                                    </button>
                                    <button onClick={() => setEditingOrder(order)} className="flex-1 py-2.5 bg-indigo-100 hover:bg-indigo-200 text-indigo-600 rounded-xl font-bold flex justify-center items-center gap-2 transition-colors">
                                        <Icons.Edit className="w-4 h-4" /> Editar
                                    </button>
                                    <button onClick={() => rejectOrder(order.id)} className="px-3 py-2.5 bg-rose-50 cursor-pointer hover:bg-rose-100 text-rose-600 rounded-xl transition-colors flex items-center justify-center">
                                        <Icons.Delete className="w-5 h-5 pointer-events-none" />
                                    </button>
                                </div>
                            ) : (
                                <div className="flex gap-2 mt-auto">
                                    <button className="flex-1 py-2.5 bg-slate-100 text-slate-400 rounded-xl font-bold cursor-not-allowed">
                                        Já na Cozinha
                                    </button>
                                    <button className="px-3 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl transition-colors flex items-center justify-center">
                                        <Icons.Print className="w-5 h-5 pointer-events-none" />
                                    </button>
                                </div>
                            )}
                        </div>
                    ))
                )}
            </div>

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
