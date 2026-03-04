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
            <div className="bg-white p-6 pb-8 rounded-b-[3rem] shadow-sm flex items-center gap-4">
                <button onClick={() => navigate(-1)} className="p-3 bg-slate-100 rounded-2xl text-slate-600">
                    <Icons.ArrowLeft className="w-5 h-5" />
                </button>
                <div className="flex-1">
                    <h1 className="text-xl font-black text-slate-800 uppercase tracking-tighter">Finalizar Pedido</h1>
                </div>
                {items.length > 0 && (
                    <button
                        type="button"
                        onClick={() => {
                            if (window.confirm('Deseja esvaziar o carrinho?')) {
                                clearCart();
                                navigate('/');
                            }
                        }}
                        className="p-3 bg-rose-50 rounded-2xl text-rose-500 hover:bg-rose-100 transition-all"
                    >
                        <Icons.Trash className="w-5 h-5" />
                    </button>
                )}
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-8">
                {/* Items Summary */}
                <div className="space-y-4">
                    <h2 className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Resumo dos Itens</h2>
                    <div className="bg-white rounded-3xl p-6 border border-slate-100 space-y-3">
                        {items.map(item => (
                            <div key={item.product.id} className="flex justify-between items-center">
                                <span className="text-sm font-bold text-slate-700">
                                    <span className="text-indigo-600 mr-2">{item.quantity}x</span>
                                    {item.product.name}
                                </span>
                                <span className="text-sm font-black text-slate-800">R$ {(item.product.price * item.quantity).toFixed(2)}</span>
                            </div>
                        ))}
                        <div className="pt-3 border-t border-slate-100 space-y-2">
                            <div className="flex justify-between items-center">
                                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Subtotal</span>
                                <span className="text-xs font-bold text-slate-600">R$ {total.toFixed(2)}</span>
                            </div>
                            <div className="flex justify-between items-center">
                                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Frete</span>
                                <span className="text-xs font-bold text-slate-600">R$ {deliveryFee.toFixed(2)}</span>
                            </div>
                            <div className="flex justify-between items-center pt-2 border-t border-slate-50">
                                <span className="text-[10px] font-black text-indigo-400 uppercase tracking-widest">Total do Pedido</span>
                                <span className="text-xl font-black text-indigo-600 tracking-tighter">R$ {finalTotal.toFixed(2)}</span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Delivery Address */}
                <div className="space-y-4">
                    <h2 className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Endereço de Entrega</h2>
                    <textarea
                        required
                        className="w-full p-6 bg-white border border-slate-100 rounded-[2.5rem] focus:ring-4 focus:ring-indigo-50 transition-all font-bold text-sm"
                        placeholder="Rua, número, bairro e referências..."
                        rows={3}
                        value={address}
                        onChange={e => setAddress(e.target.value)}
                    />
                </div>

                {/* Payment Method */}
                <div className="space-y-4">
                    <h2 className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Forma de Pagamento</h2>
                    <div className="grid grid-cols-2 gap-3">
                        {[
                            { id: 'PIX', label: 'PIX' },
                            { id: 'CREDIT', label: 'Crédito' },
                            { id: 'DEBIT', label: 'Débito' },
                            { id: 'CASH', label: 'Dinheiro' }
                        ].map(method => (
                            <button
                                key={method.id}
                                type="button"
                                onClick={() => setPaymentMethod(method.id as any)}
                                className={`p-4 rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all border ${paymentMethod === method.id ? 'bg-indigo-600 text-white border-transparent' : 'bg-white text-slate-400 border-slate-100'}`}
                            >
                                {method.label}
                            </button>
                        ))}
                    </div>
                </div>

                <button
                    disabled={isLoading || items.length === 0}
                    type="submit"
                    className="w-full bg-indigo-600 text-white py-6 rounded-2xl font-black uppercase text-xs tracking-widest hover:bg-indigo-700 transition-all shadow-2xl shadow-indigo-100 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    {isLoading ? 'Processando...' : `Confirmar R$ ${finalTotal.toFixed(2)}`}
                </button>
            </form>
        </div>
    );
};

export default Checkout;
