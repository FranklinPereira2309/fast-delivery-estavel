import React, { useState } from 'react';
import { MOCK_PRODUCTS, MOCK_CATEGORIES } from '../api';
import { CartItem } from '../types';

interface HomeProps {
    cart: CartItem[];
    addToCart: (item: CartItem) => void;
    updateQuantity: (id: string, qty: number) => void;
}

const Home: React.FC<HomeProps> = ({ cart, addToCart, updateQuantity }) => {
    const [activeCategory, setActiveCategory] = useState(MOCK_CATEGORIES[0]);

    // Filtra produtos pela categoria ativa
    const products = MOCK_PRODUCTS.filter(p => p.category === activeCategory);

    return (
        <div className="pb-32 px-4 space-y-8 pt-4 animate-fade-in">
            {/* Search Bar Falsa / Destaque */}
            <div className="bg-white p-4 rounded-3xl shadow-sm border border-slate-100 flex items-center gap-3">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <div className="text-xs font-black uppercase tracking-widest text-slate-400">O que você deseja pedir?</div>
            </div>

            {/* Categorias */}
            <div>
                <h2 className="text-sm font-black text-slate-900 uppercase tracking-tighter mb-4">Categorias</h2>
                <div className="flex gap-3 overflow-x-auto hide-scrollbar pb-2 -mx-4 px-4">
                    {MOCK_CATEGORIES.map(cat => (
                        <button
                            key={cat}
                            onClick={() => setActiveCategory(cat)}
                            className={`shrink-0 px-6 py-3 rounded-2xl text-[11px] font-black uppercase tracking-widest transition-all ${activeCategory === cat
                                    ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/30 font-black'
                                    : 'bg-white text-slate-500 hover:bg-slate-100 border border-slate-100'
                                }`}
                        >
                            {cat}
                        </button>
                    ))}
                </div>
            </div>

            {/* Lista de Produtos */}
            <div className="space-y-4">
                <h2 className="text-sm font-black text-slate-900 uppercase tracking-tighter mb-4">{activeCategory}</h2>
                {products.map(product => {
                    const cartItem = cart.find(i => i.id === product.id);
                    const quantity = cartItem?.quantity || 0;

                    return (
                        <div key={product.id} className="bg-white p-4 rounded-3xl border border-slate-100 shadow-sm flex gap-4 overflow-hidden relative group">
                            {/* Imagem */}
                            <div className="w-28 h-28 shrink-0 rounded-2xl overflow-hidden bg-slate-50 group-hover:shadow-inner transition-all">
                                <img src={product.imageUrl} alt={product.name} className="w-full h-full object-cover" />
                            </div>

                            {/* Info */}
                            <div className="flex-1 flex flex-col justify-between py-1">
                                <div>
                                    <h3 className="text-sm font-black text-slate-800 leading-tight uppercase tracking-tighter line-clamp-2">{product.name}</h3>
                                    <p className="text-[10px] font-bold text-slate-400 mt-1 line-clamp-2 leading-snug">{product.description}</p>
                                </div>

                                <div className="flex items-center justify-between mt-2">
                                    <span className="text-lg font-black text-blue-600 tracking-tighter">
                                        R$ {product.price.toFixed(2)}
                                    </span>

                                    {/* Controles de Quantidade */}
                                    {quantity > 0 ? (
                                        <div className="flex items-center bg-slate-100 rounded-xl p-1 gap-2 shadow-inner">
                                            <button
                                                onClick={() => updateQuantity(product.id, quantity - 1)}
                                                className="w-8 h-8 rounded-lg bg-white shadow-sm flex items-center justify-center font-black text-slate-500 active:scale-90 transition-transform"
                                            >
                                                -
                                            </button>
                                            <span className="w-6 text-center font-black text-sm">{quantity}</span>
                                            <button
                                                onClick={() => updateQuantity(product.id, quantity + 1)}
                                                className="w-8 h-8 rounded-lg bg-blue-600 shadow-sm shadow-blue-500/50 flex items-center justify-center font-black text-white active:scale-90 transition-transform"
                                            >
                                                +
                                            </button>
                                        </div>
                                    ) : (
                                        <button
                                            onClick={() => addToCart({ ...product, quantity: 1 })}
                                            className="px-4 py-2 bg-slate-900 text-white rounded-xl text-[10px] font-black uppercase tracking-widest shadow-lg active:scale-95 transition-all"
                                        >
                                            Adicionar
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

export default Home;
