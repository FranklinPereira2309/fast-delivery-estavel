import React, { useState, useEffect } from 'react';
import type { TableSession, Product, User } from '../types';
import { db } from '../api';
import { X, Search, ShoppingCart, CheckCircle2, AlertCircle, Trash2, Plus, Minus, ArrowRight, LayoutGrid, RefreshCw } from 'lucide-react';
import Modal from './Modal';

interface TableDetailsProps {
    table: TableSession;
    user: User;
    onClose: () => void;
    onRefresh: () => void;
}

const TableDetails: React.FC<TableDetailsProps> = ({ table, user, onClose, onRefresh }) => {
    const [activeTab, setActiveTab] = useState<'CONSUMPTION' | 'LAUNCH' | 'REVIEW'>(
        table.hasPendingDigital ? 'REVIEW' : 'CONSUMPTION'
    );
    const [products, setProducts] = useState<Product[]>([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [cart, setCart] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [clients, setClients] = useState<any[]>([]);
    const [showClientSelect, setShowClientSelect] = useState(false);
    const [clientSearch, setClientSearch] = useState('');

    const isResponsible = user.permissions.includes('admin') || !table.waiterId || table.waiterId === user.id;

    // Modal state
    const [modal, setModal] = useState<{
        isOpen: boolean;
        type: 'alert' | 'confirm' | 'success' | 'error';
        title: string;
        message: string;
        onConfirm?: () => void;
    }>({
        isOpen: false,
        type: 'alert',
        title: '',
        message: ''
    });

    const showAlert = (title: string, message: string, type: typeof modal.type = 'alert', onConfirm?: () => void) => {
        setModal({ isOpen: true, title, message, type, onConfirm });
    };

    useEffect(() => {
        if (activeTab === 'LAUNCH') {
            db.getProducts().then(setProducts).catch(console.error);
        }
    }, [activeTab]);

    useEffect(() => {
        if (showClientSelect) {
            db.getClients().then(setClients).catch(console.error);
        }
    }, [showClientSelect]);

    const addToCart = (product: Product) => {
        setCart(prev => {
            const existing = prev.find(p => p.productId === product.id);
            if (existing) {
                return prev.map(p => p.productId === product.id ? { ...p, quantity: p.quantity + 1 } : p);
            }
            return [...prev, {
                uid: crypto.randomUUID(),
                productId: product.id,
                productName: product.name,
                quantity: 1,
                price: product.price,
                isReady: false
            }];
        });
    };

    const updateCartQuantity = (productId: string, delta: number) => {
        setCart(prev => prev.map(p => {
            if (p.productId === productId) {
                const newQty = Math.max(0, p.quantity + delta);
                return { ...p, quantity: newQty };
            }
            return p;
        }).filter(p => p.quantity > 0));
    };

    const [showTransfer, setShowTransfer] = useState(false);
    const [transferTarget, setTransferTarget] = useState<number | ''>('');

    const handleTransfer = async () => {
        if (!transferTarget) return;

        // Regra de negócio: somente o garçom responsável
        if (table.waiterId && table.waiterId !== user.id && !user.permissions.includes('admin')) {
            showAlert('Acesso Negado', 'Somente o garçom responsável por esta mesa pode transferi-lá.', 'error');
            return;
        }

        setLoading(true);
        try {
            await db.transferTable(table.tableNumber, Number(transferTarget), user.id);
            showAlert('Sucesso', 'Mesa transferida com sucesso!', 'success', () => {
                onRefresh();
                onClose();
            });
        } catch (e: any) {
            showAlert('Erro', e.message || 'Erro ao transferir mesa', 'error');
        } finally {
            setLoading(false);
        }
    };

    const handleCheckout = async (clientId?: string, clientName?: string) => {
        if (!clientId && !clientName) {
            setShowClientSelect(true);
            return;
        }

        showAlert('Confirmar Fechamento', `Deseja solicitar o fechamento para ${clientName}?`, 'confirm', async () => {
            setLoading(true);
            try {
                await db.requestCheckout(table.tableNumber, clientId, clientName);
                setShowClientSelect(false);
                onRefresh();
                onClose();
            } catch (e) {
                showAlert('Erro', 'Erro ao solicitar fechamento', 'error');
            } finally {
                setLoading(false);
            }
        });
    };

    const handleSave = async () => {
        if (cart.length === 0) return;
        setLoading(true);
        try {
            const newItems = [...table.items, ...cart];
            await db.saveTableSession({
                tableNumber: table.tableNumber,
                items: newItems,
                status: 'occupied',
                clientId: table.clientId || 'ANONYMOUS',
                clientName: table.clientName || `Mesa ${table.tableNumber}`
            });
            setCart([]);
            onRefresh();
            setActiveTab('CONSUMPTION');
            showAlert('Sucesso', 'Itens lançados com sucesso!', 'success');
        } catch (e) {
            showAlert('Erro', 'Erro ao lançar itens', 'error');
        } finally {
            setLoading(false);
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
                    pendingReviewItems: undefined,
                    clientId: table.clientId || 'ANONYMOUS',
                    clientName: table.clientName || `Mesa ${table.tableNumber}`
                });
                onRefresh();
                setActiveTab('CONSUMPTION');
                showAlert('Sucesso', 'Pedido digital aprovado!', 'success');
            }
        } catch (e) {
            showAlert('Erro', 'Erro ao aprovar pedido digital', 'error');
        } finally {
            setLoading(false);
        }
    };

    const handleRejectDigital = async () => {
        showAlert('Rejeitar Pedido', 'Deseja REJEITAR estes itens? O cliente será notificado.', 'confirm', async () => {
            setLoading(true);
            try {
                await db.saveTableSession({
                    tableNumber: table.tableNumber,
                    items: table.items,
                    status: table.items.length > 0 ? 'occupied' : 'available',
                    hasPendingDigital: false,
                    pendingReviewItems: undefined
                });
                onRefresh();
                onClose();
            } catch (e) {
                showAlert('Erro', 'Erro ao rejeitar pedido', 'error');
            } finally {
                setLoading(false);
            }
        });
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

    // Filter in lowercase
    const filteredProducts = products.filter(p =>
        p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.category.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <div
            className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex flex-col animate-in fade-in duration-300"
            onClick={onClose}
        >
            <div
                className="mt-auto bg-white w-full rounded-t-[3rem] max-h-[92vh] flex flex-col shadow-2xl animate-in slide-in-from-bottom duration-500 overflow-hidden relative"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <header className="p-8 pb-4 flex justify-between items-start">
                    <div>
                        <div className="flex items-center gap-3 mb-2">
                            <span className="px-4 py-1.5 bg-blue-600 text-white text-[10px] font-black rounded-full uppercase tracking-widest shadow-lg shadow-blue-500/30">Mesa {table.tableNumber}</span>
                            {table.status === 'billing' && <span className="px-4 py-1.5 bg-amber-500 text-white text-[10px] font-black rounded-full uppercase tracking-widest">Aguardando Pagamento</span>}
                        </div>
                        <h2 className="text-2xl font-black text-slate-900 tracking-tighter uppercase leading-none">Gerenciar Mesa</h2>
                    </div>
                    <div className="flex gap-2">
                        {table.status === 'occupied' && !showTransfer && isResponsible && (
                            <button
                                onClick={() => setShowTransfer(true)}
                                className="p-3 bg-slate-100 text-blue-600 rounded-2xl active:scale-95 transition-all text-[10px] font-black uppercase tracking-widest flex items-center gap-2"
                            >
                                <RefreshCw size={18} />
                                Transferir
                            </button>
                        )}
                        <button onClick={onClose} className="p-3 bg-slate-100 rounded-2xl text-slate-400 active:scale-90 transition-all">
                            <X size={24} />
                        </button>
                    </div>
                </header>

                {/* Transfer UI Overlay */}
                {showTransfer && (
                    <div className="px-8 mb-6 animate-in slide-in-from-top duration-300">
                        <div className="p-6 bg-blue-50 border border-blue-100 rounded-[2rem] flex flex-col gap-4">
                            <div className="flex justify-between items-center">
                                <h4 className="text-[10px] font-black text-blue-600 uppercase tracking-widest">Transferir para Mesa:</h4>
                                <button onClick={() => setShowTransfer(false)} className="text-blue-400 font-bold text-[10px] uppercase">Cancelar</button>
                            </div>
                            <div className="flex flex-col sm:flex-row gap-3">
                                <input
                                    type="number"
                                    placeholder="Nº Mesa"
                                    className="flex-1 bg-white border-none rounded-xl px-4 py-4 text-sm font-black outline-none focus:ring-2 focus:ring-blue-500/20"
                                    value={transferTarget}
                                    onChange={(e) => setTransferTarget(e.target.value === '' ? '' : Number(e.target.value))}
                                />
                                <button
                                    onClick={handleTransfer}
                                    disabled={!transferTarget || loading}
                                    className="px-8 py-4 bg-blue-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest shadow-lg shadow-blue-500/30 disabled:opacity-50 active:scale-95 transition-all w-full sm:w-auto"
                                >
                                    Confirmar
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Tabs */}
                <div className="px-8 flex gap-2 mb-6 overflow-x-auto hide-scrollbar">
                    <button
                        onClick={() => setActiveTab('CONSUMPTION')}
                        className={`shrink-0 px-6 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'CONSUMPTION' ? 'bg-slate-900 text-white shadow-lg' : 'bg-slate-50 text-slate-400 border border-slate-100'}`}
                    >
                        Consumo
                    </button>
                    <button
                        onClick={() => setActiveTab('LAUNCH')}
                        className={`shrink-0 px-6 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'LAUNCH' ? 'bg-slate-900 text-white shadow-lg' : 'bg-slate-50 text-slate-400 border border-slate-100'}`}
                    >
                        Lançar
                    </button>
                    {table.hasPendingDigital && (
                        <button
                            onClick={() => setActiveTab('REVIEW')}
                            className={`shrink-0 px-6 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'REVIEW' ? 'bg-amber-500 text-white shadow-lg animate-pulse' : 'bg-amber-50 text-amber-500 border border-amber-100'}`}
                        >
                            Digital (!)
                        </button>
                    )}
                </div>

                {/* Content Area */}
                <main className="flex-1 overflow-y-auto px-8 pb-32 hide-scrollbar">
                    {!isResponsible && (
                        <div className="mb-6 p-4 bg-red-50 border border-red-100 rounded-2xl flex items-center gap-3 animate-in fade-in zoom-in duration-300">
                            <AlertCircle className="text-red-500" size={20} />
                            <p className="text-[10px] font-black text-red-600 uppercase tracking-widest">
                                Esta mesa está sob responsabilidade de outro garçom.
                            </p>
                        </div>
                    )}
                    {activeTab === 'CONSUMPTION' && (
                        <div className="space-y-4">
                            {table.items.length === 0 ? (
                                <div className="text-center py-16">
                                    <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4 opacity-50">
                                        <ShoppingCart size={32} className="text-slate-300" />
                                    </div>
                                    <p className="text-slate-400 font-black uppercase text-[10px] tracking-[0.2em]">Nenhum item lançado ainda</p>
                                </div>
                            ) : (
                                table.items.map((item: any, ix: number) => (
                                    <div key={ix} className="premium-card p-5 flex justify-between items-center group">
                                        <div>
                                            <p className="text-sm font-black text-slate-800 uppercase tracking-tight">{item.quantity}x {item.productName || item.product?.name || 'Item'}</p>
                                            <div className="flex items-center gap-2 mt-1">
                                                {item.isReady ? (
                                                    <span className="text-[9px] font-black text-emerald-500 uppercase flex items-center gap-1"><CheckCircle2 size={10} /> Pronto</span>
                                                ) : (
                                                    <span className="text-[9px] font-black text-amber-500 uppercase flex items-center gap-1"><RefreshCw size={10} className="animate-spin" /> Preparando</span>
                                                )}
                                                {item.observations && <span className="text-[9px] font-bold text-slate-400 truncate max-w-[150px]">| {item.observations}</span>}
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-sm font-black text-slate-900 tracking-tighter">R$ {(item.price * item.quantity).toFixed(2)}</p>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    )}

                    {activeTab === 'LAUNCH' && (
                        <div className="space-y-6">
                            <div className="relative group">
                                <Search className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-blue-600 transition-colors" size={20} />
                                <input
                                    type="text"
                                    placeholder="Buscar produto ou categoria..."
                                    className="w-full pl-14 pr-6 py-5 bg-slate-50 border-none rounded-[2rem] text-slate-700 font-bold outline-none text-sm placeholder-slate-300 shadow-inner focus:ring-2 focus:ring-blue-500/10"
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value.toLowerCase())} // Lowercase search
                                />
                            </div>

                            <div className="space-y-3">
                                {filteredProducts.map(product => {
                                    const cartItem = cart.find(p => p.productId === product.id);
                                    const quantity = cartItem?.quantity || 0;

                                    return (
                                        <div key={product.id} className="premium-card p-3 sm:p-4 flex justify-between items-center gap-2 transition-all">
                                            <div className="flex items-center gap-2 sm:gap-3 flex-1 min-w-0">
                                                <div className="w-10 h-10 bg-slate-50 rounded-xl overflow-hidden shadow-inner flex items-center justify-center shrink-0">
                                                    {product.imageUrl ? (
                                                        <img src={product.imageUrl} className="w-full h-full object-cover" />
                                                    ) : (
                                                        <LayoutGrid className="text-slate-200" size={16} />
                                                    )}
                                                </div>
                                                <div className="min-w-0 flex-1">
                                                    <p className="text-[11px] sm:text-xs font-black text-slate-800 uppercase leading-none mb-1 truncate">{product.name}</p>
                                                    <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest truncate">{product.category}</p>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-1.5 sm:gap-3 shrink-0">
                                                <p className="text-[10px] sm:text-[11px] font-black text-blue-600 tracking-tighter shrink-0">R$ {product.price.toFixed(2)}</p>

                                                {quantity > 0 ? (
                                                    <div className="flex items-center bg-slate-50 rounded-lg p-0.5 gap-1 border border-slate-100 shrink-0">
                                                        <button
                                                            onClick={() => updateCartQuantity(product.id, -1)}
                                                            className="w-7 h-7 rounded-md bg-white shadow-sm flex items-center justify-center font-black text-slate-400 active:scale-90 transition-transform"
                                                        >
                                                            <Minus size={12} />
                                                        </button>
                                                        <span className="w-4 text-center font-black text-[10px] text-slate-700">{quantity}</span>
                                                        <button
                                                            onClick={() => updateCartQuantity(product.id, 1)}
                                                            className="w-7 h-7 rounded-md bg-blue-600 shadow-sm flex items-center justify-center font-black text-white active:scale-90 transition-transform"
                                                        >
                                                            <Plus size={12} />
                                                        </button>
                                                    </div>
                                                ) : (
                                                    <button
                                                        onClick={() => addToCart(product)}
                                                        className="w-8 h-8 sm:w-9 sm:h-9 bg-slate-900 text-white rounded-lg flex items-center justify-center shadow-lg active:scale-95 transition-all shrink-0"
                                                    >
                                                        <Plus size={16} />
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {activeTab === 'REVIEW' && (
                        <div className="space-y-6">
                            <div className="p-6 bg-amber-50 border border-amber-100 rounded-[2rem] flex items-start gap-4 shadow-sm shadow-amber-500/10">
                                <AlertCircle className="text-amber-500 shrink-0 mt-1" size={24} />
                                <div>
                                    <h4 className="text-xs font-black text-amber-600 uppercase tracking-widest mb-1">Novos Pedidos do Cliente</h4>
                                    <p className="text-[10px] text-amber-500/80 font-bold leading-relaxed uppercase">O cliente solicitou novos itens via QR Code. Verifique e aprove abaixo.</p>
                                </div>
                            </div>

                            <div className="space-y-3">
                                {pendingItems.map((item: any, ix: number) => (
                                    <div key={ix} className="premium-card p-5 flex justify-between items-center border-amber-100 bg-amber-50/20">
                                        <div>
                                            <p className="text-sm font-black text-slate-800 uppercase tracking-tight">{item.quantity}x {item.productName || 'Item'}</p>
                                            {item.observations && <p className="text-[10px] text-amber-600 font-bold uppercase mt-1 italic tracking-tight">Obs: {item.observations}</p>}
                                        </div>
                                        <div className="text-right">
                                            <p className="text-sm font-black text-slate-900 tracking-tighter">R$ {(item.price * item.quantity).toFixed(2)}</p>
                                        </div>
                                    </div>
                                ))}
                            </div>

                            <div className="grid grid-cols-2 gap-4 pt-4">
                                <button
                                    onClick={handleRejectDigital}
                                    className="py-5 bg-red-50 text-red-600 border border-red-100 rounded-[2rem] font-black uppercase text-[11px] tracking-widest active:scale-95 transition-all flex items-center justify-center gap-2"
                                >
                                    <Trash2 size={18} />
                                    Rejeitar
                                </button>
                                <button
                                    onClick={handleApproveDigital}
                                    className="py-5 bg-emerald-600 text-white rounded-[2rem] font-black uppercase text-[11px] tracking-widest shadow-xl shadow-emerald-500/30 active:scale-95 transition-all flex items-center justify-center gap-2"
                                >
                                    <CheckCircle2 size={18} />
                                    Aceitar Tudo
                                </button>
                            </div>
                        </div>
                    )}
                </main>

                {/* Sticky Actions Bar */}
                <div className="absolute bottom-0 left-0 right-0 p-8 pt-4 bg-white/80 backdrop-blur-md border-t border-slate-50 flex flex-col gap-4">
                    {activeTab === 'LAUNCH' && cart.length > 0 && (
                        <div className="flex flex-col gap-4">
                            <div className="flex justify-between items-center px-4">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center text-white font-black shadow-lg shadow-blue-500/30">
                                        {cart.reduce((s, i) => s + i.quantity, 0)}
                                    </div>
                                    <p className="text-xs font-black text-slate-900 uppercase tracking-tighter">Itens no Carrinho</p>
                                </div>
                                <p className="text-xl font-black text-blue-600 tracking-tighter">R$ {cartTotal.toFixed(2)}</p>
                            </div>
                            <button
                                onClick={handleSave}
                                disabled={loading}
                                className="w-full py-5 bg-slate-900 text-white rounded-[2rem] font-black uppercase text-[11px] tracking-[0.2em] shadow-2xl active:scale-[0.98] transition-all flex items-center justify-center gap-3"
                            >
                                <ArrowRight size={20} />
                                {loading ? 'Lançando...' : 'Confirmar Lançamento'}
                            </button>
                        </div>
                    )}

                    {activeTab === 'CONSUMPTION' && (
                        <div className="flex justify-between items-center gap-6">
                            <div className="flex-1">
                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-1 px-1">Total Consumido</p>
                                <p className="text-3xl font-black text-slate-900 tracking-tighter">R$ {total.toFixed(2)}</p>
                            </div>
                            <button
                                onClick={() => handleCheckout()}
                                disabled={table.status === 'billing' || loading || !isResponsible}
                                className={`px-8 py-5 rounded-[2rem] font-black uppercase text-[11px] tracking-widest transition-all active:scale-95 shadow-xl ${table.status === 'billing' || !isResponsible ? 'bg-slate-50 text-slate-300 cursor-not-allowed border border-slate-100' : 'bg-blue-600 text-white shadow-blue-500/20 hover:bg-blue-700'}`}
                            >
                                {loading ? '...' : (table.status === 'billing' ? 'Conta Solicitada' : 'Solicitar Conta')}
                            </button>
                        </div>
                    )}
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

                {/* Client Selection Modal */}
                {showClientSelect && (
                    <div className="fixed inset-0 z-[60] bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-6 animate-in fade-in duration-300">
                        <div className="bg-white w-full max-w-md rounded-[2.5rem] shadow-2xl p-8 animate-in zoom-in duration-300">
                            <div className="flex justify-between items-center mb-6">
                                <h3 className="text-xl font-black text-slate-900 uppercase tracking-tighter">Identificar Cliente</h3>
                                <button onClick={() => setShowClientSelect(false)} className="p-2 bg-slate-50 rounded-xl text-slate-400">
                                    <X size={20} />
                                </button>
                            </div>

                            <div className="relative mb-6">
                                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" size={18} />
                                <input
                                    type="text"
                                    placeholder="Buscar cliente..."
                                    className="w-full pl-12 pr-4 py-4 bg-slate-50 border-none rounded-2xl text-sm font-bold outline-none ring-2 ring-transparent focus:ring-blue-500/10"
                                    value={clientSearch}
                                    onChange={(e) => setClientSearch(e.target.value)}
                                />
                            </div>

                            <div className="max-h-60 overflow-y-auto mb-6 pr-2 space-y-2 custom-scrollbar">
                                <button
                                    onClick={() => handleCheckout('ANONYMOUS', `Mesa ${table.tableNumber}`)}
                                    className="w-full p-4 bg-blue-50 border border-blue-100 rounded-xl flex items-center justify-between group hover:bg-blue-600 transition-all"
                                >
                                    <span className="text-xs font-black text-blue-600 uppercase tracking-widest group-hover:text-white">Consumidor Avulso</span>
                                    <ArrowRight size={16} className="text-blue-400 group-hover:text-white" />
                                </button>

                                {clients
                                    .filter(c => c.name.toLowerCase().includes(clientSearch.toLowerCase()))
                                    .map(client => (
                                        <button
                                            key={client.id}
                                            onClick={() => handleCheckout(client.id, client.name)}
                                            className="w-full p-4 bg-slate-50 border border-slate-100 rounded-xl flex items-center justify-between group hover:bg-slate-900 transition-all"
                                        >
                                            <div className="text-left">
                                                <p className="text-xs font-black text-slate-700 uppercase group-hover:text-white">{client.name}</p>
                                                <p className="text-[9px] font-bold text-slate-400 group-hover:text-slate-400/60 uppercase">{client.phone}</p>
                                            </div>
                                            <ArrowRight size={16} className="text-slate-300 group-hover:text-white" />
                                        </button>
                                    ))}
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default TableDetails;
