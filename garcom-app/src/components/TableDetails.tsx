import React, { useState, useEffect } from 'react';
import type { TableSession, Product } from '../types';
import { db } from '../api';

interface TableDetailsProps {
    table: TableSession;
    onClose: () => void;
    onRefresh: () => void;
}

const TableDetails: React.FC<TableDetailsProps> = ({ table, onClose, onRefresh }) => {
    const [activeTab, setActiveTab] = useState<'CONSUMPTION' | 'LAUNCH' | 'REVIEW'>('CONSUMPTION');
    const [products, setProducts] = useState<Product[]>([]);
    const [search, setSearch] = useState('');
    const [cart, setCart] = useState<{ productId: string, quantity: number, price: number, name: string }[]>([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        db.getProducts().then(setProducts);
        if (table.hasPendingDigital) setActiveTab('REVIEW');
    }, [table.hasPendingDigital]);

    const filteredProducts = products.filter(p => p.name.toLowerCase().includes(search.toLowerCase()));

    const addToCart = (p: Product) => {
        setCart(prev => {
            const existing = prev.find(item => item.productId === p.id);
            if (existing) {
                return prev.map(item => item.productId === p.id ? { ...item, quantity: item.quantity + 1 } : item);
            }
            return [...prev, { productId: p.id, quantity: 1, price: p.price, name: p.name }];
        });
    };

    const handleSave = async () => {
        if (cart.length === 0) return;
        setLoading(true);
        try {
            // Transform cart to OrderItems
            const newItems: any[] = cart.map(item => ({
                uid: `item-${Date.now()}-${item.productId}`,
                productId: item.productId,
                quantity: item.quantity,
                price: item.price
            }));

            await db.saveTableSession({
                tableNumber: table.tableNumber,
                items: [...table.items, ...newItems],
                status: 'occupied'
            });
            onRefresh();
            setCart([]);
            setActiveTab('CONSUMPTION');
        } catch (e) {
            alert('Erro ao salvar pedido');
        } finally {
            setLoading(false);
        }
    };

    const handleCheckout = async () => {
        if (!confirm('Deseja solicitar o fechamento desta mesa?')) return;
        try {
            await db.requestCheckout(table.tableNumber);
            onRefresh();
            onClose();
        } catch (e) {
            alert('Erro ao solicitar fechamento');
        }
    };

    const handleApproveDigital = async () => {
        if (!table.pendingReviewItems) return;
        setLoading(true);
        try {
            const pending = JSON.parse(table.pendingReviewItems);
            if (pending.items) {
                const newItems = [...table.items, ...pending.items];
                await db.saveTableSession({
                    tableNumber: table.tableNumber,
                    items: newItems,
                    status: 'occupied',
                    hasPendingDigital: false,
                    pendingReviewItems: undefined
                });
                onRefresh();
                setActiveTab('CONSUMPTION');
            }
        } catch (e) {
            alert('Erro ao aprovar pedido digital');
        } finally {
            setLoading(false);
        }
    };

    const handleRejectDigital = async () => {
        if (!confirm('Deseja REJEITAR estes itens? O cliente será notificado.')) return;
        setLoading(true);
        try {
            // To reject, we call saveTableSession with rejection flag or update the status
            // The backend handles rejection message via query param or by updating hasPendingDigital
            await db.saveTableSession({
                tableNumber: table.tableNumber,
                items: table.items, // Keep original items
                status: table.items.length > 0 ? 'occupied' : 'available',
                hasPendingDigital: false,
                pendingReviewItems: undefined
            });
            onRefresh();
            onClose();
        } catch (e) {
            alert('Erro ao rejeitar pedido');
        } finally {
            setLoading(false);
        }
    };

    const total = table.items.reduce((acc, item) => acc + (item.price * item.quantity), 0);
    const cartTotal = cart.reduce((acc, item) => acc + (item.price * item.quantity), 0);

    let pendingItems: any[] = [];
    try {
        if (table.pendingReviewItems) {
            const parsed = JSON.parse(table.pendingReviewItems);
            pendingItems = parsed.items || [];
        }
    } catch (e) { }

    return (
        <div className="fixed inset-0 z-50 bg-slate-950 flex flex-col animate-in slide-in-from-bottom duration-300">
            {/* Header */}
            <header className="p-6 pb-4 glass flex justify-between items-center">
                <div className="flex items-center gap-4">
                    <button onClick={onClose} className="p-2 -ml-2 text-slate-400">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                        </svg>
                    </button>
                    <div>
                        <h2 className="text-xl font-black italic tracking-tighter uppercase line-clamp-1">Mesa {table.tableNumber} {table.clientName && ` - ${table.clientName}`}</h2>
                        <div className="flex gap-2 mt-1">
                            <div className={`text-[8px] font-black px-2 py-0.5 rounded-full uppercase tracking-widest ${table.status === 'billing' ? 'bg-blue-500 text-white' : 'bg-red-500 text-white'}`}>
                                {table.status === 'billing' ? 'Aguardando Pagamento' : 'Em Consumo'}
                            </div>
                        </div>
                    </div>
                </div>
            </header>

            {/* Tabs */}
            <div className="flex border-b border-white/5 bg-slate-900/50">
                <button onClick={() => setActiveTab('CONSUMPTION')} className={`flex-1 py-4 text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'CONSUMPTION' ? 'text-blue-500 border-b-2 border-blue-500' : 'text-slate-500'}`}>Consumo</button>
                <button onClick={() => setActiveTab('LAUNCH')} className={`flex-1 py-4 text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'LAUNCH' ? 'text-blue-500 border-b-2 border-blue-500' : 'text-slate-500'}`}>Lançar</button>
                {table.hasPendingDigital && (
                    <button onClick={() => setActiveTab('REVIEW')} className={`flex-1 py-4 text-[10px] font-black uppercase tracking-widest transition-all bg-amber-500/10 ${activeTab === 'REVIEW' ? 'text-amber-500 border-b-2 border-amber-500' : 'text-amber-500/60'}`}>Revisar 🔔</button>
                )}
            </div>

            {/* Content */}
            <main className="flex-1 overflow-y-auto custom-scrollbar p-6">
                {activeTab === 'CONSUMPTION' && (
                    <div className="space-y-4">
                        <div className="glass p-6 rounded-[2rem]">
                            <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-4">Itens Pedidos</p>
                            <div className="space-y-4">
                                {table.items.map((item, ix) => (
                                    <div key={ix} className="flex justify-between items-start">
                                        <div className="flex-1">
                                            <p className="text-sm font-bold text-white uppercase">{item.quantity}x {item.product?.name || 'Produto'}</p>
                                            <p className="text-[10px] text-slate-500 font-bold uppercase tracking-tight">R$ {item.price.toFixed(2)} un.</p>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-sm font-black text-white italic">R$ {(item.price * item.quantity).toFixed(2)}</p>
                                        </div>
                                    </div>
                                ))}
                                {table.items.length === 0 && <p className="text-center py-8 text-slate-500 text-xs font-bold uppercase tracking-widest">Nenhum item lançado</p>}
                            </div>
                            <div className="mt-8 pt-6 border-t border-white/5 flex justify-between items-baseline">
                                <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Total Parcial</span>
                                <span className="text-3xl font-black italic text-blue-500 tracking-tighter">R$ {total.toFixed(2)}</span>
                            </div>
                        </div>

                        <button onClick={handleCheckout} className="w-full py-5 glass border-blue-500/30 text-blue-400 font-black uppercase text-xs tracking-widest rounded-[2rem] hover:bg-blue-500/10 transition-all">
                            Solicitar Conta
                        </button>
                    </div>
                )}

                {activeTab === 'LAUNCH' && (
                    <div className="space-y-6">
                        <div className="relative">
                            <input
                                type="text"
                                placeholder="Buscar produtos..."
                                className="w-full p-4 pl-12 bg-white/5 border border-white/10 rounded-2xl text-white font-medium outline-none text-sm"
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                            />
                            <svg xmlns="http://www.w3.org/2000/svg" className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                            </svg>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            {filteredProducts.map(p => (
                                <button key={p.id} onClick={() => addToCart(p)} className="p-4 glass rounded-2xl flex flex-col items-center gap-3 text-center active:scale-95 transition-all">
                                    <div className="w-12 h-12 bg-blue-500/20 rounded-xl flex items-center justify-center text-blue-400 font-black italic text-xl">
                                        {p.name.charAt(0)}
                                    </div>
                                    <div>
                                        <p className="text-[10px] font-black text-white uppercase truncate w-full">{p.name}</p>
                                        <p className="text-[9px] font-black text-blue-400 mt-1 uppercase tracking-widest">R$ {p.price.toFixed(2)}</p>
                                    </div>
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {activeTab === 'REVIEW' && (
                    <div className="space-y-6">
                        <div className="p-6 bg-amber-500/10 border border-amber-500/20 rounded-3xl">
                            <p className="text-xs font-black text-amber-500 uppercase tracking-widest mb-2">Novos Itens do Cardápio Digital</p>
                            <p className="text-[10px] text-amber-500/70 font-bold uppercase leading-relaxed">O cliente solicitou a adição dos itens abaixo. Você deve conferir se estão corretos antes de aprovar.</p>
                        </div>

                        <div className="space-y-4">
                            {pendingItems.map((item: any, ix: number) => (
                                <div key={ix} className="flex justify-between items-start bg-white/5 p-4 rounded-2xl border border-white/5">
                                    <div className="flex-1">
                                        <p className="text-sm font-bold text-white uppercase">{item.quantity}x {item.productName || 'Produto'}</p>
                                        {item.observations && <p className="text-[10px] text-amber-400 font-bold uppercase mt-1 italic">Obs: {item.observations}</p>}
                                    </div>
                                    <div className="text-right">
                                        <p className="text-sm font-black text-amber-500 italic">R$ {(item.price * item.quantity).toFixed(2)}</p>
                                    </div>
                                </div>
                            ))}
                            {pendingItems.length === 0 && <p className="text-center py-12 text-slate-500 font-bold uppercase text-[10px] tracking-widest">Nenhum item pendente</p>}
                        </div>

                        <div className="grid grid-cols-2 gap-4 pt-4">
                            <button onClick={handleRejectDigital} disabled={loading} className="py-4 bg-red-500/10 text-red-500 border border-red-500/20 rounded-2xl font-black uppercase text-[10px] tracking-widest active:scale-95 transition-all">Rejeitar</button>
                            <button onClick={handleApproveDigital} disabled={loading} className="py-4 bg-emerald-600 text-white rounded-2xl font-black uppercase text-[10px] tracking-widest shadow-lg shadow-emerald-900/40 active:scale-95 transition-all">Aceitar Tudo</button>
                        </div>
                    </div>
                )}
            </main>

            {/* Sticky Launch Bar */}
            {activeTab === 'LAUNCH' && cart.length > 0 && (
                <div className="p-6 glass animate-in slide-in-from-bottom duration-300">
                    <div className="flex justify-between items-baseline mb-4">
                        <span className="text-[10px] font-black text-blue-400 uppercase tracking-widest px-4 py-1 bg-blue-500/10 rounded-full">{cart.reduce((a, b) => a + b.quantity, 0)} itens no carrinho</span>
                        <span className="text-xl font-black italic text-white tracking-tighter">R$ {cartTotal.toFixed(2)}</span>
                    </div>
                    <button onClick={handleSave} disabled={loading} className="w-full py-5 bg-blue-600 rounded-[2rem] font-black text-white uppercase text-sm tracking-widest shadow-xl shadow-blue-500/20 active:scale-95 transition-all flex items-center justify-center gap-2">
                        {loading && <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin"></div>}
                        Lançar Agora
                    </button>
                </div>
            )}
        </div>
    );
};

export default TableDetails;
