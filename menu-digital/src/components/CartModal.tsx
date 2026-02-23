import React, { useState } from 'react';
import { CartItem } from '../types';
import { submitOrder } from '../api';

interface CartModalProps {
    isOpen: boolean;
    onClose: () => void;
    cart: CartItem[];
    tableNumber: string;
    updateQuantity: (id: string, qty: number) => void;
    clearCart: () => void;
    initialClientName?: string;
    onOrderSuccess?: () => void;
}

const CartModal: React.FC<CartModalProps> = ({ isOpen, onClose, cart, tableNumber, updateQuantity, clearCart, initialClientName, onOrderSuccess }) => {
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [observations, setObservations] = useState('');
    const [clientName, setClientName] = useState('');
    const [success, setSuccess] = useState(false);

    if (!isOpen) return null;

    const total = cart.reduce((acc, i) => acc + (i.price * i.quantity), 0);

    const handleSubmit = async () => {
        setIsSubmitting(true);

        const executeOrder = async (lat?: number, lng?: number) => {
            try {
                await submitOrder({
                    tableNumber: parseInt(tableNumber),
                    items: cart.map(i => ({ productId: i.id, quantity: i.quantity })),
                    observations,
                    clientName: initialClientName || clientName || undefined,
                    clientLat: lat,
                    clientLng: lng
                });
                setSuccess(true);
                setTimeout(() => {
                    setSuccess(false);
                    clearCart();
                    onClose();
                    setIsSubmitting(false);
                }, 3000);
            } catch (e: any) {
                console.error(e);
                alert(e.message || "Erro ao enviar o pedido.");
                setIsSubmitting(false);
            }
        };

        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                (position) => executeOrder(position.coords.latitude, position.coords.longitude),
                (error) => {
                    console.warn("Localização negada ou indisponível:", error);
                    executeOrder(); // Tenta sem localização, backend recusa se geofence for estrito
                },
                { timeout: 10000, enableHighAccuracy: true }
            );
        } else {
            executeOrder();
        }
    };

    if (success) {
        return (
            <div className="fixed inset-0 z-[100] bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-4">
                <div className="bg-white rounded-[2rem] w-full max-w-md p-8 text-center shadow-2xl animate-fade-in border border-emerald-100">
                    <div className="w-20 h-20 bg-emerald-500 rounded-full mx-auto flex items-center justify-center mb-6 shadow-lg shadow-emerald-500/30">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                        </svg>
                    </div>
                    <h2 className="text-2xl font-black text-slate-800 uppercase tracking-tighter mb-2">Pedido Enviado!</h2>
                    <p className="text-slate-500 text-sm font-bold">A cozinha já está preparando o seu pedido.</p>
                </div>
            </div>
        );
    }

    return (
        <div className="fixed inset-0 z-[100] bg-slate-900/60 backdrop-blur-sm flex flex-col justify-end">
            {/* Background click to close */}
            <div className="absolute inset-0" onClick={onClose} />

            <div className="bg-white rounded-t-[2rem] w-full max-w-md mx-auto relative flex flex-col max-h-[90vh] shadow-2xl animate-slide-up">
                {/* Header */}
                <div className="p-6 pb-4 border-b border-slate-100 flex justify-between items-center shrink-0">
                    <div>
                        <h2 className="text-xl font-black text-slate-900 uppercase tracking-tighter">Seu Pedido</h2>
                        <p className="text-[10px] font-bold text-slate-400 tracking-widest uppercase">Mesa {tableNumber}</p>
                    </div>
                    <button onClick={onClose} className="w-10 h-10 bg-slate-100 rounded-full flex items-center justify-center text-slate-500 hover:bg-slate-200 transition-all">
                        ✕
                    </button>
                </div>

                {/* Itens */}
                <div className="flex-1 overflow-y-auto p-4 space-y-3 hide-scrollbar">
                    {cart.length === 0 ? (
                        <p className="text-center text-slate-400 py-8 font-bold text-sm">Nenhum item adicionado.</p>
                    ) : (
                        cart.map(item => (
                            <div key={item.id} className="flex gap-4 p-4 bg-slate-50 rounded-2xl border border-slate-100 items-center">
                                <img src={item.imageUrl} alt={item.name} className="w-16 h-16 rounded-xl object-cover" />
                                <div className="flex-1 min-w-0">
                                    <h4 className="font-black text-slate-800 text-sm uppercase tracking-tighter truncate">{item.name}</h4>
                                    <p className="text-blue-600 font-black text-sm">R$ {item.price.toFixed(2)}</p>
                                </div>
                                <div className="flex items-center bg-white rounded-xl p-1 gap-2 shadow-sm border border-slate-100 shrink-0">
                                    <button onClick={() => updateQuantity(item.id, item.quantity - 1)} className="w-8 h-8 rounded-lg flex items-center justify-center font-black text-slate-400 active:scale-90">-</button>
                                    <span className="w-4 text-center font-black text-xs">{item.quantity}</span>
                                    <button onClick={() => updateQuantity(item.id, item.quantity + 1)} className="w-8 h-8 rounded-lg bg-slate-900 text-white flex items-center justify-center font-black active:scale-90">+</button>
                                </div>
                            </div>
                        ))
                    )}

                    {cart.length > 0 && (
                        <div className="mt-4 space-y-4">
                            {!initialClientName && (
                                <div>
                                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-2 px-2">Identificação (Opcional)</label>
                                    <input
                                        type="text"
                                        value={clientName}
                                        onChange={(e) => setClientName(e.target.value)}
                                        placeholder="Qual o seu nome?"
                                        className="w-full bg-slate-50 border border-slate-200 rounded-2xl p-4 text-sm font-bold text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-4 focus:ring-blue-50"
                                    />
                                </div>
                            )}
                            <div>
                                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-2 px-2">Observações (Opcional)</label>
                                <textarea
                                    value={observations}
                                    onChange={(e) => setObservations(e.target.value)}
                                    placeholder="Ex: Tirar cebola, ponto da carne..."
                                    className="w-full bg-slate-50 border border-slate-200 rounded-2xl p-4 text-sm font-bold text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-4 focus:ring-blue-50 resize-none h-24"
                                />
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer Acabamento */}
                <div className="p-6 bg-white border-t border-slate-100 shrink-0 space-y-4 rounded-t-3xl shadow-[0_-10px_40px_-15px_rgba(0,0,0,0.1)]">
                    <div className="flex justify-between items-center text-slate-800">
                        <span className="font-black text-sm uppercase tracking-widest">Total</span>
                        <span className="text-3xl font-black text-blue-600 tracking-tighter">R$ {total.toFixed(2)}</span>
                    </div>
                    <button
                        disabled={cart.length === 0 || isSubmitting}
                        onClick={handleSubmit}
                        className="w-full bg-blue-600 disabled:bg-slate-300 disabled:text-slate-500 text-white py-4 rounded-2xl font-black uppercase text-sm shadow-xl shadow-blue-500/30 hover:bg-blue-700 active:scale-[0.98] transition-all flex justify-center items-center gap-2"
                    >
                        {isSubmitting ? 'Enviando Pedido...' : 'Confirmar e Pedir'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default CartModal;
