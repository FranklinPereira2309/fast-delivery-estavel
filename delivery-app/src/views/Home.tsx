import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { api } from '../services/api';
import { socket } from '../services/socket';
import type { Product, BusinessSettings, StoreStatus } from '../types';
import { Icons } from '../constants';
import { useCart } from '../CartContext';
import CustomAlert from '../components/CustomAlert';

const Home: React.FC = () => {
    const { addToCart, items, total } = useCart();
    const navigate = useNavigate();
    const [products, setProducts] = useState<Product[]>([]);
    const [categories, setCategories] = useState<string[]>([]);
    const [selectedCategory, setSelectedCategory] = useState('Todos');
    const [settings, setSettings] = useState<BusinessSettings | null>(null);
    const [storeStatus, setStoreStatus] = useState<StoreStatus | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isLoggedIn, setIsLoggedIn] = useState(false);
    const [clientName, setClientName] = useState('');
    const [searchQuery, setSearchQuery] = useState('');
    const [showLogoutAlert, setShowLogoutAlert] = useState(false);


    useEffect(() => {
        const clientStr = localStorage.getItem('delivery_app_client');
        setIsLoggedIn(!!clientStr);
        if (clientStr) {
            try {
                const client = JSON.parse(clientStr);
                setClientName(client.name || '');
            } catch (e) {
                console.error("Error parsing client data", e);
            }
        }

        const fetchInitialData = async () => {
            try {
                const [p, s, status] = await Promise.all([
                    api.getProducts(),
                    api.getSettings(),
                    api.getStoreStatus()
                ]);
                setProducts(p);
                const cats = Array.from(new Set(p.map((prod: Product) => prod.category)));
                setCategories(['Todos', ...cats]);
                setSettings(s as any);
                setStoreStatus(status);
            } catch (e) {
                console.error(e);
            } finally {
                setIsLoading(false);
            }
        };

        fetchInitialData();

        // Polling settings every 15s to update Delivery ON/OFF status
        const interval = setInterval(async () => {
            try {
                const [s, status] = await Promise.all([
                    api.getSettings(),
                    api.getStoreStatus()
                ]);
                setSettings(s as any);
                setStoreStatus(status);
            } catch (e) {
                console.error("Error polling settings", e);
            }
        }, 15000);

        socket.on('store_status_changed', (newStatus: StoreStatus) => {
            setStoreStatus(newStatus);
        });

        return () => {
            clearInterval(interval);
            socket.off('store_status_changed');
        };
    }, []);

    const filteredProducts = products.filter(p => {
        const matchesCategory = selectedCategory === 'Todos' || p.category === selectedCategory;
        const matchesSearch = p.name.toLowerCase().includes(searchQuery.toLowerCase());
        return matchesCategory && matchesSearch;
    });

    if (isLoading) return (
        <div className="h-screen bg-slate-50 flex flex-col items-center justify-center">
            <div className="w-16 h-16 border-4 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin mb-4"></div>
            <div className="font-black text-indigo-500 uppercase tracking-widest text-[10px] animate-pulse">Carregando Cardápio...</div>
        </div>
    );

    if (settings && settings.enableDeliveryApp === false) {
        return (
            <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-8 text-center select-none relative overflow-hidden">
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-rose-500 rounded-full mix-blend-multiply filter blur-3xl opacity-10"></div>
                <div className="w-24 h-24 bg-rose-100 rounded-[2rem] flex items-center justify-center shadow-xl shadow-rose-100 transform -rotate-12 mb-8 animate-float relative z-10 border border-rose-200">
                    <span className="text-rose-600 text-4xl font-black">!</span>
                </div>
                <h1 className="text-3xl font-black text-slate-800 tracking-tighter uppercase mb-4 relative z-10">App Desativado</h1>
                <p className="text-slate-400 font-bold uppercase text-[10px] tracking-widest leading-relaxed max-w-xs relative z-10">
                    Este aplicativo de pedidos online não está habilitado para este estabelecimento no momento.
                </p>
                <div className="mt-12 h-1 w-12 bg-slate-200 rounded-full"></div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-slate-50 pb-28">
            {/* Header / Store Status Premium Soft */}
            <div className="bg-white pt-8 p-6 pb-8 rounded-b-[3rem] shadow-sm border-b border-slate-100 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500 rounded-full mix-blend-multiply filter blur-3xl opacity-5 animate-float"></div>
                <div className="absolute bottom-0 left-0 w-64 h-64 bg-rose-500 rounded-full mix-blend-multiply filter blur-3xl opacity-5 animate-float" style={{ animationDelay: '2s' }}></div>

                <div className="flex justify-between items-start mb-8 relative z-10">
                    <div>
                        <h1 className="text-3xl font-black text-slate-800 tracking-tighter uppercase">Delivery <span className="text-indigo-500">Fast</span></h1>
                        <div className="flex items-center gap-2 mt-2 bg-slate-50 px-3 py-1.5 rounded-full inline-flex border border-slate-100 whitespace-nowrap">
                            <div className={`w-2 h-2 rounded-full ${storeStatus?.status === 'offline' ? 'bg-rose-500' : 'bg-emerald-500 animate-pulse-ring'}`}></div>
                            <span className={`text-[10px] font-black uppercase tracking-widest ${storeStatus?.status === 'offline' ? 'text-rose-500' : 'text-emerald-500'}`}>
                                {storeStatus?.status === 'offline' ? 'Delivery OFF' : 'Delivery ON'}
                            </span>
                        </div>
                    </div>
                    {isLoggedIn ? (
                        <div className="flex items-center gap-3">
                            <div className="flex flex-col items-end mr-1">
                                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Olá,</span>
                                <span className="text-xs font-bold text-slate-700 max-w-[100px] truncate">{clientName.split(' ')[0]}</span>
                            </div>
                            <Link to="/profile" className="w-11 h-11 bg-white rounded-2xl flex items-center justify-center text-slate-500 hover:text-indigo-600 hover:bg-slate-50 transition-all shadow-sm border border-slate-100 active:scale-95">
                                <Icons.User className="w-5 h-5" />
                            </Link>
                            <button
                                onClick={() => setShowLogoutAlert(true)}
                                className="w-11 h-11 bg-rose-50 rounded-2xl flex items-center justify-center text-rose-500 hover:bg-rose-100 transition-all shadow-sm border border-rose-100 active:scale-95"
                            >
                                <Icons.LogOut className="w-5 h-5" />
                            </button>
                        </div>
                    ) : (
                        <Link to="/login" className="px-5 h-11 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center font-black uppercase text-[10px] tracking-widest hover:bg-indigo-100 transition-all shadow-sm active:scale-95">
                            Entrar
                        </Link>
                    )}
                </div>

                {/* Search */}
                <div className="relative z-10 mt-2">
                    <input
                        type="text"
                        placeholder="O que você quer comer hoje?"
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        className="w-full p-5 bg-slate-50/80 border border-slate-100 text-slate-800 placeholder:text-slate-400 rounded-2xl font-bold text-sm focus:ring-4 focus:ring-indigo-50 focus:border-indigo-100 focus:bg-white transition-all pl-14 shadow-inner"
                    />
                    <div className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-400">
                        <Icons.Search className="w-5 h-5" />
                    </div>
                </div>
            </div>


            {/* Categories */}
            <div className="flex gap-3 overflow-x-auto p-6 no-scrollbar -mt-4">
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
                <div className="fixed bottom-32 left-6 right-6 animate-in slide-in-from-bottom duration-300 z-[60]">
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

            <CustomAlert
                isOpen={showLogoutAlert}
                title="SAIR DO SISTEMA"
                message="DESEJA REALMENTE SAIR DA APLICAÇÃO E VOLTAR PARA O LOGIN?"
                onConfirm={() => {
                    localStorage.removeItem('delivery_app_client');
                    window.location.reload();
                }}
                onCancel={() => setShowLogoutAlert(false)}
                type="QUESTION"
            />
        </div>
    );
};

export default Home;
