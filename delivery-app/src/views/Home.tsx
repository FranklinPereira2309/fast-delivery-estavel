import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { api } from '../services/api';
import type { Product, BusinessSettings } from '../types';
import { Icons } from '../constants';
import { useCart } from '../CartContext';

const Home: React.FC = () => {
    const { addToCart, items, total } = useCart();
    const navigate = useNavigate();
    const [products, setProducts] = useState<Product[]>([]);
    const [categories, setCategories] = useState<string[]>([]);
    const [selectedCategory, setSelectedCategory] = useState('Todos');
    const [settings, setSettings] = useState<BusinessSettings | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isClosingSoon, setIsClosingSoon] = useState(false);

    useEffect(() => {
        const init = async () => {
            try {
                const [p, s] = await Promise.all([
                    api.getProducts(),
                    api.getSettings()
                ]);
                setProducts(p);
                const cats = Array.from(new Set(p.map((prod: Product) => prod.category)));
                setCategories(['Todos', ...cats]);
                setSettings(s as any);

                // Check if closing soon (within 30 mins)
                if (s.operatingHours && !s.isManuallyClosed) {
                    try {
                        const hours = JSON.parse(s.operatingHours);
                        const now = new Date();
                        const day = now.getDay();
                        const config = hours.find((h: any) => h.dayOfWeek === day);

                        if (config && config.isOpen) {
                            const [closeH, closeM] = config.closeTime.split(':').map(Number);
                            const closeDate = new Date();
                            closeDate.setHours(closeH, closeM, 0);

                            const diffMs = closeDate.getTime() - now.getTime();
                            const diffMins = diffMs / (1000 * 60);

                            setIsClosingSoon(diffMins > 0 && diffMins <= 30);
                        }
                    } catch (e) {
                        console.error("Error parsing operating hours:", e);
                    }
                }
            } catch (e) {
                console.error(e);
            } finally {
                setIsLoading(false);
            }
        };
        init();
    }, []);

    const filteredProducts = selectedCategory === 'Todos'
        ? products
        : products.filter(p => p.category === selectedCategory);

    if (isLoading) return <div className="h-screen flex items-center justify-center font-bold text-slate-400">Carregando...</div>;

    if (settings && settings.enableDeliveryApp === false) {
        return (
            <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-8 text-center select-none">
                <div className="w-24 h-24 bg-rose-600 rounded-3xl flex items-center justify-center shadow-2xl shadow-rose-500/20 transform -rotate-12 mb-8 animate-bounce">
                    <span className="text-white text-4xl font-black">!</span>
                </div>
                <h1 className="text-3xl font-black text-white tracking-tighter uppercase mb-4">App Desativado</h1>
                <p className="text-slate-400 font-bold uppercase text-[10px] tracking-widest leading-relaxed max-w-xs">
                    Este aplicativo de pedidos online não está habilitado para este estabelecimento no momento.
                </p>
                <div className="mt-12 h-1 w-12 bg-rose-600 rounded-full"></div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-slate-50 pb-24">
            {/* Header / Store Status */}
            <div className="bg-white p-6 pb-8 rounded-b-[3rem] shadow-sm">
                <div className="flex justify-between items-start mb-6">
                    <div>
                        <h1 className="text-2xl font-black text-slate-800 tracking-tighter uppercase">Delivery Fast</h1>
                        <div className="flex items-center gap-2 mt-1">
                            <div className={`w-2 h-2 rounded-full ${settings?.isManuallyClosed ? 'bg-rose-500' : 'bg-emerald-500 animate-pulse'}`}></div>
                            <span className={`text-[10px] font-black uppercase tracking-widest ${settings?.isManuallyClosed ? 'text-rose-600' : 'text-emerald-600'}`}>
                                {settings?.isManuallyClosed ? 'Loja Fechada' : 'Loja Aberta'}
                            </span>
                        </div>
                    </div>
                    <Link to="/history" className="w-12 h-12 bg-slate-100 rounded-2xl flex items-center justify-center text-slate-600 hover:bg-slate-200 transition-all shadow-sm">
                        <Icons.Smartphone className="w-6 h-6" />
                    </Link>
                </div>

                {settings?.isManuallyClosed && (
                    <div className="bg-rose-500 text-white p-4 rounded-2xl mb-6 flex items-center gap-3 animate-bounce shadow-lg shadow-rose-200">
                        <div className="shrink-0 text-xl font-bold">🚫</div>
                        <p className="text-[10px] font-black uppercase tracking-widest leading-tight">Estamos fechados no momento. Não é possível realizar pedidos.</p>
                    </div>
                )}

                {isClosingSoon && !settings?.isManuallyClosed && (
                    <div className="bg-amber-500 text-white p-4 rounded-2xl mb-6 flex items-center gap-3 shadow-lg shadow-amber-200">
                        <div className="shrink-0 text-xl">🕒</div>
                        <p className="text-[10px] font-black uppercase tracking-widest leading-tight">Atenção: A loja fechará em menos de 30 minutos. Aproveite!</p>
                    </div>
                )}

                {/* Search */}
                <div className="relative">
                    <input
                        type="text"
                        placeholder="O que você quer comer hoje?"
                        className="w-full p-4 bg-slate-100 border-none rounded-2xl font-bold text-sm focus:ring-4 focus:ring-indigo-50 transition-all pl-12"
                    />
                    <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
                        {/* Search Icon */}
                    </div>
                </div>
            </div>

            {/* Categories */}
            <div className="flex gap-3 overflow-x-auto p-6 no-scrollbar">
                {categories.map(cat => (
                    <button
                        key={cat}
                        onClick={() => setSelectedCategory(cat)}
                        className={`px-6 py-3 rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all whitespace-nowrap shadow-sm ${selectedCategory === cat ? 'bg-indigo-600 text-white shadow-indigo-100' : 'bg-white text-slate-400'}`}
                    >
                        {cat}
                    </button>
                ))}
            </div>

            {/* Products Grid */}
            <div className="px-6 grid grid-cols-1 gap-4">
                {filteredProducts.map(product => (
                    <div key={product.id} className="bg-white p-4 rounded-3xl flex gap-4 shadow-sm border border-slate-100 items-center group active:scale-[0.98] transition-transform">
                        <div className="w-24 h-24 bg-slate-100 rounded-2xl overflow-hidden shrink-0">
                            {product.imageUrl && <img src={product.imageUrl} alt={product.name} className="w-full h-full object-cover" />}
                        </div>
                        <div className="flex-1">
                            <h3 className="font-bold text-slate-800 text-sm">{product.name}</h3>
                            <p className="text-[10px] text-slate-400 font-medium mt-1 line-clamp-2">{product.category}</p>
                            <div className="flex justify-between items-center mt-3">
                                <span className="text-lg font-black text-slate-800 tracking-tighter">R$ {product.price.toFixed(2)}</span>
                                <button
                                    onClick={() => addToCart(product)}
                                    className="w-10 h-10 bg-indigo-600 text-white rounded-xl flex items-center justify-center font-bold active:scale-90 transition-transform shadow-lg shadow-indigo-100"
                                >
                                    +
                                </button>
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            {/* Floating Cart Button */}
            {items.length > 0 && (
                <div className="fixed bottom-6 left-6 right-6 animate-in slide-in-from-bottom duration-300">
                    <button
                        onClick={() => navigate('/checkout')}
                        className="w-full bg-indigo-600 text-white p-5 rounded-3xl font-black uppercase text-[10px] tracking-widest shadow-2xl shadow-indigo-200 flex justify-between items-center active:scale-95 transition-transform"
                    >
                        <div className="flex items-center gap-3">
                            <div className="bg-indigo-500 w-6 h-6 rounded-lg text-[10px] flex items-center justify-center">{items.reduce((a, b) => a + b.quantity, 0)}</div>
                            <span>Ver Carrinho / Finalizar</span>
                        </div>
                        <span className="font-black">R$ {total.toFixed(2)}</span>
                    </button>
                </div>
            )}
        </div>
    );
};

export default Home;
