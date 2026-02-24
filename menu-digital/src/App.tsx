import { useState, useEffect, useCallback } from 'react';
import { BrowserRouter, Routes, Route, useSearchParams } from 'react-router-dom';
import Home from './components/Home';
import CartModal from './components/CartModal';
import { CartItem } from './types';
import { verifyTable, socket, fetchStoreStatus, StoreStatus } from './api';

function AppContent() {
  const [searchParams] = useSearchParams();
  const tableParam = searchParams.get('mesa');
  const [tableNumber, setTableNumber] = useState<string | null>(tableParam);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [isCartOpen, setIsCartOpen] = useState(false);

  // Estados da API
  const [isValidating, setIsValidating] = useState(true);
  const [tableError, setTableError] = useState<string | null>(null);
  const [clientName, setClientName] = useState<string | null>(null);

  // Status da Loja
  const [storeStatus, setStoreStatus] = useState<StoreStatus>({ status: 'online', is_manually_closed: false, next_status_change: null });
  const [minutesToClose, setMinutesToClose] = useState<number | null>(null);

  const fetchStatus = useCallback(async () => {
    const status = await fetchStoreStatus();
    setStoreStatus(status);
  }, []);

  // Extracted logic to allow re-fetching the table data manually
  const fetchTableData = useCallback(async () => {
    if (!tableParam) {
      setTableError('Mesa não informada');
      setIsValidating(false);
      return;
    }

    try {
      const data = await verifyTable(tableParam);
      setTableNumber(tableParam);
      setClientName(data.clientName);
      setIsValidating(false);
    } catch (err: any) {
      setTableError(err.message || 'Erro ao validar a mesa.');
      setIsValidating(false);
    }
  }, [tableParam]);

  // Atualizar mesa e verificar no início
  useEffect(() => {
    fetchTableData();
    fetchStatus();

    const handleTableStatus = (data: any) => {
      if (data.tableNumber === Number(tableParam)) {
        fetchTableData();
      }
    };

    const handleStoreStatus = (status: StoreStatus) => {
      setStoreStatus(status);
    };

    socket.on('tableStatusChanged', handleTableStatus);
    socket.on('newOrder', handleTableStatus);
    socket.on('store_status_changed', handleStoreStatus);

    return () => {
      socket.off('tableStatusChanged', handleTableStatus);
      socket.off('newOrder', handleTableStatus);
      socket.off('store_status_changed', handleStoreStatus);
    };
  }, [fetchTableData, fetchStatus, tableParam]);

  useEffect(() => {
    if (storeStatus.status === 'online' && storeStatus.next_status_change) {
      const checkTime = () => {
        const diffMs = new Date(storeStatus.next_status_change!).getTime() - new Date().getTime();
        const diffMins = Math.floor(diffMs / 60000);
        setMinutesToClose(diffMins > 0 && diffMins <= 30 ? diffMins : null);
      };
      checkTime();
      const interval = setInterval(checkTime, 60000);
      return () => clearInterval(interval);
    } else {
      setMinutesToClose(null);
    }
  }, [storeStatus]);

  const addToCart = (item: CartItem) => {
    setCart(prev => {
      const existing = prev.find(i => i.id === item.id);
      if (existing) {
        return prev.map(i => i.id === item.id ? { ...i, quantity: i.quantity + item.quantity } : i);
      }
      return [...prev, item];
    });
  };

  const removeFromCart = (id: string) => {
    setCart(prev => prev.filter(i => i.id !== id));
  };

  const clearCart = () => setCart([]);

  const updateQuantity = (id: string, qty: number) => {
    if (qty <= 0) return removeFromCart(id);
    setCart(prev => prev.map(i => i.id === id ? { ...i, quantity: qty } : i));
  };

  if (isValidating) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-slate-900 text-white text-center">
        <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
      </div>
    );
  }

  if (tableError || !tableNumber) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-slate-900 text-white text-center">
        <div className="max-w-md w-full space-y-6">
          <div className="w-20 h-20 bg-red-500 rounded-3xl mx-auto flex items-center justify-center rotate-12">
            <span className="text-3xl font-black">X</span>
          </div>
          <h1 className="text-2xl font-black uppercase tracking-tighter">Erro de Acesso</h1>
          <p className="text-slate-400">{tableError || 'Mesa não identificada.'}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen max-w-md mx-auto relative shadow-2xl bg-slate-50 overflow-hidden">
      {/* Header Fixo */}
      <header className="sticky top-0 z-40 bg-white/80 backdrop-blur-md border-b border-slate-100 p-4 pt-6 flex justify-between items-center">
        <div>
          <h1 className="text-xl font-black text-slate-900 tracking-tighter uppercase">Delivery Fast</h1>
          <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
            Mesa {tableNumber} {clientName ? `• ${clientName}` : '• Disponível'}
          </p>
        </div>
      </header>

      {/* Banner de Status da Loja */}
      {(storeStatus.status === 'offline' || minutesToClose !== null) && (
        <div className={`text-center py-2 text-xs font-black uppercase tracking-widest text-white px-4 ${storeStatus.status === 'offline' ? 'bg-red-600 bg-opacity-90 backdrop-blur-md sticky top-[72px] z-30' : 'bg-orange-500 bg-opacity-90 backdrop-blur-md sticky top-[72px] z-30'}`}>
          {storeStatus.status === 'offline'
            ? (storeStatus.is_manually_closed ? 'Fechado Temporariamente' : 'Não estamos aceitando pedidos')
            : `Atenção: A loja fechará em ${minutesToClose} minutos!`
          }
        </div>
      )}

      <main className="h-[calc(100vh-80px)] overflow-y-auto hide-scrollbar">
        <Routes>
          <Route path="/" element={<Home cart={cart} addToCart={addToCart} updateQuantity={updateQuantity} />} />
        </Routes>
      </main>

      {/* Floating Cart Placeholder */}
      {cart.length > 0 && !isCartOpen && (
        <div className="fixed bottom-6 left-4 right-4 max-w-md mx-auto z-50 animate-slide-up">
          <button onClick={() => setIsCartOpen(true)} className="w-full bg-slate-900 text-white rounded-2xl p-4 flex items-center justify-between shadow-2xl shadow-slate-900/40 transform active:scale-95 transition-all">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center font-black text-xs">
                {cart.reduce((acc, i) => acc + i.quantity, 0)}
              </div>
              <span className="font-black uppercase text-sm tracking-widest">Ver Pedido</span>
            </div>
            <span className="font-black text-lg">
              R$ {cart.reduce((acc, i) => acc + (i.price * i.quantity), 0).toFixed(2)}
            </span>
          </button>
        </div>
      )}

      <CartModal
        isOpen={isCartOpen}
        onClose={() => setIsCartOpen(false)}
        cart={cart}
        tableNumber={tableNumber || '0'}
        updateQuantity={updateQuantity}
        clearCart={clearCart}
        initialClientName={clientName || undefined}
        onOrderSuccess={fetchTableData}
        storeStatus={storeStatus}
      />
    </div>
  );
}

function App() {
  return (
    <BrowserRouter>
      <AppContent />
    </BrowserRouter>
  );
}

export default App;
