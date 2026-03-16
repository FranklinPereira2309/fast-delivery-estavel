import React, { useState, useEffect } from 'react';
import { useCart } from '../CartContext';
import { api } from '../services/api';
import { socket } from '../services/socket';
import { Icons } from '../constants';
import { formatAddress } from '../services/formatUtils';
import CustomAlert from './CustomAlert';
import type { StoreStatus } from '../types';

interface AlertState {
    isOpen: boolean;
    title: string;
    message: string;
    type: 'INFO' | 'DANGER' | 'SUCCESS';
    onConfirm: () => void;
    onCancel?: (() => void) | null;
    confirmText?: string;
}

const CheckoutTab: React.FC<{ onOrderPlaced: () => void }> = ({ onOrderPlaced }) => {
    const { items, total, clearCart } = useCart();
    const [paymentMethod, setPaymentMethod] = useState<'PIX' | 'CREDIT' | 'DEBIT' | 'CASH'>('PIX');
    const [savedAddress, setSavedAddress] = useState('');
    const [useNewAddress, setUseNewAddress] = useState(false);
    const [isEditingSavedAddress, setIsEditingSavedAddress] = useState(false);
    const [newAddress, setNewAddress] = useState({
        cep: '', street: '', number: '', complement: '', neighborhood: '', tag: 'Casa'
    });
    const [deliveryFee, setDeliveryFee] = useState(0);
    const [isLoading, setIsLoading] = useState(false);
    const [isFetchingCep, setIsFetchingCep] = useState(false);
    const [storeStatus, setStoreStatus] = useState<StoreStatus | null>(null);
    const [alertState, setAlertState] = useState<AlertState>({
        isOpen: false, title: '', message: '', type: 'INFO', onConfirm: () => { }, onCancel: () => setAlertState(prev => ({ ...prev, isOpen: false }))
    });
    const [couponCode, setCouponCode] = useState('');
    const [appliedCoupon, setAppliedCoupon] = useState<any>(null);
    const [couponError, setCouponError] = useState('');
    const [isValidatingCoupon, setIsValidatingCoupon] = useState(false);

    useEffect(() => {
        const init = async () => {
            try {
                const clientStr = localStorage.getItem('delivery_app_client');
                if (clientStr) {
                    const client = JSON.parse(clientStr);
                    let initialAddress = client.address || '';
                    if (!initialAddress && client.addresses && client.addresses.length > 0) initialAddress = client.addresses[0];
                    if (!initialAddress && client.street) initialAddress = `${client.street}, ${client.addressNumber || ''}, ${client.neighborhood || ''}`;
                    if (initialAddress) setSavedAddress(initialAddress);
                }

                const [s, status] = await Promise.all([
                    api.getSettings(),
                    api.getStoreStatus()
                ]);
                const fee = parseFloat(s.deliveryFee.replace('R$', '').replace(',', '.').trim()) || 0;
                setDeliveryFee(fee);
                setStoreStatus(status as StoreStatus);
            } catch (err) {
                console.error('Error fetching settings or client:', err);
            }
        };
        init();
    }, []);

    useEffect(() => {
        socket.on('store_status_changed', (newStatus: StoreStatus) => {
            setStoreStatus(newStatus);
        });
        return () => {
            socket.off('store_status_changed');
        };
    }, []);

    const calculateDiscount = () => {
        if (!appliedCoupon) return 0;
        let discount = 0;
        if (appliedCoupon.type === 'FIXED') {
            discount = appliedCoupon.value || 0;
        } else if (appliedCoupon.type === 'PERCENTAGE') {
            discount = (total * (appliedCoupon.value || 0)) / 100;
            if (appliedCoupon.maxDiscount && discount > appliedCoupon.maxDiscount) discount = appliedCoupon.maxDiscount;
        } else if (appliedCoupon.type === 'FREE_SHIPPING') {
            discount = deliveryFee;
        }
        return discount;
    };

    const discountValue = calculateDiscount();
    const finalTotal = total + deliveryFee - discountValue;

    const handleApplyCoupon = async () => {
        if (!couponCode.trim()) return;
        setIsValidatingCoupon(true);
        setCouponError('');
        try {
            const coupon = await api.validateCoupon(couponCode, total);
            setAppliedCoupon(coupon);
            setCouponCode('');
        } catch (err: any) {
            setCouponError(err.message || 'Cupom inválido');
            setAppliedCoupon(null);
        } finally {
            setIsValidatingCoupon(false);
        }
    };

    const showAlert = (title: string, message: string, type: 'INFO' | 'SUCCESS' | 'DANGER' = 'INFO', onConfirm?: () => void, onCancel?: (() => void) | null, confirmText?: string) => {
        setAlertState({
            isOpen: true,
            title,
            message,
            type,
            onConfirm: () => {
                setAlertState(prev => ({ ...prev, isOpen: false }));
                if (onConfirm) onConfirm();
            },
            onCancel: onCancel === null ? null : (onCancel || (() => setAlertState(prev => ({ ...prev, isOpen: false })))),
            confirmText: confirmText
        });
    };

    const handleCepBlur = async () => {
        const cleanCep = newAddress.cep.replace(/\D/g, '');
        if (cleanCep.length !== 8) return;
        setIsFetchingCep(true);
        try {
            const res = await fetch(`https://viacep.com.br/ws/${cleanCep}/json/`);
            const data = await res.json();
            if (!data.erro) {
                setNewAddress(prev => ({
                    ...prev,
                    street: data.logradouro,
                    neighborhood: data.bairro
                }));
            }
        } catch (error) {
            console.error("Erro ao buscar CEP:", error);
        } finally {
            setIsFetchingCep(false);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (items.length === 0) return;

        if (storeStatus?.status === 'offline') {
            showAlert('Loja Fechada', 'O restaurante está fechado no momento e não está aceitando novos pedidos.', 'DANGER');
            return;
        }

        let finalAddress = savedAddress;
        if (useNewAddress) {
            if (!newAddress.street || !newAddress.number || !newAddress.neighborhood) {
                showAlert('Atenção', 'Por favor, preencha todos os campos obrigatórios do novo endereço.', 'DANGER');
                return;
            }
            finalAddress = formatAddress(newAddress);
        } else if (!savedAddress) {
            showAlert('Atenção', 'Por favor, informe seu endereço.', 'DANGER');
            return;
        }

        showAlert(
            'Finalizar Pedido',
            `Deseja enviar seu pedido no valor de R$ ${finalTotal.toFixed(2)}?`,
            'SUCCESS',
            async () => {
                setIsLoading(true);
                try {
                    const clientStr = localStorage.getItem('delivery_app_client');
                    const client = clientStr ? JSON.parse(clientStr) : null;

                    const orderData = {
                        clientId: client?.id || 'ANONYMOUS',
                        clientName: client?.name || 'Cliente App',
                        clientPhone: client?.phone || '',
                        clientEmail: client?.email || '',
                        clientAddress: finalAddress,
                        paymentMethod,
                        items: items.map(i => ({
                            productId: i.product.id,
                            quantity: i.quantity,
                            price: i.product.price
                        })),
                        total: finalTotal,
                        deliveryFee: deliveryFee,
                        couponCode: appliedCoupon?.code || null,
                        type: 'OWN_DELIVERY',
                        status: 'PENDING'
                    };

                    await api.createOrder(orderData);
                    clearCart();
                    onOrderPlaced();
                } catch (err: any) {
                    showAlert('Ops!', err.message, 'DANGER');
                } finally {
                    setIsLoading(false);
                }
            }
        );
    };

    if (items.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center py-20 px-6 text-center animate-in fade-in duration-500">
                <div className="w-24 h-24 bg-slate-100 rounded-[2.5rem] flex items-center justify-center text-slate-300 mb-6">
                    <Icons.ShoppingCart className="w-10 h-10" />
                </div>
                <h3 className="text-xl font-black text-slate-800 uppercase tracking-tighter mb-2">Seu carrinho está vazio</h3>
                <p className="text-slate-400 font-bold text-sm leading-relaxed max-w-[240px]">Explore nosso cardápio e adicione seus itens favoritos!</p>
            </div>
        );
    }

    return (
        <div className="animate-in fade-in slide-in-from-right-4 duration-500">
            <CustomAlert
                isOpen={alertState.isOpen}
                title={alertState.title}
                message={alertState.message}
                type={alertState.type}
                confirmText={alertState.confirmText}
                onConfirm={alertState.onConfirm}
                onCancel={alertState.onCancel === null ? undefined : (alertState.onCancel || (() => setAlertState(prev => ({ ...prev, isOpen: false }))))}
            />

            <form onSubmit={handleSubmit} className="p-6 space-y-8 max-w-lg mx-auto">
                {/* Resumo */}
                <div className="space-y-4">
                    <h2 className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2 flex items-center gap-2">
                        <Icons.ShoppingCart className="w-4 h-4 text-indigo-400" /> Resumo do Pedido
                    </h2>
                    <div className="bg-white rounded-[2rem] p-6 shadow-sm border border-slate-100 space-y-4">
                        {items.map(item => (
                            <div key={item.product.id} className="flex gap-4 items-center">
                                <div className="w-12 h-12 bg-indigo-50 text-indigo-600 font-black rounded-xl flex items-center justify-center shrink-0">{item.quantity}x</div>
                                <div className="flex-1">
                                    <h3 className="text-sm font-bold text-slate-800 line-clamp-1">{item.product.name}</h3>
                                    <p className="text-[10px] font-bold text-slate-400 mt-0.5">R$ {item.product.price.toFixed(2)}/un</p>
                                </div>
                                <span className="text-sm font-black text-slate-800">R$ {(item.product.price * item.quantity).toFixed(2)}</span>
                            </div>
                        ))}
                        <div className="pt-4 border-t border-slate-100 space-y-3">
                            <div className="flex justify-between items-center text-slate-500">
                                <span className="text-[10px] font-black uppercase tracking-widest">Subtotal</span>
                                <span className="text-xs font-bold">R$ {total.toFixed(2)}</span>
                            </div>
                            <div className="flex justify-between items-center text-slate-500">
                                <span className="text-[10px] font-black uppercase tracking-widest">Taxa de Entrega</span>
                                <span className="text-xs font-bold">R$ {deliveryFee.toFixed(2)}</span>
                            </div>
                            {appliedCoupon && (
                                <div className="flex justify-between items-center text-emerald-600">
                                    <span className="text-[10px] font-black uppercase tracking-widest flex items-center gap-1 font-bold">
                                        <Icons.Ticket className="w-3 h-3" /> Cupom: {appliedCoupon.code}
                                    </span>
                                    <span className="text-xs font-bold">- R$ {discountValue.toFixed(2)}</span>
                                </div>
                            )}
                            <div className="flex justify-between items-center pt-3 border-t border-dashed border-slate-200">
                                <span className="text-[10px] font-black text-indigo-600 uppercase tracking-widest">Total do Pedido</span>
                                <span className="text-2xl font-black text-indigo-600 tracking-tighter">R$ {finalTotal.toFixed(2)}</span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Cupom */}
                {!appliedCoupon && (
                    <div className="space-y-4">
                        <h2 className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2 flex items-center gap-2">
                            <Icons.Ticket className="w-4 h-4 text-indigo-400" /> Cupom de Desconto
                        </h2>
                        <div className="flex gap-2">
                            <div className="flex-1 relative">
                                <input
                                    type="text"
                                    placeholder="Digite seu cupom..."
                                    value={couponCode}
                                    onChange={e => setCouponCode(e.target.value.toUpperCase())}
                                    className="w-full p-4 bg-white border border-slate-100 rounded-[1.25rem] font-bold text-sm text-slate-600 focus:ring-4 focus:ring-indigo-50 focus:border-indigo-100 transition-all placeholder:text-slate-300"
                                />
                                {isValidatingCoupon && <div className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin"></div>}
                            </div>
                            <button
                                type="button"
                                onClick={handleApplyCoupon}
                                disabled={!couponCode.trim() || isValidatingCoupon}
                                className="px-6 bg-slate-800 text-white rounded-[1.25rem] font-black uppercase text-[10px] tracking-widest hover:bg-slate-700 disabled:opacity-50 transition-all active:scale-95 whitespace-nowrap"
                            >
                                Aplicar
                            </button>
                        </div>
                        {couponError && <p className="text-[10px] font-bold text-rose-500 ml-4 animate-in fade-in duration-300">{couponError}</p>}
                    </div>
                )}

                {/* Endereço */}
                <div className="space-y-4">
                    <h2 className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2 flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-blue-600"></span> Local de Entrega
                    </h2>
                    {savedAddress && !useNewAddress && (
                        <div className="flex items-center justify-between p-5 bg-white border border-slate-100 rounded-[2rem] shadow-sm transition-all hover:border-indigo-100 group">
                            <div className="flex-1 pr-4 flex items-center gap-4">
                                <div className="w-12 h-12 bg-emerald-50 rounded-[1.25rem] flex items-center justify-center shrink-0">
                                    <Icons.Smartphone className="w-5 h-5 text-emerald-500" />
                                </div>
                                <div className="overflow-hidden">
                                    <span className="text-[9px] font-black uppercase text-emerald-500 tracking-[0.1em] block leading-none mb-1.5">Entregar em:</span>
                                    <p className="text-[13px] font-bold text-slate-800 leading-tight">{savedAddress}</p>
                                </div>
                            </div>
                            <div className="flex flex-col gap-2">
                                <button type="button" onClick={() => setIsEditingSavedAddress(true)} className="text-[10px] font-black uppercase text-indigo-600 tracking-widest px-6 py-3 bg-indigo-50 rounded-full hover:bg-indigo-100 transition-all shrink-0 active:scale-95 shadow-sm">Alterar</button>
                                <button type="button" onClick={() => setUseNewAddress(true)} className="text-[9px] font-black uppercase text-slate-400 tracking-widest px-4 py-2 hover:text-indigo-500 transition-all">Novo local</button>
                            </div>
                        </div>
                    )}
                    {useNewAddress && (
                         <div className="p-6 bg-white border border-slate-100 rounded-[2rem] shadow-sm space-y-4 animate-in fade-in slide-in-from-top-4 duration-300">
                             <div className="flex justify-between items-center mb-2">
                                 <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Informações de Entrega</span>
                                 <button type="button" onClick={() => setUseNewAddress(false)} className="p-2 bg-slate-50 text-slate-400 rounded-full hover:bg-rose-50 hover:text-rose-500 transition-all"><Icons.X className="w-4 h-4" /></button>
                             </div>
                             <div className="relative">
                                 <input type="text" placeholder="CEP" maxLength={10} value={newAddress.cep} onChange={e => {
                                     const val = e.target.value.replace(/\D/g, '');
                                     let masked = val;
                                     if (val.length > 2) masked = `${val.slice(0, 2)}.${val.slice(2)}`;
                                     if (val.length > 5) masked = `${val.slice(0, 2)}.${val.slice(2, 5)}-${val.slice(5, 8)}`;
                                     setNewAddress({ ...newAddress, cep: masked });
                                 }} onBlur={handleCepBlur} className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl font-bold text-sm text-slate-600 outline-none" />
                                 {isFetchingCep && <div className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin"></div>}
                             </div>
                             <input type="text" placeholder="Logradouro" value={newAddress.street} onChange={e => setNewAddress({ ...newAddress, street: e.target.value })} className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl font-bold text-sm text-slate-600 outline-none" />
                             <div className="grid grid-cols-2 gap-3">
                                 <input type="text" placeholder="Número" value={newAddress.number} onChange={e => setNewAddress({ ...newAddress, number: e.target.value })} className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl font-bold text-sm text-slate-600 outline-none" />
                                 <input type="text" placeholder="Bairro" value={newAddress.neighborhood} onChange={e => setNewAddress({ ...newAddress, neighborhood: e.target.value })} className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl font-bold text-sm text-slate-600 outline-none" />
                             </div>
                             <input type="text" placeholder="Complemento" value={newAddress.complement} onChange={e => setNewAddress({ ...newAddress, complement: e.target.value })} className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl font-bold text-sm text-slate-600 outline-none" />
                         </div>
                    )}
                </div>

                {/* Pagamento */}
                <div className="space-y-4">
                    <h2 className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2 flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-emerald-400"></span> Forma de Pagamento
                    </h2>
                    <div className="relative">
                        <select
                            value={paymentMethod}
                            onChange={e => setPaymentMethod(e.target.value as any)}
                            className="w-full p-5 bg-white border border-slate-100 rounded-[2rem] font-black text-xs uppercase tracking-widest text-slate-600 shadow-sm appearance-none focus:ring-4 focus:ring-indigo-50 focus:border-indigo-100 transition-all outline-none"
                        >
                            <option value="PIX">PIX (Rápido)</option>
                            <option value="CREDIT">Cartão de Crédito</option>
                            <option value="DEBIT">Cartão de Débito</option>
                            <option value="CASH">Dinheiro</option>
                        </select>
                        <div className="absolute right-6 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400"><Icons.ChevronDown className="w-5 h-5" /></div>
                    </div>
                </div>

                {/* Botão Confirmar */}
                <button
                    disabled={isLoading}
                    type="submit"
                    className="relative w-full overflow-hidden group bg-slate-800 text-white py-6 rounded-2xl font-black uppercase text-[11px] tracking-widest hover:bg-slate-700 transition-all shadow-xl disabled:opacity-50"
                >
                    <span className="relative z-10 flex items-center justify-center gap-3">
                        {isLoading ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div> : `Confirmar Pedido • R$ ${finalTotal.toFixed(2)}`}
                    </span>
                </button>
            </form>

            {isEditingSavedAddress && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 animate-in fade-in duration-300">
                    <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setIsEditingSavedAddress(false)}></div>
                    <div className="bg-slate-50 w-full max-w-sm rounded-[2.5rem] p-8 shadow-2xl relative animate-in zoom-in-95 duration-300 border border-white">
                        <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-4">Editar Endereço</h3>
                        <div className="bg-white rounded-[1.5rem] p-6 shadow-sm border border-slate-100 mb-6">
                            <textarea
                                value={savedAddress}
                                onChange={e => setSavedAddress(e.target.value)}
                                className="w-full font-bold text-slate-800 text-[15px] outline-none resize-none"
                                rows={4}
                            />
                        </div>
                        <button onClick={() => setIsEditingSavedAddress(false)} className="w-full py-5 bg-indigo-600 text-white rounded-[1.5rem] font-black uppercase text-[12px] tracking-widest shadow-xl active:scale-95 transition-all">Confirmar</button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default CheckoutTab;
