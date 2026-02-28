
import React, { useState, useEffect } from 'react';
import { Receivable, User, Client, Order, Product, OrderItem } from '../types';
import { db } from '../services/db';
import { Icons } from '../constants';
import CustomAlert from '../components/CustomAlert';

interface ReceivablesProps {
    currentUser: User;
}

const Receivables: React.FC<ReceivablesProps> = ({ currentUser }) => {
    const [receivables, setReceivables] = useState<(Receivable & { client: Client })[]>([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
    const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);
    const [isEditItemsOpen, setIsEditItemsOpen] = useState(false);
    const [availableProducts, setAvailableProducts] = useState<Product[]>([]);
    const [editingItems, setEditingItems] = useState<any[]>([]);

    const [alertConfig, setAlertConfig] = useState<{
        isOpen: boolean;
        title: string;
        message: string;
        type: 'INFO' | 'DANGER' | 'SUCCESS';
        onConfirm: () => void;
        onCancel?: () => void;
        showPasswordInput?: boolean;
    }>({
        isOpen: false,
        title: '',
        message: '',
        type: 'INFO',
        onConfirm: () => { },
    });

    const [adminPassword, setAdminPassword] = useState('');

    const closeAlert = () => {
        setAlertConfig(prev => ({ ...prev, isOpen: false }));
        setAdminPassword('');
    };

    const showAlert = (config: Partial<typeof alertConfig>) => {
        setAlertConfig({
            isOpen: true,
            title: '',
            message: '',
            type: 'INFO',
            onConfirm: closeAlert,
            onCancel: undefined,
            showPasswordInput: false,
            ...config
        });
    };

    useEffect(() => {
        refreshData();
        loadProducts();
    }, []);

    const loadProducts = async () => {
        const prods = await db.getProducts();
        setAvailableProducts(prods);
    };

    const refreshData = async () => {
        try {
            const data = await db.getReceivables();
            setReceivables(data);
        } catch (err) {
            console.error("Error fetching receivables", err);
        }
    };

    const handleReceive = (receivable: Receivable & { client: Client }) => {
        showAlert({
            title: 'RECEBER PAGAMENTO',
            message: `Deseja registrar o recebimento de R$ ${receivable.amount.toFixed(2)} do cliente ${receivable.client.name}?`,
            type: 'SUCCESS',
            onConfirm: async () => {
                try {
                    await db.receivePayment(receivable.id, 'DIRETAMENTE', currentUser);
                    closeAlert();
                    refreshData();
                    showAlert({ title: 'SUCESSO', message: 'Recebimento registrado e injetado no caixa do dia.', type: 'SUCCESS' });
                } catch (err: any) {
                    showAlert({ title: 'ERRO', message: err.message || 'Erro ao processar recebimento.', type: 'DANGER' });
                }
            }
        });
    };

    const handleDelete = (id: string) => {
        setAlertConfig({
            isOpen: true,
            title: 'EXCLUIR RECEBÍVEL',
            message: 'Apenas Administradores podem excluir débitos. Insira a senha Master para confirmar:',
            type: 'DANGER',
            showPasswordInput: true,
            onConfirm: async () => {
                const isValid = await db.verifyAdminPassword(adminPassword);
                if (!isValid) {
                    showAlert({ title: 'SENHA INCORRETA', message: 'A senha informada é inválida.', type: 'DANGER' });
                    return;
                }

                try {
                    await db.deleteReceivable(id, currentUser);
                    closeAlert();
                    refreshData();
                    showAlert({ title: 'REMOVIDO', message: 'Débito excluído com sucesso.', type: 'SUCCESS' });
                } catch (err: any) {
                    showAlert({ title: 'ERRO', message: err.message || 'Erro ao excluir.', type: 'DANGER' });
                }
            }
        });
    };

    const handleViewDetails = async (orderId: string) => {
        try {
            const order = await db.getOrderById(orderId);
            setSelectedOrder(order);
            setIsDetailsModalOpen(true);
        } catch (err) {
            console.error("Error fetching order details", err);
            showAlert({ title: 'ERRO', message: 'Não foi possível carregar os detalhes do pedido.', type: 'DANGER' });
        }
    };

    const startEditingItems = () => {
        if (!selectedOrder) return;
        setEditingItems(selectedOrder.items.map(i => ({ ...i, uid: i.id })));
        setIsEditItemsOpen(true);
    };

    const handleUpdateItems = async () => {
        if (!selectedOrder) return;
        try {
            await db.updateOrderItems(selectedOrder.id, editingItems, currentUser);
            setIsEditItemsOpen(false);
            setIsDetailsModalOpen(false);
            refreshData();
            showAlert({ title: 'SUCESSO', message: 'Itens do pedido e valor do fiado atualizados com sucesso.', type: 'SUCCESS' });
        } catch (err: any) {
            showAlert({ title: 'ERRO', message: err.message || 'Erro ao atualizar itens.', type: 'DANGER' });
        }
    };

    const addItem = (product: Product) => {
        setEditingItems(prev => [...prev, {
            productId: product.id,
            product: product,
            quantity: 1,
            price: product.price,
            uid: `new-${Date.now()}`
        }]);
    };

    const removeItem = (uid: string) => {
        setEditingItems(prev => prev.filter(i => i.uid !== uid));
    };

    const updateItemQty = (uid: string, delta: number) => {
        setEditingItems(prev => prev.map(i => {
            if (i.uid === uid) {
                const newQty = Math.max(1, i.quantity + delta);
                return { ...i, quantity: newQty };
            }
            return i;
        }));
    };

    const calculateTotal = () => {
        return editingItems.reduce((acc, item) => acc + (item.price * item.quantity), 0) + (selectedOrder?.deliveryFee || 0);
    };

    const calculateStatus = (dueDate: string) => {
        const due = new Date(dueDate);
        const today = new Date();
        const diffTime = today.getTime() - due.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        if (diffDays > 30) {
            return { label: `Vencido (${diffDays} dias)`, color: 'bg-red-500', text: 'text-red-600' };
        } else if (diffDays > 0) {
            return { label: `Vencido (${diffDays} dias)`, color: 'bg-orange-500', text: 'text-orange-600' };
        } else {
            return { label: 'Em dias', color: 'bg-emerald-500', text: 'text-emerald-600' };
        }
    };

    const filtered = receivables.filter(r =>
        r.client.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        r.orderId.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <div className="bg-white rounded-[2.5rem] shadow-sm border border-slate-100 flex flex-col h-full overflow-hidden animate-in fade-in duration-500">
            <div className="p-8 border-b border-slate-50 bg-slate-50/50 flex flex-col md:flex-row justify-between items-center gap-6">
                <div>
                    <h3 className="text-2xl font-black text-slate-800 uppercase tracking-tighter">Gestão de Recebimentos</h3>
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">Controle de clientes fiado e contas a receber</p>
                </div>

                <div className="flex flex-1 max-w-xl gap-4 w-full">
                    <div className="relative flex-1">
                        <Icons.Search className="w-5 h-5 absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input
                            type="text"
                            placeholder="Buscar por cliente ou pedido..."
                            className="w-full pl-12 pr-6 py-4 bg-white border-2 border-slate-100 rounded-[1.5rem] focus:border-blue-500/50 focus:ring-4 focus:ring-blue-500/5 transition-all outline-none font-bold text-sm shadow-sm"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
                {filtered.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 p-4">
                        {filtered.map(receivable => {
                            const status = calculateStatus(receivable.dueDate);
                            return (
                                <div key={receivable.id} className="bg-white border border-slate-100 rounded-[2rem] p-6 shadow-sm hover:shadow-xl transition-all group relative overflow-hidden">
                                    <div className={`absolute top-0 right-0 px-4 py-1.5 rounded-bl-2xl text-[8px] font-black uppercase text-white ${status.color}`}>
                                        {status.label}
                                    </div>

                                    <div className="flex items-center gap-4 mb-6">
                                        <div className="w-12 h-12 bg-slate-900 rounded-2xl flex items-center justify-center text-white font-black uppercase shadow-lg shadow-slate-200">
                                            {receivable.client.name.charAt(0)}
                                        </div>
                                        <div>
                                            <h4 className="font-black text-slate-800 uppercase text-xs truncate max-w-[150px]">{receivable.client.name}</h4>
                                            <p className="text-[9px] text-slate-400 font-bold uppercase tracking-widest">Pedido: #{receivable.orderId.split('-')[1] || receivable.orderId.substring(0, 8)}</p>
                                        </div>
                                    </div>

                                    <div className="space-y-4">
                                        <div className="bg-slate-50 p-4 rounded-2xl flex items-center justify-between">
                                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Valor em Aberto:</span>
                                            <span className="text-xl font-black text-slate-900">R$ {receivable.amount.toFixed(2)}</span>
                                        </div>

                                        <div className="flex justify-between items-center text-[10px] font-bold uppercase px-2">
                                            <div className="flex flex-col">
                                                <span className="text-slate-400">Desde:</span>
                                                <span className="text-slate-800">{new Date(receivable.createdAt).toLocaleDateString()}</span>
                                            </div>
                                            <div className="flex flex-col text-right">
                                                <span className="text-slate-400">Vencimento:</span>
                                                <span className={status.text}>{new Date(receivable.dueDate).toLocaleDateString()}</span>
                                            </div>
                                        </div>

                                        <button
                                            onClick={() => handleViewDetails(receivable.orderId)}
                                            className="w-full bg-slate-50 hover:bg-slate-100 text-slate-600 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all border border-slate-100 flex items-center justify-center gap-2"
                                        >
                                            <Icons.View className="w-4 h-4" />
                                            Ver Detalhes do Pedido
                                        </button>

                                        <div className="pt-2 flex gap-2">
                                            <button
                                                onClick={() => handleReceive(receivable)}
                                                className="flex-[2] bg-emerald-500 hover:bg-emerald-600 text-white py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-lg shadow-emerald-100 transition-all active:scale-95"
                                            >
                                                Receber
                                            </button>
                                            <button
                                                onClick={() => handleDelete(receivable.id)}
                                                className="flex-1 bg-slate-100 hover:bg-red-50 hover:text-red-500 text-slate-400 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all"
                                            >
                                                Excluir
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                ) : (
                    <div className="flex-1 flex flex-col items-center justify-center py-20 opacity-30">
                        <Icons.CRM className="w-20 h-20 mb-4" />
                        <p className="font-black uppercase tracking-widest text-sm">Nenhum recebível encontrado</p>
                    </div>
                )}
            </div>

            <CustomAlert
                isOpen={alertConfig.isOpen}
                title={alertConfig.title}
                message={alertConfig.message}
                type={alertConfig.type}
                onConfirm={alertConfig.onConfirm}
                onCancel={closeAlert}
            >
                {alertConfig.showPasswordInput && (
                    <div className="mt-4 animate-in fade-in slide-in-from-top-2">
                        <input
                            type="password"
                            placeholder="SENHA MASTER ADMIN"
                            className="w-full p-4 bg-slate-100 border-2 border-slate-200 rounded-2xl text-center font-black outline-none focus:border-red-500 transition-all placeholder:text-slate-300"
                            value={adminPassword}
                            onChange={e => setAdminPassword(e.target.value)}
                            autoFocus
                        />
                    </div>
                )}
            </CustomAlert>

            {/* Details Modal */}
            {isDetailsModalOpen && selectedOrder && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
                    <div className="bg-white rounded-[3rem] shadow-2xl p-10 w-full max-w-2xl border border-white/20 animate-in zoom-in duration-200 overflow-hidden flex flex-col max-h-[90vh]">
                        <div className="flex justify-between items-center mb-8">
                            <div>
                                <h4 className="text-2xl font-black text-slate-800 uppercase tracking-tighter">Detalhes do Pedido</h4>
                                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">Pedido ID: #{selectedOrder.id.split('-')[1] || selectedOrder.id.substring(0, 8)}</p>
                            </div>
                            <button onClick={() => setIsDetailsModalOpen(false)} className="p-4 bg-slate-50 text-slate-400 rounded-2xl hover:bg-slate-100 transition-all">
                                <Icons.Dashboard />
                            </button>
                        </div>

                        <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar">
                            <div className="space-y-3">
                                {selectedOrder.items.map((item: any, idx: number) => {
                                    const prod = availableProducts.find(p => p.id === item.productId);
                                    return (
                                        <div key={idx} className="flex justify-between items-center bg-slate-50 p-4 rounded-2xl border border-slate-100">
                                            <div className="flex items-center gap-4">
                                                <div className="w-8 h-8 rounded-lg bg-white flex items-center justify-center font-black text-xs text-slate-400">{item.quantity}x</div>
                                                <div>
                                                    <p className="text-xs font-black text-slate-800 uppercase tracking-tight">{prod?.name || 'Produto'}</p>
                                                    {item.observations && <p className="text-[8px] text-slate-400 font-bold uppercase">{item.observations}</p>}
                                                </div>
                                            </div>
                                            <span className="text-[10px] font-black text-slate-800 tracking-tight">R$ {(item.price * item.quantity).toFixed(2)}</span>
                                        </div>
                                    );
                                })}
                            </div>

                            <div className="mt-8 pt-8 border-t border-slate-100 space-y-2">
                                <div className="flex justify-between items-center text-slate-400 px-4">
                                    <span className="text-[10px] font-black uppercase tracking-widest">Subtotal:</span>
                                    <span className="text-sm font-bold tracking-tight">R$ {(selectedOrder.total - (selectedOrder.deliveryFee || 0)).toFixed(2)}</span>
                                </div>
                                {selectedOrder.deliveryFee > 0 && (
                                    <div className="flex justify-between items-center text-slate-400 px-4">
                                        <span className="text-[10px] font-black uppercase tracking-widest">Taxa de Entrega:</span>
                                        <span className="text-sm font-bold tracking-tight">R$ {selectedOrder.deliveryFee.toFixed(2)}</span>
                                    </div>
                                )}
                                <div className="flex justify-between items-center bg-slate-900 text-white p-6 rounded-[2rem] shadow-xl shadow-slate-200">
                                    <span className="text-xs font-black uppercase tracking-widest">Total do Fiado:</span>
                                    <span className="text-2xl font-black">R$ {selectedOrder.total.toFixed(2)}</span>
                                </div>
                            </div>
                        </div>

                        <div className="mt-8 flex gap-4">
                            <button
                                onClick={() => setIsDetailsModalOpen(false)}
                                className="flex-1 py-4 font-black uppercase text-[10px] tracking-widest text-slate-400 hover:bg-slate-50 rounded-2xl"
                            >
                                Fechar
                            </button>
                            <button
                                onClick={startEditingItems}
                                disabled={['OWN_DELIVERY', 'APP_DELIVERY'].includes(selectedOrder.type) && selectedOrder.status === 'DELIVERED'}
                                className={`flex-1 py-4 rounded-2xl font-black uppercase text-[10px] tracking-widest shadow-xl transition-all ${(['OWN_DELIVERY', 'APP_DELIVERY'].includes(selectedOrder.type) && selectedOrder.status === 'DELIVERED')
                                    ? 'bg-slate-100 text-slate-300 cursor-not-allowed'
                                    : 'bg-blue-600 text-white hover:bg-blue-700 shadow-blue-100'
                                    }`}
                            >
                                {(['OWN_DELIVERY', 'APP_DELIVERY'].includes(selectedOrder.type) && selectedOrder.status === 'DELIVERED') ? 'Delivery Não Editável' : 'Editar Itens'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Edit Items Modal */}
            {isEditItemsOpen && selectedOrder && (
                <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
                    <div className="bg-white rounded-[3rem] shadow-2xl p-10 w-full max-w-4xl border border-white/20 animate-in zoom-in duration-200 overflow-hidden flex flex-col h-[90vh]">
                        <div className="flex justify-between items-center mb-8 shrink-0">
                            <div>
                                <h4 className="text-2xl font-black text-slate-800 uppercase tracking-tighter">Editar Consumo</h4>
                                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">Ajuste os itens consumidos (Estoque e valor automático)</p>
                            </div>
                            <button onClick={() => setIsEditItemsOpen(false)} className="p-4 bg-slate-50 text-slate-400 rounded-2xl hover:bg-slate-100 transition-all">
                                <Icons.Dashboard />
                            </button>
                        </div>

                        <div className="flex gap-8 flex-1 min-h-0">
                            {/* Available Products */}
                            <div className="flex-1 flex flex-col gap-4">
                                <h5 className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-2">Adicionar Itens:</h5>
                                <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar space-y-2">
                                    {availableProducts.map(p => (
                                        <button
                                            key={p.id}
                                            onClick={() => addItem(p)}
                                            className="w-full flex justify-between items-center p-4 bg-slate-50 rounded-2xl hover:bg-blue-50 hover:border-blue-100 border border-transparent transition-all group"
                                        >
                                            <span className="text-[11px] font-black text-slate-700 uppercase tracking-tight text-left truncate pr-4">{p.name}</span>
                                            <span className="text-[10px] font-black text-blue-600">R$ {p.price.toFixed(2)}</span>
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Current Editing Basket */}
                            <div className="w-[400px] bg-slate-900 rounded-[2.5rem] p-8 flex flex-col">
                                <h5 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-6">Lista Atual:</h5>
                                <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar space-y-4">
                                    {editingItems.map(item => {
                                        const prod = availableProducts.find(p => p.id === item.productId);
                                        return (
                                            <div key={item.uid} className="flex flex-col gap-2 p-4 bg-white/5 rounded-2xl border border-white/10 group">
                                                <div className="flex justify-between items-start">
                                                    <span className="text-[10px] font-black text-white uppercase tracking-tight truncate pr-2">{prod?.name || 'Produto'}</span>
                                                    <button onClick={() => removeItem(item.uid)} className="p-1.5 bg-red-500/10 text-red-500 rounded-lg opacity-0 group-hover:opacity-100 transition-all">
                                                        <Icons.Delete className="w-3 h-3" />
                                                    </button>
                                                </div>
                                                <div className="flex justify-between items-center">
                                                    <div className="flex items-center gap-3">
                                                        <button onClick={() => updateItemQty(item.uid, -1)} className="w-8 h-8 rounded-lg bg-white/5 text-white flex items-center justify-center hover:bg-white/10 transition-all">-</button>
                                                        <span className="text-white font-black text-xs">{item.quantity}</span>
                                                        <button onClick={() => updateItemQty(item.uid, 1)} className="w-8 h-8 rounded-lg bg-white/5 text-white flex items-center justify-center hover:bg-white/10 transition-all">+</button>
                                                    </div>
                                                    <span className="text-[10px] font-black text-white tracking-widest">R$ {(item.price * item.quantity).toFixed(2)}</span>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>

                                <div className="mt-8 pt-6 border-t border-white/10 space-y-4">
                                    <div className="flex justify-between items-center">
                                        <span className="text-[10px] font-black text-white/40 uppercase tracking-widest">Novo Total do Fiado:</span>
                                        <span className="text-2xl font-black text-white">R$ {calculateTotal().toFixed(2)}</span>
                                    </div>
                                    <button
                                        onClick={handleUpdateItems}
                                        className="w-full py-5 bg-blue-600 text-white rounded-[1.5rem] font-black uppercase text-[10px] tracking-widest shadow-2xl shadow-blue-900/50 hover:bg-blue-500 transition-all active:scale-95"
                                    >
                                        Salvar Alterações
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Receivables;
