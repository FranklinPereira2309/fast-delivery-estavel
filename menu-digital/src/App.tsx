import { useState, useEffect, useCallback, useRef } from 'react';
import { BrowserRouter, Routes, Route, useSearchParams } from 'react-router-dom';
import Home from './components/Home';
import CartModal from './components/CartModal';
import { CartItem } from './types';
import FooterNav from './components/FooterNav';
import { verifyTable, socket, fetchStoreStatus, StoreStatus, validatePin } from './api';

function AppContent() {
  const [searchParams] = useSearchParams();
  const tableParam = searchParams.get('mesa');
  const [tableNumber, setTableNumber] = useState<string | null>(tableParam);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [isCartOpen, setIsCartOpen] = useState(false);

  // Estados da API
  const [isValidating, setIsValidating] = useState(true);
  const [isBilling, setIsBilling] = useState(false);
  const [tableError, setTableError] = useState<string | null>(null);
  const [clientName, setClientName] = useState<string | null>(null);
  const [isPinRequired, setIsPinRequired] = useState(false);
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState<string | null>(null);
  const [currentPin, setCurrentPin] = useState<string | null>(null);
  const [isOwner, setIsOwner] = useState(false);
  const [isSessionFinished, setIsSessionFinished] = useState(false);
  const [banner, setBanner] = useState<{ message: string; type: 'info' | 'error' | 'success' } | null>(null);

  // Ref para rastrear estados terminais em tempo real e evitar "stale closures"
  const terminalStateRef = useRef({
    finished: false
  });

  // Função centralizada para atualizar estados terminais imediatamente
  const updateTerminalState = useCallback((finished: boolean) => {
    terminalStateRef.current = { finished };
    setIsSessionFinished(finished);
  }, []);

  // Status da Loja
  const [storeStatus, setStoreStatus] = useState<StoreStatus>({ status: 'online', is_manually_closed: false, next_status_change: null });
  const [minutesToClose, setMinutesToClose] = useState<number | null>(null);

  const fetchStatus = useCallback(async () => {
    try {
      const status = await fetchStoreStatus();
      setStoreStatus(status);
    } catch (e) {
      console.error("Failed to fetch store status, defaulting to offline", e);
      setStoreStatus({ status: 'offline', is_manually_closed: false, next_status_change: null });
    }
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

      // Se retornou token ou pin, salva (primeiro acesso)
      if (data.sessionToken) {
        localStorage.setItem(`sessionToken_${tableParam}`, data.sessionToken);
      }
      setCurrentPin(data.pin || null);
      setTableNumber(tableParam);
      setClientName(data.clientName);
      setIsOwner(!!data.isOwner);
      setTableError(null);
      setIsPinRequired(false);
      setIsValidating(false);
      setIsBilling(data.status === 'billing');
      // Only clear finished session if we are actually in an active state now
      if (data.status === 'occupied' || data.status === 'billing') {
        updateTerminalState(false);
      }
    } catch (err: any) {
      if (err.status === 'billing') {
        setIsBilling(true);
        setTableError(null);
        setIsPinRequired(false);
      } else if (err.pin_required) {
        setIsPinRequired(true);
        setTableError(null);
        setIsBilling(false);
      } else if (err.message?.includes('Mesa não encontrada') || err.message?.includes('inexistente')) {
        setTableError(err.message);
        setIsBilling(false);
      } else {
        // Se a mesa estiver livre agora mas o usuário tinha um token, significa que a sessão acabou
        const token = localStorage.getItem(`sessionToken_${tableParam}`);
        if (token && (err.message?.includes('não autorizada') || err.status === 401)) {
          localStorage.removeItem(`sessionToken_${tableParam}`);
          updateTerminalState(true);
        } else {
          // Só exibe erro de mesa se não estivermos exibindo uma tela final
          if (!terminalStateRef.current.finished) {
            setTableError(err.message || 'Erro ao validar a mesa.');
          }
        }
        setIsBilling(false);
        setIsPinRequired(false);
      }
      setIsValidating(false);
    }
  }, [tableParam, updateTerminalState]);

  const handlePinSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tableParam || pinInput.length < 4) return;

    try {
      const { sessionToken } = await validatePin(tableParam, pinInput);
      localStorage.setItem(`sessionToken_${tableParam}`, sessionToken);
      setIsPinRequired(false);
      fetchTableData();
    } catch (err: any) {
      setPinError(err.message || 'PIN incorreto');
    }
  };

  // Atualizar mesa e verificar no início e a cada 5 segundos como fallback ao socket
  useEffect(() => {
    fetchTableData();
    fetchStatus();

    const intervalId = setInterval(() => {
      // Usamos a ref para garantir que o setInterval leia o valor MAIS RECENTE sem precisar recriar o hook
      if (!terminalStateRef.current.finished) {
        fetchTableData();
      }
      fetchStatus();
    }, 5000);

    const handleTableStatus = (data: any) => {
      console.log('Socket tableStatusChanged received:', data);
      const targetTable = Number(tableParam);
      if (data.tableNumber === targetTable) {
        // 1. Handle Immediate Billing Transition
        if (data.status === 'billing') {
          setIsBilling(true);
          setTableError(null);
          setIsPinRequired(false);
          return;
        }

        // 2. Handle Payment Completion (Table becomes available)
        if (data.status === 'available') {
          setIsBilling(false);
          setCurrentPin(null);
          setIsOwner(false);
          setIsPinRequired(false);
          // Triggers "Thank You" screen
          updateTerminalState(true);
          return;
        }

        // 3. Status is occupied or pending-digital
        setIsBilling(false);
        updateTerminalState(false);
        setTableError(null);
        fetchTableData();
      }
    };

    const handleStoreStatus = (status: StoreStatus) => {
      setStoreStatus(status);
    };

    const handleCancellation = (data: any) => {
      console.log('Socket digitalOrderCancelled received:', data);
      if (data.tableNumber === Number(tableParam)) {
        setIsBilling(false);
        setIsPinRequired(false);
        // Exibe um Banner no topo
        setBanner({ message: data.message || "Pedido Cancelado, dúvidas pergunte ao Garçom", type: 'error' });
      }
    };

    socket.on('tableStatusChanged', handleTableStatus);
    socket.on('newOrder', handleTableStatus);
    socket.on('store_status_changed', handleStoreStatus);
    socket.on('digitalOrderCancelled', handleCancellation);

    return () => {
      clearInterval(intervalId);
      socket.off('tableStatusChanged', handleTableStatus);
      socket.off('newOrder', handleTableStatus);
      socket.off('store_status_changed', handleStoreStatus);
      socket.off('digitalOrderCancelled', handleCancellation);
    };
  }, [fetchTableData, fetchStatus, tableParam, updateTerminalState]);

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

  // Banner de Notificação no Topo
  const renderBanner = () => {
    if (!banner) return null;
    return (
      <div className={`w-full z-[100] animate-slide-down shadow-lg border-b ${banner.type === 'error' ? 'bg-red-600 border-red-500 text-white' : 'bg-slate-900 border-slate-800 text-white'}`}>
        <div className="max-w-md mx-auto p-4 flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center shrink-0">
            {banner.type === 'error' ? (
              <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            )}
          </div>
          <div className="flex-1">
            <p className="text-[9px] font-black uppercase tracking-[0.2em] opacity-80">Aviso do Sistema</p>
            <p className="text-xs font-bold leading-tight uppercase">{banner.message}</p>
          </div>
          <button onClick={() => setBanner(null)} className="p-2 bg-black/10 hover:bg-black/20 rounded-full transition-colors">
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>
    );
  };

  if (isSessionFinished) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-slate-900 text-white text-center">
        <div className="max-w-md w-full space-y-8 animate-fade-in animate-zoom-in">
          <div className="relative mx-auto w-24 h-24">
            <div className="absolute inset-0 bg-emerald-500/20 rounded-full animate-ping"></div>
            <div className="relative w-24 h-24 bg-emerald-600 rounded-3xl flex items-center justify-center shadow-2xl shadow-emerald-500/40">
              <svg xmlns="http://www.w3.org/2000/svg" className="w-12 h-12 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
              </svg>
            </div>
          </div>
          <div className="space-y-4">
            <h1 className="text-4xl font-black uppercase tracking-tighter text-transparent bg-clip-text bg-gradient-to-br from-white to-slate-400">
              Muito Obrigado!
            </h1>
            <p className="text-slate-400 text-lg leading-relaxed font-medium">
              Agradecemos por usar nossos serviços. <br />
              <span className="text-emerald-400">Sua sessão foi encerrada com sucesso.</span>
            </p>
          </div>
          <div className="pt-8 space-y-4">
            <p className="text-xs text-slate-500 italic leading-relaxed uppercase tracking-[0.2em] font-black opacity-50">
              Agradecemos a preferência! <br /> Volte sempre para saborear o que temos de melhor.
            </p>
            <button
              onClick={() => {
                localStorage.removeItem(`sessionToken_${tableParam}`);
                updateTerminalState(false);
                window.location.reload(); // Recarregar para limpar estados e iniciar nova tentativa de entrada
              }}
              className="px-8 py-3 bg-slate-800 hover:bg-slate-700 text-white rounded-full text-[10px] font-black uppercase tracking-widest transition-all active:scale-95 border border-slate-700"
            >
              Nova Sessão
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (isBilling) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-slate-900 text-white text-center overflow-hidden">
        {/* Decorative elements */}
        <div className="absolute top-[-10%] left-[-10%] w-64 h-64 bg-blue-600/10 rounded-full blur-[100px]"></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-64 h-64 bg-blue-400/10 rounded-full blur-[100px]"></div>

        <div className="max-w-md w-full space-y-10 relative z-10 animate-fade-in animate-zoom-in">
          <div className="relative mx-auto w-32 h-32">
            <div className="absolute inset-0 bg-blue-500/20 rounded-full animate-pulse"></div>
            <div className="absolute inset-2 border-2 border-dashed border-blue-400/30 rounded-full animate-spin-slow"></div>
            <div className="relative w-32 h-32 bg-gradient-to-br from-blue-600 to-blue-800 rounded-[2.5rem] flex items-center justify-center shadow-2xl shadow-blue-500/40 transform -rotate-3">
              <svg xmlns="http://www.w3.org/2000/svg" className="w-16 h-16 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
          </div>

          <div className="space-y-4">
            <div className="inline-block px-4 py-1.5 bg-blue-500/10 border border-blue-500/20 rounded-full mb-2">
              <span className="text-[10px] font-black uppercase tracking-[0.3em] text-blue-400">Processando</span>
            </div>
            <h1 className="text-4xl font-black uppercase tracking-tighter leading-none text-white">Pagamento <br /> em curso</h1>
            <p className="text-slate-400 text-lg leading-relaxed max-w-[280px] mx-auto font-medium">
              Estamos finalizando o fechamento da sua mesa. Por favor, aguarde...
            </p>
          </div>

          <div className="flex flex-col items-center gap-6">
            <div className="flex justify-center gap-3">
              <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce [animation-delay:-0.3s]"></div>
              <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce [animation-delay:-0.15s]"></div>
              <div className="w-2 h-2 bg-blue-300 rounded-full animate-bounce"></div>
            </div>

            <p className="text-[10px] text-slate-500 font-black uppercase tracking-[0.2em] max-w-[240px] opacity-60">
              fique à vontade para chamar um garçom se precisar de ajuda
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (isPinRequired) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-slate-900 text-white text-center">
        <div className="max-w-md w-full space-y-8 animate-fade-in animate-zoom-in">
          <div className="w-20 h-20 bg-blue-600 rounded-3xl mx-auto flex items-center justify-center shadow-2xl shadow-blue-500/40">
            <svg xmlns="http://www.w3.org/2000/svg" className="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          <div className="space-y-3">
            <h1 className="text-2xl font-black uppercase tracking-tighter">Mesa em Atendimento</h1>
            <p className="text-slate-400">Esta mesa já possui um atendimento iniciado. Informe o PIN para entrar.</p>
          </div>

          <form onSubmit={handlePinSubmit} className="space-y-4">
            <input
              type="text"
              inputMode="numeric"
              maxLength={4}
              value={pinInput}
              onChange={(e) => {
                setPinInput(e.target.value.replace(/\D/g, ''));
                setPinError(null);
              }}
              placeholder="Digite o PIN de 4 dígitos"
              className="w-full bg-slate-800 border-2 border-slate-700 rounded-2xl py-4 px-6 text-center text-2xl font-black tracking-[1em] focus:border-blue-500 outline-none transition-all placeholder:text-sm placeholder:tracking-normal placeholder:font-medium"
            />
            {pinError && <p className="text-red-500 text-sm font-bold animate-shake">{pinError}</p>}
            <button
              type="submit"
              disabled={pinInput.length < 4}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-black py-4 rounded-2xl transition-all shadow-xl shadow-blue-900/40 uppercase tracking-widest text-sm"
            >
              Validar Acesso
            </button>
          </form>

          <p className="text-xs text-slate-500">O PIN é fornecido pela primeira pessoa que acessou a mesa.</p>
        </div>
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
      {renderBanner()}
      {/* Header Fixo */}
      <header className="sticky top-0 z-40 bg-white/80 backdrop-blur-md border-b border-slate-100 p-4 pt-6 flex justify-between items-center">
        <div>
          <h1 className="text-xl font-black text-slate-900 tracking-tighter uppercase">Delivery Fast</h1>
          <div className="flex flex-col gap-0.5 mt-0.5">
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
              Mesa {tableNumber} {clientName ? `• ${clientName}` : '• Disponível'}
            </p>
            <p className={`text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5 ${storeStatus.status === 'online' ? 'text-emerald-600' : 'text-red-600'}`}>
              <svg xmlns="http://www.w3.org/2000/svg" className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 002 2 2 2 0 012 2v.683a3.7 3.7 0 01-2 3.317c-.504.252-1 .5-1.5.5M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z" />
              </svg>
              {storeStatus.status === 'online' ? 'Loja Online' : 'Loja Offline'}
              <span className={`w-1.5 h-1.5 rounded-full ${storeStatus.status === 'online' ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'}`}></span>
            </p>
          </div>
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
        <div className="fixed bottom-32 left-4 right-4 max-w-md mx-auto z-[60] animate-slide-up">
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

      <FooterNav
        tableNumber={tableNumber || ''}
        isOwner={isOwner}
        pin={currentPin}
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
