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
    const [isLoggedIn, setIsLoggedIn] = useState(false);

    useEffect(() => {
        const client = localStorage.getItem('delivery_app_client');
        setIsLoggedIn(!!client);
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

    if (isLoading) return (
        <div className="h-screen bg-slate-900 flex flex-col items-center justify-center">
            <div className="w-16 h-16 border-4 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin mb-4"></div>
            <div className="font-black text-white uppercase tracking-widest text-[10px] animate-pulse">Carregando Cardápio...</div>
        </div>
    );

    if (settings && settings.enableDeliveryApp === false) {
        return (
            <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-8 text-center select-none relative overflow-hidden">
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-rose-500 rounded-full mix-blend-multiply filter blur-3xl opacity-20"></div>
                <div className="w-24 h-24 bg-rose-600 rounded-[2rem] flex items-center justify-center shadow-2xl shadow-rose-500/20 transform -rotate-12 mb-8 animate-float relative z-10 border-4 border-rose-500/30">
                    <span className="text-white text-4xl font-black">!</span>
                </div>
                <h1 className="text-3xl font-black text-white tracking-tighter uppercase mb-4 relative z-10">App Desativado</h1>
                <p className="text-slate-400 font-bold uppercase text-[10px] tracking-widest leading-relaxed max-w-xs relative z-10">
                    Este aplicativo de pedidos online não está habilitado para este estabelecimento no momento.
                </p>
                <div className="mt-12 h-1 w-12 bg-rose-600/50 rounded-full"></div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-slate-50 pb-28">
            {/* Header / Store Status Premium */}
            <div className="bg-slate-900 pt-8 p-6 pb-12 rounded-b-[3rem] shadow-xl relative overflow-hidden">
                <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500 rounded-full mix-blend-multiply filter blur-3xl opacity-30 animate-float"></div>
                <div className="absolute bottom-0 left-0 w-64 h-64 bg-rose-500 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-float" style={{ animationDelay: '2s' }}></div>

                <div className="flex justify-between items-start mb-8 relative z-10">
                    <div>
                        <h1 className="text-3xl font-black text-white tracking-tighter uppercase">Delivery <span className="text-indigo-400 text-glow">Fast</span></h1>
                        <div className="flex items-center gap-2 mt-2 bg-white/10 backdrop-blur-md px-3 py-1.5 rounded-full inline-flex border border-white/5">
                            <div className={`w-2 h-2 rounded-full ${settings?.isManuallyClosed ? 'bg-rose-400' : 'bg-emerald-400 animate-pulse-ring'}`}></div>
                            <span className={`text-[9px] font-black uppercase tracking-widest ${settings?.isManuallyClosed ? 'text-rose-200' : 'text-emerald-300'}`}>
                                {settings?.isManuallyClosed ? 'Loja Fechada' : 'Aberto para Entrega'}
                            </span>
                        </div>
                    </div>
                    {isLoggedIn ? (
                        <Link to="/history" className="w-12 h-12 bg-white/10 backdrop-blur-md rounded-2xl flex items-center justify-center text-white hover:bg-white/20 transition-all shadow-sm border border-white/10 active:scale-95">
                            <Icons.Smartphone className="w-5 h-5" />
                        </Link>
                    ) : (
                        <Link to="/login" className="px-5 h-12 bg-indigo-500 text-white rounded-2xl flex items-center justify-center font-black uppercase text-[10px] tracking-widest hover:bg-indigo-400 transition-all shadow-lg shadow-indigo-500/30 active:scale-95">
                            Entrar
                        </Link>
                    )}
                </div>

                {settings?.isManuallyClosed && (
                    <div className="bg-rose-500/20 border border-rose-500/30 backdrop-blur-md text- rose-100 p-4 rounded-2xl mb-6 flex items-start gap-3 relative z-10">
                        <div className="shrink-0 text-xl font-bold bg-rose-500 w-8 h-8 rounded-full flex items-center justify-center text-white shadow-lg shadow-rose-500/40">🚫</div>
                        <p className="text-[10px] font-black uppercase tracking-widest leading-relaxed text-rose-200 mt-1">Estamos fechados no momento. Retornaremos em breve!</p>
                    </div>
                )}

                {isClosingSoon && !settings?.isManuallyClosed && (
                    <div className="bg-amber-500/20 border border-amber-500/30 backdrop-blur-md text-amber-100 p-4 rounded-2xl mb-6 flex items-start gap-3 relative z-10">
                        <div className="shrink-0 text-xl bg-amber-500 w-8 h-8 rounded-full flex items-center justify-center text-white shadow-lg shadow-amber-500/40">🕒</div>
                        <p className="text-[10px] font-black uppercase tracking-widest leading-relaxed text-amber-200 mt-1">Atenção: A loja fechará em menos de 30 minutos.</p>
                    </div>
                )}

                {/* Search */}
                <div className="relative z-10 mt-2">
                    <input
                        type="text"
                        placeholder="O que você quer comer hoje?"
                        className="w-full p-5 bg-white/10 border border-white/20 backdrop-blur-md text-white placeholder:text-white/50 rounded-2xl font-bold text-sm focus:ring-4 focus:ring-indigo-500/30 focus:border-indigo-400/50 transition-all pl-14 shadow-inner"
                    />
                    <div className="absolute left-5 top-1/2 -translate-y-1/2 text-white/50">
                        <Icons.Search className="w-5 h-5" />
                    </div>
                </div>
            </div>

            {/* Categories */}
            <div className="flex gap-3 overflow-x-auto p-6 no-scrollbar -mt-6">
                {categories.map(cat => (
                    <button
                        key={cat}
                        onClick={() => setSelectedCategory(cat)}
                        className={`px-5 py-3 rounded-[1.25rem] font-black text-[10px] uppercase tracking-widest transition-all whitespace-nowrap shadow-sm border ${selectedCategory === cat ? 'bg-indigo-600 text-white border-indigo-500 shadow-indigo-200 translate-y-[-2px]' : 'bg-white text-slate-500 border-slate-200 hover:border-indigo-300'}`}
                    >
                        {cat}
                    </button>
                ))}
            </div>

            {/* Products Grid */}
            <div className="px-6 grid grid-cols-1 gap-5">
                {filteredProducts.map(product => (
                    <div key={product.id} className="bg-white p-4 rounded-[2rem] flex gap-4 shadow-sm border border-slate-100 items-center group active:scale-[0.98] transition-all hover:shadow-md hover:border-indigo-100 relative overflow-hidden">
                        <div className="w-28 h-28 bg-slate-50 rounded-2xl overflow-hidden shrink-0 relative flex items-center justify-center text-slate-300">
                            {product.imageUrl ? (
                                <img src={product.imageUrl} alt={product.name} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110" />
                            ) : (
                                <Icons.ShoppingCart className="w-8 h-8 opacity-50" />
                            )}
                            <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
                        </div>
                        <div className="flex-1 py-1">
                            <p className="text-[9px] font-black text-indigo-500 uppercase tracking-widest mb-1">{product.category}</p>
                            <h3 className="font-bold text-slate-800 text-sm leading-tight line-clamp-2">{product.name}</h3>
                            <div className="flex justify-between items-center mt-3">
                                <span className="text-lg font-black text-slate-800 tracking-tighter">R$ {product.price.toFixed(2)}</span>
                                <button
                                    onClick={() => addToCart(product)}
                                    className="w-10 h-10 bg-indigo-50 text-indigo-600 hover:bg-indigo-600 hover:text-white rounded-xl flex items-center justify-center font-bold active:scale-90 transition-all shadow-sm group-hover:shadow-indigo-200"
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
