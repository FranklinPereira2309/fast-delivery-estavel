import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCart } from '../CartContext';
import { api } from '../services/api';
import { Icons } from '../constants';
import CustomAlert from '../components/CustomAlert';

interface AlertState {
    isOpen: boolean;
    title: string;
    message: string;
    type: 'INFO' | 'DANGER' | 'SUCCESS';
    onConfirm: () => void;
}

const Checkout: React.FC = () => {
    const { items, total, clearCart } = useCart();
    const [paymentMethod, setPaymentMethod] = useState<'PIX' | 'CREDIT' | 'DEBIT' | 'CASH'>('PIX');

    // Address UI State
    const [savedAddress, setSavedAddress] = useState('');
    const [useNewAddress, setUseNewAddress] = useState(false);

    const [newAddress, setNewAddress] = useState({
        cep: '', street: '', number: '', complement: '', neighborhood: '', tag: 'Casa'
    });

    const [deliveryFee, setDeliveryFee] = useState(0);
    const [isLoading, setIsLoading] = useState(false);
    const [isFetchingCep, setIsFetchingCep] = useState(false);

    const [alertState, setAlertState] = useState<AlertState>({
        isOpen: false, title: '', message: '', type: 'INFO', onConfirm: () => { }
    });

    const navigate = useNavigate();

    useEffect(() => {
        const init = async () => {
            try {
                // Fetch Client Address
                const clientStr = localStorage.getItem('delivery_app_client');
                if (clientStr) {
                    const client = JSON.parse(clientStr);
                    if (client.addresses && client.addresses.length > 0) {
                        setSavedAddress(client.addresses[0]);
                    } else {
                        setUseNewAddress(true); // Se não houver, força preencher novo endereço
                    }
                } else {
                    setUseNewAddress(true);
                }

                // Fetch Settings
                const settings = await api.getSettings();
                const fee = parseFloat(settings.deliveryFee.replace('R$', '').replace(',', '.').trim()) || 0;
                setDeliveryFee(fee);
            } catch (err) {
                console.error('Error fetching settings or client:', err);
            }
        };
        init();
    }, []);

    const finalTotal = total + deliveryFee;

    const showAlert = (title: string, message: string, type: 'INFO' | 'SUCCESS' | 'DANGER' = 'INFO', onConfirm?: () => void) => {
        setAlertState({
            isOpen: true,
            title,
            message,
            type,
            onConfirm: () => {
                setAlertState(prev => ({ ...prev, isOpen: false }));
                if (onConfirm) onConfirm();
            }
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

        let finalAddress = savedAddress;

        if (useNewAddress) {
            if (!newAddress.street || !newAddress.number || !newAddress.neighborhood) {
                showAlert('Atenção', 'Por favor, preencha todos os campos obrigatórios do novo endereço.', 'DANGER');
                return;
            }
            finalAddress = `${newAddress.street}, ${newAddress.number}, ${newAddress.neighborhood} - ${newAddress.complement ? `Comp: ${newAddress.complement}` : ''} [${newAddress.tag}]`;
        } else {
            if (!savedAddress) {
                showAlert('Atenção', 'Por favor, informe seu endereço.', 'DANGER');
                return;
            }
        }

        setIsLoading(true);
        try {
            const orderData = {
                clientAddress: finalAddress,
                paymentMethod,
                items: items.map(i => ({
                    productId: i.product.id,
                    quantity: i.quantity,
                    price: i.product.price
                })),
                total,
                type: 'OWN_DELIVERY',
                status: 'PENDING'
            };

            await api.createOrder(orderData);

            showAlert('Sucesso', 'Seu pedido foi realizado com sucesso e logo entrará em preparação!', 'SUCCESS', () => {
                clearCart();
                navigate('/');
            });

        } catch (err: any) {
            showAlert('Ops!', 'Erro ao realizar o pedido: ' + err.message, 'DANGER');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-slate-50 pb-12">
            <CustomAlert
                isOpen={alertState.isOpen}
                title={alertState.title}
                message={alertState.message}
                type={alertState.type}
                onConfirm={alertState.onConfirm}
                onCancel={() => setAlertState(prev => ({ ...prev, isOpen: false }))}
            />

            {/* Header Soft Clean */}
            <div className="bg-white text-slate-800 p-6 pb-8 rounded-b-[3rem] shadow-sm border-b border-slate-100 flex items-center gap-4 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500 rounded-full mix-blend-multiply filter blur-3xl opacity-5 animate-float"></div>

                <button onClick={() => navigate(-1)} className="p-3 bg-slate-50 backdrop-blur-md rounded-2xl text-slate-500 hover:text-indigo-600 hover:bg-slate-100 transition-all z-10 border border-slate-100">
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
                                    }
                                });
                            }}
                            className="p-3 bg-rose-50 backdrop-blur-md rounded-2xl text-rose-500 hover:bg-rose-100 transition-all z-10 border border-rose-100"
                        >
                            <Icons.Trash className="w-5 h-5" />
                        </button>
                    )
                }
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-8 max-w-lg mx-auto">
                {/* Items Summary */}
                <div className="space-y-4">
                    <h2 className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2 flex items-center gap-2">
                        <Icons.ShoppingCart className="w-4 h-4 text-indigo-400" /> Resumo do Pedido
                    </h2>
                    <div className="bg-white rounded-[2rem] p-6 shadow-sm border border-slate-100 space-y-4">
                        {items.map(item => (
                            <div key={item.product.id} className="flex gap-4 items-center">
                                <div className="w-12 h-12 bg-indigo-50 text-indigo-600 font-black rounded-xl flex items-center justify-center shrink-0">
                                    {item.quantity}x
                                </div>
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
                            <div className="flex justify-between items-center pt-3 border-t border-dashed border-slate-200">
                                <span className="text-[10px] font-black text-indigo-600 uppercase tracking-widest">Total do Pedido</span>
                                <span className="text-2xl font-black text-indigo-600 tracking-tighter">R$ {finalTotal.toFixed(2)}</span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Delivery Address Hub */}
                <div className="space-y-4">
                    <h2 className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2 flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-indigo-400"></span> Local de Entrega
                    </h2>

                    {savedAddress && (
                        <div className={`flex items-center justify-between p-4 bg-white border border-slate-100 rounded-[2rem] shadow-sm transition-all ${useNewAddress ? 'opacity-50 grayscale' : ''}`}>
                            <div className="flex-1 pr-4">
                                <span className="text-[9px] font-black uppercase text-emerald-500 tracking-widest block mb-1">CADASTRADO</span>
                                <p className="text-xs font-bold text-slate-700 leading-snug line-clamp-2">{savedAddress}</p>
                            </div>
                            {!useNewAddress && (
                                <button
                                    type="button"
                                    onClick={() => setUseNewAddress(true)}
                                    className="text-[9px] font-black uppercase text-indigo-500 tracking-widest px-4 py-2 bg-indigo-50 rounded-full hover:bg-indigo-100 transition-all shrink-0"
                                >
                                    Novo Endereço
                                </button>
                            )}
                        </div>
                    )}

                    {!savedAddress && !useNewAddress && (
                        <button
                            type="button"
                            onClick={() => setUseNewAddress(true)}
                            className="w-full p-6 bg-white border border-dashed border-slate-200 rounded-[2rem] text-slate-400 font-bold text-sm hover:border-indigo-300 hover:text-indigo-500 transition-all flex items-center justify-center gap-2"
                        >
                            <Icons.Smartphone className="w-5 h-5" />
                            Cadastrar Endereço de Entrega
                        </button>
                    )}

                    {useNewAddress && (
                        <div className="p-6 bg-white border border-slate-100 rounded-[2rem] shadow-sm space-y-4 animate-in fade-in slide-in-from-top-4 duration-300">
                            <div className="flex justify-between items-center mb-2">
                                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Informações de Entrega</span>
                                <button
                                    type="button"
                                    onClick={() => setUseNewAddress(false)}
                                    className="p-2 bg-slate-50 text-slate-400 rounded-full hover:bg-rose-50 hover:text-rose-500 transition-all"
                                    title="Fechar"
                                >
                                    <Icons.X className="w-4 h-4" />
                                </button>
                            </div>

                            <div className="relative">
                                <input
                                    type="text"
                                    placeholder="CEP (somente números)"
                                    maxLength={8}
                                    value={newAddress.cep}
                                    onChange={e => setNewAddress({ ...newAddress, cep: e.target.value.replace(/\D/g, '') })}
                                    onBlur={handleCepBlur}
                                    className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl font-bold text-sm text-slate-600 focus:ring-4 focus:ring-indigo-50 focus:border-indigo-100 transition-all placeholder:text-slate-400 placeholder:font-bold"
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
                                className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl font-bold text-sm text-slate-600 focus:ring-4 focus:ring-indigo-50 focus:border-indigo-100 transition-all placeholder:text-slate-400 placeholder:font-bold"
                            />

                            <div className="grid grid-cols-2 gap-3">
                                <input
                                    type="text"
                                    placeholder="Número"
                                    value={newAddress.number}
                                    onChange={e => setNewAddress({ ...newAddress, number: e.target.value })}
                                    className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl font-bold text-sm text-slate-600 focus:ring-4 focus:ring-indigo-50 focus:border-indigo-100 transition-all placeholder:text-slate-400 placeholder:font-bold"
                                />
                                <input
                                    type="text"
                                    placeholder="Bairro"
                                    value={newAddress.neighborhood}
                                    onChange={e => setNewAddress({ ...newAddress, neighborhood: e.target.value })}
                                    className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl font-bold text-sm text-slate-600 focus:ring-4 focus:ring-indigo-50 focus:border-indigo-100 transition-all placeholder:text-slate-400 placeholder:font-bold"
                                />
                            </div>

                            <input
                                type="text"
                                placeholder="Complemento (Opcional)"
                                value={newAddress.complement}
                                onChange={e => setNewAddress({ ...newAddress, complement: e.target.value })}
                                className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl font-bold text-sm text-slate-600 focus:ring-4 focus:ring-indigo-50 focus:border-indigo-100 transition-all placeholder:text-slate-400 placeholder:font-bold"
                            />

                            <div className="pt-2">
                                <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Salvar Como</h3>
                                <div className="flex gap-2">
                                    {['Casa', 'Trabalho', 'Outro'].map(tag => (
                                        <button
                                            key={tag}
                                            type="button"
                                            onClick={() => setNewAddress({ ...newAddress, tag })}
                                            className={`px-5 py-2.5 rounded-full text-[10px] font-black uppercase tracking-widest transition-all border ${newAddress.tag === tag ? 'bg-indigo-500 text-white border-indigo-500 shadow-sm shadow-indigo-100' : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'}`}
                                        >
                                            {tag}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* Payment Method */}
                <div className="space-y-4">
                    <h2 className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2 flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-emerald-400"></span> Forma de Pagamento
                    </h2>
                    <div className="relative">
                        <select
                            value={paymentMethod}
                            onChange={e => setPaymentMethod(e.target.value as any)}
                            className="w-full p-5 bg-white border border-slate-100 rounded-[2rem] font-black text-xs uppercase tracking-widest text-slate-600 shadow-sm appearance-none focus:ring-4 focus:ring-indigo-50 focus:border-indigo-100 transition-all cursor-pointer outline-none"
                        >
                            <option value="PIX">PIX (Rápido)</option>
                            <option value="CREDIT">Cartão de Crédito</option>
                            <option value="DEBIT">Cartão de Débito</option>
                            <option value="CASH">Dinheiro</option>
                        </select>
                        <div className="absolute right-6 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
                            <Icons.ChevronDown className="w-5 h-5" />
                        </div>
                    </div>
                </div>

                <div className="pt-6 pb-8">
                    <button
                        disabled={isLoading || items.length === 0}
                        type="submit"
                        className="relative w-full overflow-hidden group bg-slate-800 text-white py-6 rounded-2xl font-black uppercase text-[11px] tracking-widest hover:bg-slate-700 transition-all shadow-xl disabled:opacity-50 disabled:cursor-not-allowed"
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
