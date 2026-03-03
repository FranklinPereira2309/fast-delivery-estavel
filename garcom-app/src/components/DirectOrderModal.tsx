import React, { useState, useEffect } from 'react';
import { Minus, Plus, X, Search, LayoutGrid, Check } from 'lucide-react';
import { db } from '../api';
import type { User, Product, OrderItem, SaleType, StoreStatus } from '../types';
import Modal from './Modal';
import ClientSelector from './ClientSelector';

interface DirectOrderModalProps {
    user: User;
    onClose: () => void;
    onRefresh: () => void;
    storeStatus?: StoreStatus;
    resolvedWaiterId?: string | null;
}

const DirectOrderModal: React.FC<DirectOrderModalProps> = ({ user, onClose, onRefresh, storeStatus, resolvedWaiterId }) => {
    const orderType: SaleType = 'COUNTER';
    const [products, setProducts] = useState<Product[]>([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [cart, setCart] = useState<OrderItem[]>([]);
    const [loading, setLoading] = useState(false);
    const [showClientSelect, setShowClientSelect] = useState(false);
    const [modal, setModal] = useState<{
        isOpen: boolean;
        type: 'success' | 'error' | 'alert' | 'confirm';
        title: string;
        message: string;
        onConfirm?: () => void;
    }>({ isOpen: false, type: 'alert', title: '', message: '' });

    useEffect(() => {
        const fetchProducts = async () => {
            try {
                const data = await db.getProducts();
                setProducts(data);
            } catch (e) {
                console.error(e);
            }
        };
        fetchProducts();
    }, []);

    const showAlert = (title: string, message: string, type: any = 'info', onConfirm?: () => void) => {
        setModal({ isOpen: true, title, message, type, onConfirm });
    };

    const addToCart = (product: Product) => {
        setCart(prev => [...prev, {
            uid: `item-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            productId: product.id,
            product,
            quantity: 1,
            price: product.price
        }]);
    };

    const updateCartQuantity = (productId: string, delta: number) => {
        setCart(prev => prev.map(item => {
            if (item.productId === productId) {
                const newQty = Math.max(0, item.quantity + delta);
                return newQty === 0 ? null : { ...item, quantity: newQty };
            }
            return item;
        }).filter(Boolean) as OrderItem[]);
    };

    const handleConfirmOrder = () => {
        if (cart.length === 0) return;
        setShowClientSelect(true);
    };

    const submitOrder = async (clientId: string, clientName: string) => {
        setLoading(true);
        setShowClientSelect(false);
        try {
            const total = cart.reduce((acc, item) => acc + (item.price * item.quantity), 0);
            const orderPayload = {
                id: `PED-${Date.now()}`,
                type: orderType,
                status: 'PENDING',
                clientId,
                clientName,
                waiterId: resolvedWaiterId || user.waiterId || user.id,
                total,
                items: cart.map(item => ({
                    uid: item.uid,
                    productId: item.productId,
                    quantity: item.quantity,
                    price: item.price,
                    observations: item.observations
                }))
            };

            await db.createOrder(orderPayload);
            showAlert('Sucesso', 'Pedido lançado com sucesso!', 'success', () => {
                onRefresh();
                onClose();
            });
        } catch (e: any) {
            showAlert('Erro', e.message || 'Erro ao lançar pedido', 'error');
        } finally {
            setLoading(false);
        }
    };

    const cartTotal = cart.reduce((acc, item) => acc + (item.price * item.quantity), 0);
    const filteredProducts = products.filter(p =>
        p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.category.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex flex-col animate-in fade-in duration-300" onClick={onClose}>
            <div
                className="mt-auto bg-white w-full rounded-t-[3rem] max-h-[92vh] flex flex-col shadow-2xl animate-in slide-in-from-bottom duration-500 overflow-hidden relative"
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <header className="p-8 pb-4 flex justify-between items-start">
                    <div>
                        <div className="flex items-center gap-3 mb-2">
                            <span className="px-4 py-1.5 bg-slate-900 text-white text-[10px] font-black rounded-full uppercase tracking-widest shadow-lg">Lançamento Direto</span>
                        </div>
                        <h2 className="text-2xl font-black text-slate-900 tracking-tighter uppercase leading-none">Novo Balcão</h2>
                    </div>
                    <button onClick={onClose} className="p-3 bg-slate-100 rounded-2xl text-slate-400 active:scale-90 transition-all">
                        <X size={24} />
                    </button>
                </header>

                {/* Subtitle/Description */}
                <div className="px-8 mb-6">
                    <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest bg-slate-50 p-3 rounded-2xl text-center border border-slate-100 italic">
                        O pedido será processado como venda direta no balcão e enviado para a cozinha.
                    </p>
                </div>

                {/* Product Search */}
                <div className="px-8 mb-4 group relative">
                    <Search className="absolute left-12 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-blue-600 transition-colors" size={18} />
                    <input
                        type="text"
                        placeholder="Buscar produto..."
                        className="w-full pl-12 pr-6 py-4 bg-slate-50 border-none rounded-2xl text-slate-700 font-bold outline-none text-sm placeholder-slate-300 shadow-inner focus:ring-2 focus:ring-blue-500/10"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>

                {/* Product List */}
                <main className="flex-1 overflow-y-auto px-8 pb-40 hide-scrollbar">
                    <div className="space-y-3">
                        {filteredProducts.map(product => {
                            const cartItem = cart.find(p => p.productId === product.id);
                            const quantity = cartItem?.quantity || 0;

                            return (
                                <div key={product.id} className="premium-card p-4 flex justify-between items-center gap-3">
                                    <div className="flex items-center gap-3 flex-1 min-w-0">
                                        <div className="w-10 h-10 bg-slate-50 rounded-xl overflow-hidden shadow-inner flex items-center justify-center shrink-0">
                                            {product.imageUrl ? (
                                                <img src={product.imageUrl} className="w-full h-full object-cover" />
                                            ) : (
                                                <LayoutGrid className="text-slate-200" size={16} />
                                            )}
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <p className="text-xs font-black text-slate-800 uppercase mb-0.5 truncate">{product.name}</p>
                                            <p className="text-[8px] font-black text-blue-600 tracking-tighter">R$ {product.price.toFixed(2)}</p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-3 shrink-0">
                                        {quantity > 0 ? (
                                            <div className="flex items-center bg-slate-50 rounded-lg p-0.5 gap-1 border border-slate-100">
                                                <button
                                                    onClick={() => updateCartQuantity(product.id, -1)}
                                                    className="w-8 h-8 rounded-md bg-white shadow-sm flex items-center justify-center font-black text-slate-400 active:scale-90"
                                                >
                                                    <Minus size={12} />
                                                </button>
                                                <span className="w-6 text-center font-black text-xs text-slate-700">{quantity}</span>
                                                <button
                                                    onClick={() => updateCartQuantity(product.id, 1)}
                                                    className="w-8 h-8 rounded-md bg-blue-600 shadow-sm flex items-center justify-center font-black text-white active:scale-90"
                                                >
                                                    <Plus size={12} />
                                                </button>
                                            </div>
                                        ) : (
                                            <button
                                                onClick={() => addToCart(product)}
                                                className="w-10 h-10 bg-slate-900 text-white rounded-xl flex items-center justify-center shadow-lg active:scale-95"
                                            >
                                                <Plus size={18} />
                                            </button>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </main>

                {/* Footer Actions */}
                <div className="absolute bottom-0 left-0 right-0 p-8 pt-4 bg-white/80 backdrop-blur-md border-t border-slate-50">
                    <div className="flex justify-between items-center mb-4 px-4">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center text-white font-black shadow-lg shadow-blue-500/30">
                                {cart.reduce((s, i) => s + i.quantity, 0)}
                            </div>
                            <p className="text-xs font-black text-slate-900 uppercase tracking-tighter">Itens selecionados</p>
                        </div>
                        <p className="text-xl font-black text-blue-600 tracking-tighter">R$ {cartTotal.toFixed(2)}</p>
                    </div>
                    <button
                        onClick={() => {
                            if (storeStatus?.status === 'offline') return;
                            handleConfirmOrder();
                        }}
                        disabled={cart.length === 0 || loading || storeStatus?.status === 'offline'}
                        className={`w-full py-5 bg-slate-900 text-white rounded-[2rem] font-black uppercase text-[11px] tracking-[0.2em] shadow-2xl active:scale-[0.98] transition-all flex items-center justify-center gap-3 disabled:opacity-50 ${storeStatus?.status === 'offline' ? 'grayscale opacity-50 cursor-not-allowed' : ''}`}
                    >
                        <Check size={20} />
                        {loading ? 'Processando...' : (storeStatus?.status === 'offline' ? 'Loja Offline' : 'Confirmar e Identificar')}
                    </button>
                </div>

                <Modal
                    isOpen={modal.isOpen}
                    type={modal.type}
                    title={modal.title}
                    message={modal.message}
                    onConfirm={() => {
                        if (modal.onConfirm) modal.onConfirm();
                        setModal({ ...modal, isOpen: false });
                    }}
                    onClose={() => setModal({ ...modal, isOpen: false })}
                />

                {showClientSelect && (
                    <ClientSelector
                        onSelect={(id, name) => submitOrder(id, name)}
                        onClose={() => setShowClientSelect(false)}
                        title="Dono do Pedido"
                    />
                )}
            </div>
        </div>
    );
};

export default DirectOrderModal;
