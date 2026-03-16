import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../services/api';
import { socket } from '../services/socket';
import type { Product, StoreStatus, Client, BusinessSettings } from '../types';
import { Icons } from '../constants';
import { useCart } from '../CartContext';
import CustomAlert from '../components/CustomAlert';
import CompleteProfileModal from '../components/CompleteProfileModal';
import ProfilePhotoModal from '../components/ProfilePhotoModal';
import NotificationCenterModal from '../components/NotificationCenterModal';

import CheckoutTab from '../components/CheckoutTab';

const Home: React.FC = () => {
    const { addToCart, items, total } = useCart();
    const navigate = useNavigate();
    const [activeTab, setActiveTab] = useState<'CARDAPIO' | 'CARRINHO'>('CARDAPIO');
    const [showMenu, setShowMenu] = useState(false);
    const [products, setProducts] = useState<Product[]>([]);
    const [categories, setCategories] = useState<string[]>([]);
    const [selectedCategory, setSelectedCategory] = useState('Todos');
    const [storeStatus, setStoreStatus] = useState<StoreStatus | null>(null);
    const [settings, setSettings] = useState<BusinessSettings | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [client, setClient] = useState<Client | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [showLogoutAlert, setShowLogoutAlert] = useState(false);
    const [showCompleteProfile, setShowCompleteProfile] = useState(false);
    const [showProfilePhotoModal, setShowProfilePhotoModal] = useState(false);
    const [showNotificationCenter, setShowNotificationCenter] = useState(false);

    const isProfileIncomplete = !!(client && (client.phone === '00000000000' || !client.street || !client.cep));


    useEffect(() => {
        const clientStr = localStorage.getItem('delivery_app_client');
        if (clientStr) {
            try {
                const data = JSON.parse(clientStr);
                setClient(data);
            } catch (e) {
                console.error("Error parsing client data", e);
            }
        }

        const fetchInitialData = async () => {
            try {
                const [p, status, s] = await Promise.all([
                    api.getProducts(),
                    api.getStoreStatus(),
                    api.getSettings()
                ]);
                setProducts(p);
                const cats = Array.from(new Set(p.map((prod: Product) => prod.category)));
                setCategories(['Todos', ...cats]);
                setStoreStatus(status as StoreStatus);
                setSettings(s as BusinessSettings);
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
                const [status] = await Promise.all([
                    api.getStoreStatus()
                ]);
                setStoreStatus(status as StoreStatus);
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
        const query = searchQuery.toLowerCase().trim();
        const matchesSearch = query ? p.name.toLowerCase().includes(query) : true;
        return matchesCategory && matchesSearch;
    });

    if (isLoading) return (
        <div className="h-screen bg-slate-50 dark:bg-slate-950 flex flex-col items-center justify-center">
            <div className="w-16 h-16 border-4 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin mb-4"></div>
            <div className="font-black text-indigo-500 uppercase tracking-widest text-[10px] animate-pulse">Carregando Cardápio...</div>
        </div>
    );


    return (
        <div className="min-h-screen bg-slate-50 dark:bg-slate-950 pb-28">
            <style>
                {`
                @keyframes slow-blink {
                    0%, 100% { opacity: 1; }
                    50% { opacity: 0.3; }
                }
                .animate-slow-blink {
                    animation: slow-blink 2s infinite ease-in-out;
                }
                `}
            </style>
            
            {/* Sticky Header Container */}
            <div className="sticky top-0 z-[60] bg-white dark:bg-slate-900 border-b border-slate-100 dark:border-slate-800 shadow-sm shadow-slate-200/20 dark:shadow-black/20">
                {/* Top Elements Row (Status, Greeting, Icons) */}
                <div className="pt-4 px-6 pb-2 relative overflow-hidden backdrop-blur-md">
                    <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500 rounded-full mix-blend-multiply filter blur-3xl opacity-5"></div>
                    
                    <div className="flex items-center justify-between relative z-10">
                        {/* Left: Store Status */}
                        <div className="flex items-center gap-2">
                            <div className="w-12 h-12 shrink-0" />
                            <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-slate-100/50 dark:border-slate-700/50 whitespace-nowrap ${storeStatus?.status === 'offline' ? 'bg-rose-50 dark:bg-rose-900/20 text-rose-600 dark:text-rose-400' : 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400'}`}>
                                <Icons.Globe className={`w-3.5 h-3.5 ${storeStatus?.status !== 'offline' ? 'animate-pulse' : ''}`} />
                                <span className="text-[10px] font-black uppercase tracking-widest">
                                    {storeStatus?.status === 'offline' ? 'OFF' : 'ON'}
                                </span>
                            </div>
                        </div>

                        {/* Right: Greeting & Icons */}
                        <div className="flex items-center gap-2">
                            <div className="flex flex-col items-end mr-1">
                                <span className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest leading-none">Olá,</span>
                                <span className="text-[11px] font-bold text-slate-700 dark:text-slate-200 truncate max-w-[80px]">{client?.name?.split(' ')[0] || ''}</span>
                            </div>
                            
                            <button
                                onClick={() => setShowNotificationCenter(true)}
                                className="w-10 h-10 bg-white dark:bg-slate-800 rounded-xl flex items-center justify-center text-slate-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-all shadow-sm border border-slate-100 dark:border-slate-700 active:scale-95"
                            >
                                <Icons.Bell className="w-4 h-4" />
                            </button>

                            <button 
                                onClick={() => setShowProfilePhotoModal(true)}
                                className="w-10 h-10 bg-white dark:bg-slate-800 rounded-xl flex items-center justify-center shadow-sm border border-slate-100 dark:border-slate-700 active:scale-95 overflow-hidden"
                            >
                                {client?.avatarUrl ? (
                                    <img src={client.avatarUrl} alt="Perfil" className="w-full h-full object-cover" />
                                ) : (
                                    <span className="font-black text-indigo-600 dark:text-indigo-400 text-sm">{client?.name?.[0].toUpperCase() || 'U'}</span>
                                )}
                            </button>
                        </div>
                    </div>

                    {/* App Title Center Row */}
                    <div className="flex flex-col items-center mt-2 relative z-10">
                        <h1 className="text-xl font-black text-slate-800 dark:text-white tracking-tighter uppercase whitespace-nowrap">
                            Delivery <span className="text-indigo-500">Fast®</span>
                        </h1>
                        
                        {isProfileIncomplete && (
                            <button 
                                onClick={() => setShowCompleteProfile(true)}
                                className="text-[9px] font-black text-rose-500 uppercase tracking-widest animate-slow-blink hover:text-rose-600 dark:hover:text-rose-400 transition-colors mt-0.5"
                            >
                                ⚠️ Complete seu cadastro
                            </button>
                        )}
                    </div>

                    {/* Tab Navigation */}
                    <div className="flex gap-4 mt-6 relative z-10">
                        <button
                            onClick={() => {
                                if (activeTab === 'CARRINHO') {
                                    setActiveTab('CARDAPIO');
                                    setShowMenu(true);
                                } else {
                                    setShowMenu(!showMenu);
                                }
                            }}
                            className={`flex-1 flex items-center justify-center gap-2 py-4 rounded-2xl font-black uppercase text-[10px] tracking-[0.2em] transition-all shadow-sm active:scale-95 ${activeTab === 'CARDAPIO' && showMenu ? 'bg-indigo-600 text-white shadow-indigo-200 dark:shadow-indigo-900/20' : 'bg-slate-50 dark:bg-slate-800 text-slate-400 dark:text-slate-500 border border-slate-100 dark:border-slate-700'}`}
                        >
                            Cardápio
                        </button>
                        <button
                            onClick={() => setActiveTab('CARRINHO')}
                            className={`flex-1 flex items-center justify-center gap-2 py-4 rounded-2xl font-black uppercase text-[10px] tracking-[0.2em] transition-all shadow-sm active:scale-95 ${activeTab === 'CARRINHO' ? 'bg-indigo-600 text-white shadow-indigo-200 dark:shadow-indigo-900/20' : 'bg-slate-50 dark:bg-slate-800 text-slate-400 dark:text-slate-500 border border-slate-100 dark:border-slate-700'}`}
                        >
                            Carrinho
                            {items.length > 0 && <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[9px] ${activeTab === 'CARRINHO' ? 'bg-white text-indigo-600' : 'bg-indigo-500 text-white'}`}>{items.reduce((a, b) => a + b.quantity, 0)}</span>}
                        </button>
                    </div>
                </div>

                {/* Categories Sticky Row (Only for Cardápio + showMenu) */}
                {activeTab === 'CARDAPIO' && showMenu && (
                    <div className="flex gap-2 overflow-x-auto px-6 py-3 no-scrollbar border-t border-slate-50/50 dark:border-slate-800 bg-white dark:bg-slate-900">
                        {categories.map(cat => (
                            <button
                                key={cat}
                                onClick={() => setSelectedCategory(cat)}
                                className={`px-4 py-2 rounded-xl font-black text-[9px] uppercase tracking-widest transition-all whitespace-nowrap shadow-sm border ${selectedCategory === cat ? 'bg-indigo-600 text-white border-indigo-500 translate-y-[-1px]' : 'bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-100 dark:border-slate-700 hover:border-indigo-200 dark:hover:border-indigo-800'}`}
                            >
                                {cat}
                            </button>
                        ))}
                    </div>
                )}
            </div>

            {/* TAB CONTENT */}
            {activeTab === 'CARDAPIO' ? (
                <div className="space-y-6 pt-6 animate-in fade-in duration-500">
                    {!showMenu ? (
                        /* Advertisement Banner Space */
                        <div className="px-6">
                            <div className="w-full aspect-[16/9] bg-slate-200 dark:bg-slate-800 rounded-[2.5rem] overflow-hidden shadow-sm relative group">
                                {settings?.appBannerUrl ? (
                                    <img src={settings.appBannerUrl} alt="Propaganda" className="w-full h-full object-cover" />
                                ) : (
                                    <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-indigo-500 to-purple-600 p-8 text-center">
                                        <Icons.ShoppingCart className="w-16 h-16 text-white/20 mb-4" />
                                        <h2 className="text-white font-black uppercase tracking-tighter text-2xl mb-2">Seja Bem-vindo!</h2>
                                        <p className="text-white/60 font-bold text-xs uppercase tracking-widest">Clique em cardápio para ver as delícias de hoje.</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    ) : (
                        <>
                            {/* Search Field inside Cardápio */}
                            <div className="px-6 relative scale-in-center">
                                <input
                                    type="text"
                                    placeholder="O que você quer comer hoje?"
                                    value={searchQuery}
                                    onChange={e => setSearchQuery(e.target.value)}
                                    className="w-full p-4 bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 text-slate-800 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 rounded-2xl font-bold text-sm focus:ring-4 focus:ring-indigo-50 dark:focus:ring-indigo-900/20 transition-all pl-12 shadow-sm"
                                />
                                <div className="absolute left-10 top-1/2 -translate-y-1/2 text-slate-400">
                                    <Icons.Search className="w-4 h-4" />
                                </div>
                            </div>

                            {/* Products Grid */}
                            <div className="px-6 grid grid-cols-1 gap-5 animate-in slide-in-from-bottom-4 duration-500">
                                {filteredProducts.map(product => (
                                    <div key={product.id} className="bg-white dark:bg-slate-800 p-4 rounded-[2rem] flex gap-4 shadow-sm border border-slate-100 dark:border-slate-700 items-center group active:scale-[0.98] transition-all hover:shadow-md hover:border-indigo-100 dark:hover:border-indigo-800 relative overflow-hidden">
                                        <div className="w-28 h-28 bg-slate-50 dark:bg-slate-900/50 rounded-2xl overflow-hidden shrink-0 relative flex items-center justify-center text-slate-300 dark:text-slate-700">
                                            {product.imageUrl ? (
                                                <img src={product.imageUrl} alt={product.name} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110" />
                                            ) : (
                                                <Icons.ShoppingCart className="w-8 h-8 opacity-50" />
                                            )}
                                            <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
                                        </div>
                                        <div className="flex-1 py-1">
                                            <p className="text-[9px] font-black text-indigo-500 uppercase tracking-widest mb-1">{product.category}</p>
                                            <h3 className="font-bold text-slate-800 dark:text-slate-100 text-sm leading-tight line-clamp-2">{product.name}</h3>
                                            <div className="flex justify-between items-center mt-3">
                                                <span className="text-lg font-black text-slate-800 dark:text-white tracking-tighter">R$ {product.price.toFixed(2)}</span>
                                                <button
                                                    onClick={() => !isProfileIncomplete && storeStatus?.status !== 'offline' && addToCart(product)}
                                                    disabled={storeStatus?.status === 'offline' || isProfileIncomplete}
                                                    className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold active:scale-90 transition-all shadow-sm ${storeStatus?.status === 'offline' || isProfileIncomplete ? 'bg-slate-100 dark:bg-slate-700 text-slate-300 dark:text-slate-500 cursor-not-allowed' : 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-600 dark:hover:bg-indigo-500 hover:text-white group-hover:shadow-indigo-200 dark:group-hover:shadow-indigo-900/40'}`}
                                                >
                                                    +
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </>
                    )}
                </div>
            ) : (
                <CheckoutTab onOrderPlaced={() => navigate('/history')} />
            )}

            {/* Sticky Cart Footer (Only if in Cardápio and has items) */}
            {activeTab === 'CARDAPIO' && items.length > 0 && storeStatus?.status !== 'offline' && (
                <div className="fixed bottom-32 left-6 right-6 animate-in slide-in-from-bottom duration-300 z-[60]">
                    <button
                        onClick={() => {
                            setActiveTab('CARRINHO');
                            setShowMenu(false);
                        }}
                        className="w-full p-5 rounded-3xl font-black uppercase text-[10px] tracking-widest flex justify-between items-center bg-indigo-600 text-white shadow-2xl shadow-indigo-200 dark:shadow-black/40 active:scale-95 transition-transform"
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
                    api.logout();
                    window.location.reload();
                }}
                onCancel={() => setShowLogoutAlert(false)}
                type="QUESTION"
            />

            {client && (
                <CompleteProfileModal 
                    isOpen={showCompleteProfile}
                    client={client}
                    onComplete={(updatedClient) => {
                        setClient(updatedClient);
                        setShowCompleteProfile(false);
                    }}
                    onClose={() => setShowCompleteProfile(false)}
                />
            )}

            <ProfilePhotoModal 
                isOpen={showProfilePhotoModal}
                onClose={() => setShowProfilePhotoModal(false)}
                onPhotoSelected={async (base64: string | null) => {
                    if (client) {
                        try {
                            const updated = await api.updateClient(client.id, { avatarUrl: base64 });
                            setClient(updated);
                            localStorage.setItem('delivery_app_client', JSON.stringify(updated));
                        } catch (e) {
                            console.error("Error updating avatar", e);
                        }
                    }
                }}
            />

            {client && (
                <NotificationCenterModal 
                    isOpen={showNotificationCenter}
                    onClose={() => setShowNotificationCenter(false)}
                    clientId={client.id}
                />
            )}
        </div>
    );
};

export default Home;
