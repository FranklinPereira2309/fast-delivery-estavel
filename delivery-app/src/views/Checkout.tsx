import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCart } from '../CartContext';
import { api } from '../services/api';
import { Icons } from '../constants';

const Checkout: React.FC = () => {
    const { items, total, clearCart } = useCart();
    const [paymentMethod, setPaymentMethod] = useState<'PIX' | 'CREDIT' | 'DEBIT' | 'CASH'>('PIX');
    const [address, setAddress] = useState('');
    const [deliveryFee, setDeliveryFee] = useState(0);
    const [isLoading, setIsLoading] = useState(false);
    const navigate = useNavigate();

    useEffect(() => {
        const fetchSettings = async () => {
            try {
                const settings = await api.getSettings();
                const fee = parseFloat(settings.deliveryFee.replace('R$', '').replace(',', '.').trim()) || 0;
                setDeliveryFee(fee);
            } catch (err) {
                console.error('Error fetching settings:', err);
            }
        };
        fetchSettings();
    }, []);

    const finalTotal = total + deliveryFee;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (items.length === 0) return;
        if (!address) {
            alert('Por favor, informe seu endereço.');
            return;
        }

        setIsLoading(true);
        try {
            const orderData = {
                clientAddress: address,
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
            alert('Pedido realizado com sucesso!');
            clearCart();
            navigate('/');
        } catch (err: any) {
            alert('Erro ao realizar pedido: ' + err.message);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-slate-50 pb-12">
            {/* Adiciona fundo sutil com padrão se desejar ou apenas cor sólida premium */}
            <div className="bg-slate-900 text-white p-6 pb-8 rounded-b-[3rem] shadow-xl flex items-center gap-4 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-float"></div>
                <div className="absolute bottom-0 left-0 w-64 h-64 bg-rose-500 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-float" style={{ animationDelay: '2s' }}></div>

                <button onClick={() => navigate(-1)} className="p-3 bg-white/10 backdrop-blur-md rounded-2xl text-white hover:bg-white/20 transition-all z-10">
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
                                if (window.confirm('Deseja esvaziar o carrinho?')) {
                                    clearCart();
                                    navigate('/');
                                }
                            }}
                            className="p-3 bg-rose-500/20 backdrop-blur-md rounded-2xl text-rose-300 hover:bg-rose-500 hover:text-white transition-all z-10"
                        >
                            <Icons.Trash className="w-5 h-5" />
                        </button>
                    )
                }
            </div >

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

                {/* Delivery Address */}
                <div className="space-y-4">
                    <h2 className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2 flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-indigo-400"></span> Local de Entrega
                    </h2>
                    <textarea
                        required
                        className="w-full p-5 bg-white border border-slate-100 rounded-[2rem] focus:ring-4 focus:ring-indigo-50 focus:border-indigo-100 transition-all font-bold text-sm shadow-sm placeholder:text-slate-300 resize-none"
                        placeholder="Ex: Rua das Flores, 123, Bairro Centro. Complemento: Casa azul."
                        rows={3}
                        value={address}
                        onChange={e => setAddress(e.target.value)}
                    />
                </div>

                {/* Payment Method */}
                <div className="space-y-4">
                    <h2 className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2 flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-emerald-400"></span> Forma de Pagamento
                    </h2>
                    <div className="grid grid-cols-2 gap-3">
                        {[
                            { id: 'PIX', label: 'PIX', badge: 'Rápido' },
                            { id: 'CREDIT', label: 'Crédito', badge: null },
                            { id: 'DEBIT', label: 'Débito', badge: null },
                            { id: 'CASH', label: 'Dinheiro', badge: null }
                        ].map(method => (
                            <button
                                key={method.id}
                                type="button"
                                onClick={() => setPaymentMethod(method.id as any)}
                                className={`relative p-5 rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all border ${paymentMethod === method.id
                                    ? 'bg-indigo-600 text-white border-indigo-600 shadow-lg shadow-indigo-200 transform scale-[1.02]'
                                    : 'bg-white text-slate-500 border-slate-200 hover:border-indigo-300'}`}
                            >
                                {method.label}
                                {method.badge && (
                                    <span className={`absolute -top-2 -right-2 text-[8px] px-2 py-1 rounded-full ${paymentMethod === method.id ? 'bg-white text-indigo-600' : 'bg-emerald-100 text-emerald-600'}`}>
                                        {method.badge}
                                    </span>
                                )}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="pt-6 pb-8">
                    <button
                        disabled={isLoading || items.length === 0}
                        type="submit"
                        className="relative w-full overflow-hidden group bg-slate-900 text-white py-6 rounded-2xl font-black uppercase text-[11px] tracking-widest hover:bg-slate-800 transition-all shadow-xl disabled:opacity-50 disabled:cursor-not-allowed"
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
