import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCart } from '../CartContext';
import { api } from '../services/api';
import { socket } from '../services/socket';
import { Icons } from '../constants';
import { formatAddress } from '../services/formatUtils';
import CustomAlert from '../components/CustomAlert';
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

const Checkout: React.FC = () => {
    const { items, total, clearCart } = useCart();
    const [paymentMethod, setPaymentMethod] = useState<'PIX' | 'CREDIT' | 'DEBIT' | 'CASH'>('PIX');

    // Address UI State
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

    // Coupon State
    const [couponCode, setCouponCode] = useState('');
    const [appliedCoupon, setAppliedCoupon] = useState<any>(null);
    const [couponError, setCouponError] = useState('');
    const [isValidatingCoupon, setIsValidatingCoupon] = useState(false);

    const navigate = useNavigate();

    useEffect(() => {
        const init = async () => {
            try {
                // Fetch Client Address
                const clientStr = localStorage.getItem('delivery_app_client');
                if (clientStr) {
                    const client = JSON.parse(clientStr);

                    // Smart Address Extraction (Multi-fallback)
                    let initialAddress = client.address || '';
                    if (!initialAddress && client.addresses && client.addresses.length > 0) {
                        initialAddress = client.addresses[0];
                    }
                    if (!initialAddress && client.street) {
                        initialAddress = `${client.street}, ${client.addressNumber || ''}, ${client.neighborhood || ''}`;
                    }

                    if (initialAddress) {
                        setSavedAddress(initialAddress);
                    }
                }

                // Fetch Settings & Status
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
            if (newStatus.status === 'offline') {
                showAlert('Loja Fechada', 'O restaurante acabou de fechar. Você será redirecionado para o início.', 'INFO', () => {
                    navigate('/');
                });
            }
        });

        return () => {
            socket.off('store_status_changed');
        };
    }, [navigate]);

    const calculateDiscount = () => {
        if (!appliedCoupon) return 0;
        let discount = 0;
        if (appliedCoupon.type === 'FIXED') {
            discount = appliedCoupon.value || 0;
        } else if (appliedCoupon.type === 'PERCENTAGE') {
            discount = (total * (appliedCoupon.value || 0)) / 100;
            if (appliedCoupon.maxDiscount && discount > appliedCoupon.maxDiscount) {
                discount = appliedCoupon.maxDiscount;
            }
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
            setCouponCode(''); // Clear input on success
        } catch (err: any) {
            setCouponError(err.message || 'Cupom inválido');
            setAppliedCoupon(null);
        } finally {
            setIsValidatingCoupon(false);
        }
    };

    const handleRemoveCoupon = () => {
        setAppliedCoupon(null);
        setCouponError('');
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
            showAlert('Loja Fechada', 'O restaurante está fechado no momento e não está aceitando novos pedidos.', 'DANGER', () => {
                navigate('/');
            });
            return;
        }

        let finalAddress = savedAddress;

        if (useNewAddress) {
            if (!newAddress.street || !newAddress.number || !newAddress.neighborhood) {
                showAlert('Atenção', 'Por favor, preencha todos os campos obrigatórios do novo endereço.', 'DANGER');
                return;
            }
            finalAddress = formatAddress(newAddress);
        } else {
            if (!savedAddress) {
                showAlert('Atenção', 'Por favor, informe seu endereço.', 'DANGER');
                return;
            }
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

                    // Redireciona direto após o sucesso, mantendo apenas a tela verde de confirmação como interação prévia
                    clearCart();
                    navigate('/history');

                } catch (err: any) {
                    showAlert('Ops!', err.message, 'DANGER', () => {
                        clearCart();
                        navigate('/');
                    }, undefined, 'OK');
                } finally {
                    setIsLoading(false);
                }
            }
        );
    };

    return (
        <div className="min-h-screen bg-slate-50 dark:bg-slate-950 pb-12 transition-colors duration-500">
            <CustomAlert
                isOpen={alertState.isOpen}
                title={alertState.title}
                message={alertState.message}
                type={alertState.type}
                confirmText={alertState.confirmText}
                onConfirm={alertState.onConfirm}
                onCancel={alertState.onCancel === null ? undefined : (alertState.onCancel || (() => setAlertState(prev => ({ ...prev, isOpen: false }))))}
            />


            {/* Header Soft Clean */}
            <div className="bg-white dark:bg-slate-900 text-slate-800 dark:text-white p-6 pb-8 rounded-b-[3rem] shadow-sm border-b border-slate-100 dark:border-slate-800 flex items-center gap-4 sticky top-0 z-[60] overflow-hidden transition-colors duration-500">
                <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500 rounded-full mix-blend-multiply filter blur-3xl opacity-5 dark:opacity-10 animate-float"></div>

                <button onClick={() => navigate(-1)} className="p-3 bg-slate-50 dark:bg-slate-800 backdrop-blur-md rounded-2xl text-slate-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-slate-100 dark:hover:bg-slate-700 transition-all z-10 border border-slate-100 dark:border-slate-700">
                    <Icons.ArrowLeft className="w-5 h-5" />
                </button>
                <div className="flex-1 z-10">
                    <h1 className="text-xl font-black uppercase tracking-tighter">Finalizar Pedido</h1>
                </div>
                {
                    items.length > 0 && (
                        <button
                            type="button"
                            onClick={() => {
                                setAlertState({
                                    isOpen: true,
                                    title: 'Atenção',
                                    message: 'Deseja realmente remover todos os itens do carrinho?',
                                    type: 'INFO',
                                    onConfirm: () => {
                                        clearCart();
                                        navigate('/');
                                        setAlertState(p => ({ ...p, isOpen: false }));
                                    },
                                    onCancel: () => setAlertState(p => ({ ...p, isOpen: false }))
                                });
                            }}
                            className="p-3 bg-rose-50 dark:bg-rose-900/20 backdrop-blur-md rounded-2xl text-rose-500 dark:text-rose-400 hover:bg-rose-100 dark:hover:bg-rose-900/40 transition-all z-10 border border-rose-100 dark:border-rose-900/30"
                        >
                            <Icons.Trash className="w-5 h-5" />
                        </button>
                    )
                }
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-8 max-w-lg mx-auto">
                {/* Items Summary */}
                <div className="space-y-4">
                    <h2 className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest ml-2 flex items-center gap-2">
                        <Icons.ShoppingCart className="w-4 h-4 text-indigo-400 dark:text-indigo-500" /> Resumo do Pedido
                    </h2>
                    <div className="bg-white dark:bg-slate-900 rounded-[2rem] p-6 shadow-sm border border-slate-100 dark:border-slate-800 space-y-4 transition-colors">
                        {items.map(item => (
                            <div key={item.product.id} className="flex gap-4 items-center">
                                <div className="w-12 h-12 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 font-black rounded-xl flex items-center justify-center shrink-0 transition-colors">
                                    {item.quantity}x
                                </div>
                                <div className="flex-1">
                                    <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100 line-clamp-1">{item.product.name}</h3>
                                    <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 mt-0.5">R$ {item.product.price.toFixed(2)}/un</p>
                                </div>
                                <span className="text-sm font-black text-slate-800 dark:text-slate-100">R$ {(item.product.price * item.quantity).toFixed(2)}</span>
                            </div>
                        ))}

                        <div className="pt-4 border-t border-slate-100 dark:border-slate-800 space-y-3">
                            <div className="flex justify-between items-center text-slate-500 dark:text-slate-400">
                                <span className="text-[10px] font-black uppercase tracking-widest">Subtotal</span>
                                <span className="text-xs font-bold">R$ {total.toFixed(2)}</span>
                            </div>
                            <div className="flex justify-between items-center text-slate-500 dark:text-slate-400">
                                <span className="text-[10px] font-black uppercase tracking-widest">Taxa de Entrega</span>
                                <span className="text-xs font-bold">R$ {deliveryFee.toFixed(2)}</span>
                            </div>
                            {appliedCoupon && (
                                <div className="flex justify-between items-center text-emerald-600 dark:text-emerald-400">
                                    <span className="text-[10px] font-black uppercase tracking-widest flex items-center gap-1">
                                        <Icons.Ticket className="w-3 h-3" /> Cupom: {appliedCoupon.code}
                                    </span>
                                    <span className="text-xs font-bold">- R$ {discountValue.toFixed(2)}</span>
                                </div>
                            )}
                            <div className="flex justify-between items-center pt-3 border-t border-dashed border-slate-200 dark:border-slate-800">
                                <span className="text-[10px] font-black text-indigo-600 dark:text-indigo-400 uppercase tracking-widest">Total do Pedido</span>
                                <span className="text-2xl font-black text-indigo-600 dark:text-indigo-400 tracking-tighter">R$ {finalTotal.toFixed(2)}</span>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="space-y-4">
                    <h2 className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest ml-2 flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-blue-600"></span> Local de Entrega
                    </h2>

                    {savedAddress && (
                        <div className="flex items-center justify-between p-5 bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-[2rem] shadow-sm transition-all hover:border-indigo-100 dark:hover:border-indigo-900/50 group">
                            <div className="flex-1 pr-4 flex items-center gap-4">
                                <div className="w-12 h-12 bg-emerald-50 dark:bg-emerald-900/20 rounded-[1.25rem] flex items-center justify-center shrink-0 transition-colors">
                                    <Icons.Smartphone className="w-5 h-5 text-emerald-500 dark:text-emerald-400" />
                                </div>
                                <div className="overflow-hidden">
                                    <span className="text-[9px] font-black uppercase text-emerald-500 dark:text-emerald-400 tracking-[0.1em] block leading-none mb-1.5">Entregar em:</span>
                                    <p className="text-[13px] font-bold text-slate-800 dark:text-slate-200 leading-tight line-clamp-2">{savedAddress}</p>
                                </div>
                            </div>
                            <div className="flex flex-col gap-2">
                                <button
                                    type="button"
                                    onClick={() => setIsEditingSavedAddress(true)}
                                    className="text-[10px] font-black uppercase text-indigo-600 dark:text-indigo-400 tracking-widest px-6 py-3 bg-indigo-50 dark:bg-indigo-900/30 rounded-full hover:bg-indigo-100 dark:hover:bg-indigo-900/50 transition-all shrink-0 active:scale-95 shadow-sm shadow-indigo-100/50 dark:shadow-none"
                                >
                                    Alterar
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setUseNewAddress(true)}
                                    className="text-[9px] font-black uppercase text-slate-400 dark:text-slate-500 tracking-widest px-4 py-2 hover:text-indigo-500 dark:hover:text-indigo-400 transition-all"
                                >
                                    Novo local
                                </button>
                            </div>
                        </div>
                    )}

                    {isEditingSavedAddress && (
                        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 animate-in fade-in duration-300">
                            <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setIsEditingSavedAddress(false)}></div>

                            <div className="bg-slate-50 dark:bg-slate-900 w-full max-w-sm rounded-[2.5rem] p-8 shadow-2xl relative animate-in zoom-in-95 duration-300 border border-white dark:border-slate-800 transition-colors">
                                <button
                                    type="button"
                                    onClick={() => setIsEditingSavedAddress(false)}
                                    className="absolute top-6 right-6 w-10 h-10 bg-white dark:bg-slate-800 rounded-full flex items-center justify-center text-slate-400 dark:text-slate-500 hover:text-rose-500 transition-all shadow-sm border border-slate-100 dark:border-slate-700 active:scale-95"
                                >
                                    <Icons.X className="w-5 h-5" />
                                </button>

                                <div className="mb-6 px-2">
                                    <h3 className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em]">Editar Endereço</h3>
                                </div>

                                <div className="bg-white dark:bg-slate-800 rounded-[1.5rem] p-6 shadow-sm border border-slate-100 dark:border-slate-700 mb-8 transition-colors">
                                    <textarea
                                        required
                                        rows={4}
                                        autoFocus
                                        value={savedAddress}
                                        onChange={e => setSavedAddress(e.target.value)}
                                        className="w-full bg-white dark:bg-slate-800 font-bold text-slate-800 dark:text-slate-100 text-[15px] leading-relaxed outline-none resize-none placeholder:text-slate-300 dark:placeholder:text-slate-600"
                                        placeholder="Digite seu endereço completo..."
                                    />
                                </div>

                                <button
                                    type="button"
                                    onClick={() => setIsEditingSavedAddress(false)}
                                    className="w-full py-5 bg-indigo-600 dark:bg-indigo-500 text-white rounded-[1.5rem] font-black uppercase text-[12px] tracking-widest shadow-xl shadow-indigo-200 dark:shadow-none active:scale-95 transition-all"
                                >
                                    Confirmar Endereço
                                </button>
                            </div>
                        </div>
                    )}

                    {!savedAddress && !useNewAddress && (
                        <button
                            type="button"
                            onClick={() => setUseNewAddress(true)}
                            className="w-full p-5 bg-white dark:bg-slate-900 border border-dashed border-slate-200 dark:border-slate-800 rounded-[2rem] text-slate-400 dark:text-slate-500 font-bold text-sm hover:border-indigo-300 dark:hover:border-indigo-800 hover:text-indigo-500 dark:hover:text-indigo-400 transition-all flex items-center justify-center gap-2 group active:scale-[0.98]"
                        >
                            <Icons.Smartphone className="w-5 h-5 group-hover:scale-110 transition-transform" />
                            Cadastrar Endereço de Entrega
                        </button>
                    )}

                    {useNewAddress && (
                        <div className="p-6 bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-[2rem] shadow-sm space-y-4 animate-in fade-in slide-in-from-top-4 duration-300 transition-colors">
                            <div className="flex justify-between items-center mb-2">
                                <span className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">Informações de Entrega</span>
                                <button
                                    type="button"
                                    onClick={() => setUseNewAddress(false)}
                                    className="p-2 bg-slate-50 dark:bg-slate-800 text-slate-400 dark:text-slate-500 rounded-full hover:bg-rose-50 dark:hover:bg-rose-900/40 hover:text-rose-500 dark:hover:text-rose-400 transition-all"
                                    title="Fechar"
                                >
                                    <Icons.X className="w-4 h-4" />
                                </button>
                            </div>

                            <div className="relative">
                                <input
                                    type="text"
                                    placeholder="CEP (ex: 00.000-000)"
                                    maxLength={10}
                                    value={newAddress.cep}
                                    onChange={e => {
                                        const val = e.target.value.replace(/\D/g, '');
                                        let masked = val;
                                        if (val.length > 2) masked = `${val.slice(0, 2)}.${val.slice(2)}`;
                                        if (val.length > 5) masked = `${val.slice(0, 2)}.${val.slice(2, 5)}-${val.slice(5, 8)}`;
                                        setNewAddress({ ...newAddress, cep: masked });
                                    }}
                                    onBlur={handleCepBlur}
                                    className="w-full p-4 bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-2xl font-bold text-sm text-slate-600 dark:text-slate-100 focus:ring-4 focus:ring-indigo-50 dark:focus:ring-indigo-900/20 focus:border-indigo-100 dark:focus:border-indigo-800 transition-all placeholder:text-slate-400 dark:placeholder:text-slate-600 placeholder:font-bold"
                                />
                                {isFetchingCep && (
                                    <div className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin"></div>
                                )}
                            </div>

                            <input
                                type="text"
                                placeholder="Logradouro"
                                value={newAddress.street}
                                onChange={e => setNewAddress({ ...newAddress, street: e.target.value })}
                                className="w-full p-4 bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-2xl font-bold text-sm text-slate-600 dark:text-slate-100 focus:ring-4 focus:ring-indigo-50 dark:focus:ring-indigo-900/20 focus:border-indigo-100 dark:focus:border-indigo-800 transition-all placeholder:text-slate-400 dark:placeholder:text-slate-600 placeholder:font-bold"
                            />

                            <div className="grid grid-cols-2 gap-3">
                                <input
                                    type="text"
                                    placeholder="Número"
                                    value={newAddress.number}
                                    onChange={e => setNewAddress({ ...newAddress, number: e.target.value })}
                                    className="w-full p-4 bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-2xl font-bold text-sm text-slate-600 dark:text-slate-100 focus:ring-4 focus:ring-indigo-50 dark:focus:ring-indigo-900/20 focus:border-indigo-100 dark:focus:border-indigo-800 transition-all placeholder:text-slate-400 dark:placeholder:text-slate-600 placeholder:font-bold"
                                />
                                <input
                                    type="text"
                                    placeholder="Bairro"
                                    value={newAddress.neighborhood}
                                    onChange={e => setNewAddress({ ...newAddress, neighborhood: e.target.value })}
                                    className="w-full p-4 bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-2xl font-bold text-sm text-slate-600 dark:text-slate-100 focus:ring-4 focus:ring-indigo-50 dark:focus:ring-indigo-900/20 focus:border-indigo-100 dark:focus:border-indigo-800 transition-all placeholder:text-slate-400 dark:placeholder:text-slate-600 placeholder:font-bold"
                                />
                            </div>

                            <input
                                type="text"
                                placeholder="Complemento (Opcional)"
                                value={newAddress.complement}
                                onChange={e => setNewAddress({ ...newAddress, complement: e.target.value })}
                                className="w-full p-4 bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-2xl font-bold text-sm text-slate-600 dark:text-slate-100 focus:ring-4 focus:ring-indigo-50 dark:focus:ring-indigo-900/20 focus:border-indigo-100 dark:focus:border-indigo-800 transition-all placeholder:text-slate-400 dark:placeholder:text-slate-600 placeholder:font-bold"
                            />

                            <div className="pt-2">
                                <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Salvar Como</h3>
                                <div className="flex gap-2">
                                    {['Casa', 'Trabalho', 'Outro'].map(tag => (
                                        <button
                                            key={tag}
                                            type="button"
                                            onClick={() => setNewAddress({ ...newAddress, tag })}
                                            className={`px-5 py-2.5 rounded-full text-[10px] font-black uppercase tracking-widest transition-all border ${newAddress.tag === tag ? 'bg-indigo-500 dark:bg-indigo-600 text-white border-indigo-500 dark:border-indigo-600 shadow-sm shadow-indigo-100 dark:shadow-none' : 'bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800'}`}
                                        >
                                            {tag}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* Coupon Code Section */}
                <div className="space-y-4">
                    <h2 className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest ml-2 flex items-center gap-2">
                        <Icons.Ticket className="w-4 h-4 text-indigo-400 dark:text-indigo-500" /> Cupom de Desconto
                    </h2>
                    {appliedCoupon ? (
                        <div className="p-4 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-100 dark:border-emerald-900/40 rounded-[1.5rem] flex items-center justify-between animate-in fade-in zoom-in-95 duration-300 transition-colors">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 bg-emerald-500 dark:bg-emerald-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-emerald-500/20 dark:shadow-none">
                                    <Icons.Check className="w-5 h-5" />
                                </div>
                                <div>
                                    <p className="text-[9px] font-black text-emerald-600 dark:text-emerald-400 uppercase tracking-widest">Cupom Ativado</p>
                                    <p className="text-sm font-bold text-slate-800 dark:text-slate-100">{appliedCoupon.code}</p>
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={handleRemoveCoupon}
                                className="text-[10px] font-black uppercase text-rose-500 dark:text-rose-400 tracking-widest px-4 py-2 hover:bg-rose-50 dark:hover:bg-rose-900/40 rounded-full transition-all"
                            >
                                Remover
                            </button>
                        </div>
                    ) : (
                        <div className="space-y-2">
                            <div className="flex gap-2">
                                <div className="flex-1 relative">
                                    <input
                                        type="text"
                                        placeholder="Digite seu cupom..."
                                        value={couponCode}
                                        onChange={e => setCouponCode(e.target.value.toUpperCase())}
                                        className="w-full p-4 bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-[1.25rem] font-bold text-sm text-slate-600 dark:text-slate-100 focus:ring-4 focus:ring-indigo-50 dark:focus:ring-indigo-900/20 focus:border-indigo-100 dark:focus:border-indigo-800 transition-all placeholder:text-slate-300 dark:placeholder:text-slate-600"
                                    />
                                    {isValidatingCoupon && (
                                        <div className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin"></div>
                                    )}
                                </div>
                                <button
                                    type="button"
                                    onClick={handleApplyCoupon}
                                    disabled={!couponCode.trim() || isValidatingCoupon}
                                    className="px-6 bg-slate-800 dark:bg-slate-700 text-white rounded-[1.25rem] font-black uppercase text-[10px] tracking-widest hover:bg-slate-700 dark:hover:bg-slate-600 disabled:opacity-50 transition-all active:scale-95 whitespace-nowrap"
                                >
                                    Aplicar
                                </button>
                            </div>
                            {couponError && (
                                <p className="text-[10px] font-bold text-rose-500 ml-4 animate-in fade-in duration-300">{couponError}</p>
                            )}
                        </div>
                    )}
                </div>

                {/* Payment Method */}
                <div className="space-y-4">
                    <h2 className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest ml-2 flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-emerald-400"></span> Forma de Pagamento
                    </h2>
                    <div className="relative">
                        <select
                            value={paymentMethod}
                            onChange={e => setPaymentMethod(e.target.value as any)}
                            className="w-full p-5 bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-[2rem] font-black text-xs uppercase tracking-widest text-slate-600 dark:text-slate-300 shadow-sm appearance-none focus:ring-4 focus:ring-indigo-50 dark:focus:ring-indigo-900/20 focus:border-indigo-100 dark:focus:border-indigo-800 transition-all cursor-pointer outline-none"
                        >
                            <option value="PIX">PIX (Rápido)</option>
                            <option value="CREDIT">Cartão de Crédito</option>
                            <option value="DEBIT">Cartão de Débito</option>
                            <option value="CASH">Dinheiro</option>
                        </select>
                        <div className="absolute right-6 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400 dark:text-slate-500">
                            <Icons.ChevronDown className="w-5 h-5" />
                        </div>
                    </div>
                </div>

                <div className="pt-6 pb-8">
                    <button
                        disabled={isLoading || items.length === 0}
                        type="submit"
                        className="relative w-full overflow-hidden group bg-slate-800 dark:bg-indigo-600 text-white py-6 rounded-2xl font-black uppercase text-[11px] tracking-widest hover:bg-slate-700 dark:hover:bg-indigo-500 transition-all shadow-xl dark:shadow-none disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        <div className="absolute inset-0 w-full h-full bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full group-hover:animate-[shimmer_1.5s_infinite]"></div>
                        <span className="relative z-10 flex items-center justify-center gap-3">
                            {isLoading ? (
                                <>
                                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                                    Processando Pedido...
                                </>
                            ) : (
                                `Confirmar Pedido • R$ ${finalTotal.toFixed(2)}`
                            )}
                        </span>
                    </button>
                    <style>{`
                        @keyframes shimmer {
                            100% { transform: translateX(100%); }
                        }
                    `}</style>
                </div>
            </form>
        </div >
    );
};

export default Checkout;
