import React, { useState, useEffect } from 'react';
import type { TableSession, Product, User, OrderItem, StoreStatus } from '../types';
import { db } from '../api';
import { X, Search, ShoppingCart, CheckCircle2, AlertCircle, Trash2, Plus, Minus, ArrowRight, LayoutGrid, RefreshCw, MessageSquare } from 'lucide-react';
import Modal from './Modal';
import ClientSelector from './ClientSelector';

interface TableDetailsProps {
    table: TableSession;
    user: User;
    onClose: () => void;
    onRefresh: () => void;
    storeStatus?: StoreStatus;
    resolvedWaiterId?: string | null;
}

const TableDetails: React.FC<TableDetailsProps> = ({ table, user, onClose, onRefresh, storeStatus, resolvedWaiterId }) => {
    const isSoftRejected = (() => {
        if (!table.pendingReviewItems) return false;
        try {
            const parsed = JSON.parse(table.pendingReviewItems);
            return parsed && typeof parsed === 'object' && !Array.isArray(parsed) && parsed.rejection;
        } catch (e) {
            return table.pendingReviewItems.startsWith('REJECTED:');
        }
    })();

    const [activeTab, setActiveTab] = useState<'CONSUMPTION' | 'LAUNCH' | 'REVIEW'>(
        (table.hasPendingDigital && !isSoftRejected) ? 'REVIEW' : 'CONSUMPTION'
    );
    const [products, setProducts] = useState<Product[]>([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [cart, setCart] = useState<OrderItem[]>([]);
    const [loading, setLoading] = useState(false);
    const [showTransfer, setShowTransfer] = useState(false);
    const [transferTarget, setTransferTarget] = useState<number | ''>('');
    const [showClientSelect, setShowClientSelect] = useState(false);

    const actingWaiterId = resolvedWaiterId || user.waiterId || user.id;

    const isResponsible = user.permissions.includes('admin') ||
        !table.waiterId ||
        (table.waiterId === actingWaiterId) ||
        (table.waiterId === user.id) ||
        (table.waiter?.email?.toLowerCase() === user.email.toLowerCase());

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

    const addToCart = (product: Product) => {
        setCart(prev => {
            const existing = prev.find(p => p.productId === product.id);
            if (existing) {
                return prev.map(p => p.productId === product.id ? { ...p, quantity: p.quantity + 1 } : p);
            }
            return [...prev, {
                id: `temp-${Date.now()}-${Math.random()}`,
                uid: `item-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
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

    const handleTransfer = async () => {
        if (!transferTarget) return;

        // Regra de negócio: somente o garçom responsável
        if (table.waiterId && table.waiterId !== user.id && !user.permissions.includes('admin')) {
            showAlert('Acesso Negado', 'Somente o garçom responsável por esta mesa pode transferi-lá.', 'error');
            return;
        }

        setLoading(true);
        try {
            await db.transferTable(table.tableNumber, Number(transferTarget), actingWaiterId, user.permissions);
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
        if (!isResponsible) {
            showAlert('Acesso Negado', 'Somente o garçom responsável por esta mesa pode solicitar a conta.', 'error');
            return;
        }

        if (!clientId && !clientName) {
            setShowClientSelect(true);
            return;
        }

        showAlert('Confirmar Fechamento', `Deseja solicitar o fechamento para ${clientName}?`, 'confirm', async () => {
            setLoading(true);
            try {
                await db.requestCheckout(table.tableNumber, clientId, clientName, actingWaiterId, user.permissions);
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
        if (!isResponsible) {
            showAlert('Acesso Negado', 'Somente o garçom responsável por esta mesa pode lançar itens.', 'error');
            return;
        }
        if (cart.length === 0) return;
        setLoading(true);
        try {
            await db.saveTableSession({
                tableNumber: table.tableNumber,
                items: [...table.items, ...cart.map(item => ({ ...item, id: undefined }))],
                status: 'occupied',
                clientId: table.clientId || 'ANONYMOUS',
                clientName: table.clientName || `Mesa ${table.tableNumber}`,
                waiterId: actingWaiterId,
                userPermissions: user.permissions
            } as any);
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
        if (!isResponsible) {
            showAlert('Acesso Negado', 'Somente o garçom responsável por esta mesa pode aprovar pedidos.', 'error');
            return;
        }
        if (!table.pendingReviewItems) return;
        setLoading(true);
        try {
            const parsed = JSON.parse(table.pendingReviewItems);
            const itemsToApprove = Array.isArray(parsed) ? parsed : (parsed.items || []);

            if (itemsToApprove.length > 0) {
                // Enrich items to ensure legacy orders without price/name get populated
                const enrichedItemsToApprove = itemsToApprove.map((item: any) => {
                    const product = products.find(p => p.id === item.productId);
                    return {
                        ...item,
                        productName: item.productName || (product ? product.name : 'Item'),
                        price: typeof item.price === 'number' ? item.price : (product ? product.price : 0)
                    };
                });

                const newItems = [...table.items, ...enrichedItemsToApprove];
                await db.saveTableSession({
                    tableNumber: table.tableNumber,
                    items: newItems,
                    status: 'occupied',
                    hasPendingDigital: false,
                    pendingReviewItems: null as any, // Explicitly null to clear in Prisma
                    clientId: table.clientId || 'ANONYMOUS',
                    clientName: table.clientName || `Mesa ${table.tableNumber}`,
                    waiterId: actingWaiterId,
                    userPermissions: user.permissions
                } as any);
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
        if (!isResponsible) {
            showAlert('Acesso Negado', 'Somente o garçom responsável por esta mesa pode rejeitar pedidos.', 'error');
            return;
        }
        showAlert('Rejeitar Pedido', 'Deseja REJEITAR estes itens? O cliente será notificado.', 'confirm', async () => {
            setLoading(true);
            try {
                if (table.items.length === 0) {
                    await db.deleteTableSession(table.tableNumber, true);
                } else {
                    await db.saveTableSession({
                        tableNumber: table.tableNumber,
                        items: table.items,
                        status: table.items.length > 0 ? 'occupied' : 'available',
                        hasPendingDigital: false,
                        pendingReviewItems: null as any,
                        waiterId: actingWaiterId,
                        userPermissions: user.permissions
                    } as any, true);
                }
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
        if (table.pendingReviewItems && !isSoftRejected) {
            const parsed = JSON.parse(table.pendingReviewItems);
            let rawPending = Array.isArray(parsed) ? parsed : (parsed.items || []);

            // Enrich with product data for legacy items missing price/name
            pendingItems = rawPending.map((item: any) => {
                const product = products.find(p => p.id === item.productId);
                return {
                    ...item,
                    productName: item.productName || (product ? product.name : 'Item'),
                    price: typeof item.price === 'number' ? item.price : (product ? product.price : 0)
                };
            });
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
                        onClick={() => {
                            if (storeStatus?.status === 'offline') return;
                            setActiveTab('LAUNCH');
                        }}
                        disabled={storeStatus?.status === 'offline'}
                        className={`shrink-0 px-6 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'LAUNCH' ? 'bg-slate-900 text-white shadow-lg' : (storeStatus?.status === 'offline' ? 'bg-slate-50 text-slate-200' : 'bg-slate-50 text-slate-400 border border-slate-100')}`}
                    >
                        Lançar
                    </button>
                    {table.hasPendingDigital && !isSoftRejected && (
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
                                    <div key={ix} className="premium-card p-5 border-l-4 transition-all duration-300 group hover:translate-x-1" style={{ borderLeftColor: item.isReady ? '#10b981' : '#f59e0b' }}>
                                        <div className="flex justify-between items-start gap-4">
                                            <div className="flex-1 min-w-0">
                                                <p className="text-sm font-black text-slate-800 uppercase tracking-tight leading-tight mb-0.5 break-words">
                                                    {item.quantity}x {item.productName || item.product?.name || 'Item'}
                                                </p>

                                                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5">
                                                    {item.isReady ? (
                                                        <div className="px-2 py-0.5 bg-emerald-50 text-emerald-600 rounded-md flex items-center gap-1">
                                                            <CheckCircle2 size={10} />
                                                            <span className="text-[9px] font-black uppercase tracking-widest">Pronto</span>
                                                        </div>
                                                    ) : (
                                                        <div className="px-2 py-0.5 bg-amber-50 text-amber-600 rounded-md flex items-center gap-1">
                                                            <RefreshCw size={10} className="animate-spin" />
                                                            <span className="text-[9px] font-black uppercase tracking-widest">Preparando</span>
                                                        </div>
                                                    )}

                                                    {item.observations && (
                                                        <div className="px-2 py-0.5 bg-slate-100 text-slate-500 rounded-md flex items-center gap-1.5 border border-slate-200/50">
                                                            <MessageSquare size={10} className="shrink-0" />
                                                            <span className="text-[9px] font-bold italic truncate max-w-[180px]">{item.observations}</span>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                            <div className="text-right shrink-0">
                                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.1em] leading-none mb-1">Total</p>
                                                <p className="text-sm font-black text-slate-900 tracking-tighter">R$ {(item.price * item.quantity).toFixed(2)}</p>
                                            </div>
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
                                    disabled={loading || storeStatus?.status === 'offline' || !isResponsible}
                                    className={`py-5 bg-emerald-600 text-white rounded-[2rem] font-black uppercase text-[11px] tracking-widest shadow-xl shadow-emerald-500/30 active:scale-95 transition-all flex items-center justify-center gap-2 ${storeStatus?.status === 'offline' || !isResponsible ? 'grayscale opacity-50 cursor-not-allowed' : ''}`}
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
                                disabled={loading || !isResponsible}
                                className={`w-full py-5 bg-slate-900 text-white rounded-[2rem] font-black uppercase text-[11px] tracking-[0.2em] shadow-2xl active:scale-[0.98] transition-all flex items-center justify-center gap-3 ${!isResponsible ? 'grayscale opacity-50 cursor-not-allowed' : ''}`}
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

                {showClientSelect && (
                    <ClientSelector
                        onSelect={(id, name) => handleCheckout(id, name)}
                        onClose={() => setShowClientSelect(false)}
                        anonymousLabel={`Mesa ${table.tableNumber}`}
                    />
                )}
            </div>
        </div>
    );
};

export default TableDetails;
