import React, { useState, useEffect } from 'react';
import { MOCK_CATEGORIES, fetchProducts } from '../api';
import { CartItem, Product } from '../types';

interface HomeProps {
    cart: CartItem[];
    addToCart: (item: CartItem) => void;
    updateQuantity: (id: string, qty: number) => void;
}

const Home: React.FC<HomeProps> = ({ cart, addToCart, updateQuantity }) => {
    const [products, setProducts] = useState<Product[]>([]);
    const [categories, setCategories] = useState<string[]>(MOCK_CATEGORIES);
    const [activeCategory, setActiveCategory] = useState(MOCK_CATEGORIES[0]);
    const [searchTerm, setSearchTerm] = useState('');
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const loadProducts = async () => {
            const data = await fetchProducts();
            setProducts(data);

            // Extrair categorias reais dos produtos se existirem
            const uniqueCategories = Array.from(new Set(data.map(p => p.category))).filter(Boolean);
            if (uniqueCategories.length > 0) {
                setCategories(uniqueCategories);
                setActiveCategory(uniqueCategories[0]);
            }

            setIsLoading(false);
        };
        loadProducts();
    }, []);

    // Filtra produtos pela categoria ativa E pelo termo de busca
    const filteredProducts = products.filter(p => {
        const matchesCategory = searchTerm ? true : p.category === activeCategory; // Se buscar, ignora categoria ou apenas filtra geral
        const matchesSearch = searchTerm ? p.name.toLowerCase().includes(searchTerm.toLowerCase()) : true;
        return matchesCategory && matchesSearch;
    });

    if (isLoading) {
        return (
            <div className="flex justify-center p-12">
                <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
            </div>
        );
    }

    return (
        <div className="pb-32 px-4 space-y-8 pt-4 animate-fade-in">
            {/* Search Bar Falsa / Destaque */}
            <div className="bg-white p-2 rounded-3xl shadow-sm border border-slate-100 flex items-center gap-3 focus-within:ring-2 focus-within:ring-blue-500 transition-all">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-slate-300 ml-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="O que você deseja pedir?"
                    className="w-full bg-transparent border-none text-sm font-black text-slate-700 placeholder-slate-400 focus:outline-none py-2"
                />
            </div>

            {/* Categorias */}
            <div>
                <h2 className="text-sm font-black text-slate-900 uppercase tracking-tighter mb-4">Categorias</h2>
                <div className="flex gap-3 overflow-x-auto hide-scrollbar pb-2 -mx-4 px-4">
                    {categories.map(cat => (
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
                <h2 className="text-sm font-black text-slate-900 uppercase tracking-tighter mb-4">
                    {searchTerm ? `Resultados para "${searchTerm}"` : activeCategory}
                </h2>
                {filteredProducts.length === 0 ? (
                    <p className="text-center text-slate-400 font-bold py-8">Nenhum produto encontrado.</p>
                ) : (
                    filteredProducts.map(product => {
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
                    })
                )}
            </div>
        </div>
    );
};

export default Home;
