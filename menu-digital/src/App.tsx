import { useState, useEffect, useCallback, useRef } from 'react';
import { BrowserRouter, Routes, Route, useSearchParams } from 'react-router-dom';
import Home from './components/Home';
import CartModal from './components/CartModal';
import { CartItem } from './types';
import FooterNav from './components/FooterNav';
import { verifyTable, socket, fetchStoreStatus, StoreStatus, validatePin, joinTableRoom, acknowledgeRejection } from './api';

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
  const [blockingRejection, setBlockingRejection] = useState<{ message: string } | null>(null);

  // Ref para rastrear estados terminais e propriedade em tempo real (evita "stale closures")
  const sessionContextRef = useRef({
    finished: false,
    isOwner: false,
    isPinRequired: false,
    hasToken: !!localStorage.getItem(`sessionToken_${tableParam}`)
  });

  // Função centralizada para atualizar estados terminais imediatamente
  const updateTerminalState = useCallback((finished: boolean) => {
    sessionContextRef.current.finished = finished;
    setIsSessionFinished(finished);
  }, []);

  const updateSessionContext = useCallback((isOwner: boolean, isPinRequired: boolean) => {
    sessionContextRef.current.isOwner = isOwner;
    sessionContextRef.current.isPinRequired = isPinRequired;
    sessionContextRef.current.hasToken = !!localStorage.getItem(`sessionToken_${tableParam}`);
  }, [tableParam]);

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
  const fetchTableData = useCallback(async (silent: boolean = false) => {
    if (!tableParam) {
      setTableError('Mesa não informada');
      setIsValidating(false);
      return;
    }

    try {
      // 0. Safety Guard: If we are already in Thank You screen, don't bother fetching
      if (sessionContextRef.current.finished) {
        setIsValidating(false);
        return;
      }

      if (!silent) setIsValidating(true);
      const data = await verifyTable(tableParam);

      // Se a mesa for encontrada, limpamos erros anteriores
      setTableError(null);
      if (!silent) setIsValidating(false);

      // Update session storage if needed
      if (data.sessionToken) {
        localStorage.setItem(`sessionToken_${tableParam}`, data.sessionToken);
      }

      // Check for ownership
      const isOwnerNow = !!data.isOwner;
      setIsOwner(isOwnerNow);
      setIsPinRequired(false);
      updateSessionContext(isOwnerNow, false);

      if (data.status === 'billing') {
        setIsBilling(true);
      } else {
        setIsBilling(false);
      }

      // Join the table room for targeted instant updates
      joinTableRoom(Number(tableParam));

      // Clear finished state if we detect a fresh table
      if ((data as any).isNewSession || data.status === 'available') {
        console.log('Table available or new session - clearing finished state');
        updateTerminalState(false);
      }

      // Only clear finished session if we are actually in an active state now
      if (data.status === 'occupied' || data.status === 'billing') {
        updateTerminalState(false);
      }

      // Check for persistent rejection (Server-side flag)
      if ((data as any).rejectionMessage) {
        setBlockingRejection({ message: (data as any).rejectionMessage });
        setIsBilling(false);
        setIsPinRequired(false);
        setIsValidating(false);
        return;
      }

      setCurrentPin(data.pin || null);
      setTableNumber(tableParam);
      setClientName(data.clientName);

    } catch (err: any) {
      // 0. Safety Guard: Even in error, if we are finished, stay finished
      if (sessionContextRef.current.finished) {
        setIsValidating(false);
        return;
      }

      if (err.status === 'billing') {
        setIsBilling(true);
        setTableError(null);
        setIsPinRequired(false);
        updateSessionContext(false, false);
      } else if (err.pin_required) {
        setIsPinRequired(true);
        setTableError(null);
        setIsBilling(false);
        updateSessionContext(false, true);
      } else if (err.message?.includes('Mesa não encontrada') || err.message?.includes('inexistente')) {
        setTableError(err.message);
        setIsBilling(false);
        updateSessionContext(false, false);
      } else {
        // Se a mesa estiver livre agora mas o usuário tinha um token, significa que a sessão acabou
        const currentToken = localStorage.getItem(`sessionToken_${tableParam}`);
        if (currentToken && (err.message?.includes('não autorizada') || err.status === 401)) {
          localStorage.removeItem(`sessionToken_${tableParam}`);
          updateSessionContext(false, false);
        } else {
          // Só exibe erro de mesa se não estivermos exibindo uma tela final
          if (!sessionContextRef.current.finished) {
            setTableError(err.message || 'Erro ao validar a mesa.');
          }
          updateSessionContext(false, false);
        }
        setIsBilling(false);
        setIsPinRequired(false);
      }
      setIsValidating(false);
    }
  }, [tableParam, updateTerminalState, updateSessionContext]);

  const handlePinSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tableParam || pinInput.length < 4) return;

    try {
      const { sessionToken } = await validatePin(tableParam, pinInput);
      localStorage.setItem(`sessionToken_${tableParam}`, sessionToken);
      setIsPinRequired(false);
      updateSessionContext(true, false);
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
      if (!sessionContextRef.current.finished) {
        fetchTableData(true);
      }
      fetchStatus();
    }, 5000);

    const handleTableStatus = (data: any) => {
      console.log('Socket tableStatusChanged received:', data);
      const targetTable = Number(tableParam);

      if (Number(data.tableNumber) === targetTable) {
        // 0. Handle Atomic Rejection Flag
        if (data.rejectionMessage) {
          // Só processa a mensagem de rejeição se for o dono da sessão (tem token válido)
          if (!sessionContextRef.current.isOwner) {
            console.log('Ignoring rejection for non-owner device');
            return;
          }
          console.log('Atomic Rejection detected in status update:', data.rejectionMessage);
          setBlockingRejection({ message: data.rejectionMessage });
          setIsBilling(false);
          setIsPinRequired(false);
          return;
        }

        // 1. Handle Immediate Billing Transition
        if (data.status === 'billing') {
          // Só processa se for o dono da mesa
          if (!sessionContextRef.current.isOwner) return;

          setIsBilling(true);
          setTableError(null);
          setIsPinRequired(false);
          return;
        }

        // 2. Handle Payment Completion (Table becomes available)
        if (data.status === 'available' && Number(data.tableNumber) === targetTable) {
          setIsBilling(false);
          setCurrentPin(null);
          setIsOwner(false);
          setIsPinRequired(false);

          // CRITICAL: Only trigger "Thank You" if this device was part of the CURRENT PAID session
          const localToken = localStorage.getItem(`sessionToken_${tableParam}`);
          const isSessionMatch = localToken && data.sessionToken && localToken === data.sessionToken;

          if (isSessionMatch) {
            updateTerminalState(true);
          } else {
            // Se a mesa ficou livre mas o token não bate, apenas limpa o estado local
            if (localToken && data.sessionToken === null) {
              // Caso especial: sessão foi limpa mas sem token específico (ex: limpeza manual pelo Admin)
              // Nesse caso, se o usuário tinha um token, assumimos que a sessão dele acabou
              updateTerminalState(true);
            } else {
              updateTerminalState(false);
              fetchTableData();
            }
          }
          return;
        }

        // 3. Status is occupied or pending-digital
        setIsBilling(false);
        updateTerminalState(false);
        setTableError(null);
        fetchTableData(true);
      }
    };

    const handleStoreStatus = (status: StoreStatus) => {
      setStoreStatus(status);
    };

    const handleCancellation = (data: any) => {
      console.log('Socket digitalOrderCancelled received:', data);
      const targetTable = Number(tableParam);
      const incomingTable = Number(data.tableNumber);

      if (incomingTable === targetTable) {
        // Só processa o cancelamento se for o dono da mesa
        if (!sessionContextRef.current.isOwner) {
          console.log('Ignoring cancellation for non-owner device');
          return;
        }
        setBlockingRejection({ message: data.message || "Pedido Rejeitado, dúvidas pergunte ao Garçom" });
        setIsBilling(false);
        setIsPinRequired(false);
      }
    };

    const handlePaymentConfirmed = (data: any) => {
      console.log('Socket paymentConfirmed received:', data);
      if (Number(data.tableNumber) === Number(tableParam)) {
        setIsBilling(false);
        setCurrentPin(null);
        setIsOwner(false);
        setIsPinRequired(false);

        // CRITICAL: Only trigger "Thank You" if this device was part of the CURRENT PAID session
        const localToken = localStorage.getItem(`sessionToken_${tableParam}`);
        const isSessionMatch = localToken && data.sessionToken && localToken === data.sessionToken;

        if (isSessionMatch) {
          updateTerminalState(true);
        } else {
          if (localToken && data.sessionToken === null) {
            updateTerminalState(true);
          } else {
            updateTerminalState(false);
            fetchTableData(true);
          }
        }
      }
    };

    const handleConnect = () => {
      console.log('Socket connected/reconnected');
      if (tableParam) {
        joinTableRoom(Number(tableParam));
      }
    };

    // Join room immediately on mount/re-register
    if (tableParam) {
      joinTableRoom(Number(tableParam));
    }

    socket.on('connect', handleConnect);
    socket.on('tableStatusChanged', handleTableStatus);
    socket.on('newOrder', handleTableStatus);
    socket.on('store_status_changed', handleStoreStatus);
    socket.on('digitalOrderCancelled', handleCancellation);
    socket.on('paymentConfirmed', handlePaymentConfirmed);

    return () => {
      clearInterval(intervalId);
      socket.off('connect', handleConnect);
      socket.off('tableStatusChanged', handleTableStatus);
      socket.off('newOrder', handleTableStatus);
      socket.off('store_status_changed', handleStoreStatus);
      socket.off('digitalOrderCancelled', handleCancellation);
      socket.off('paymentConfirmed', handlePaymentConfirmed);
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
      <div className={`fixed top-4 left-4 right-4 z-[9999] animate-slide-in`}>
        <div className={`flex items-center justify-between p-4 rounded-2xl shadow-2xl backdrop-blur-md border ${banner.type === 'error' ? 'bg-red-500/90 border-red-400 text-white' : 'bg-white/90 border-slate-200 text-slate-900 shadow-slate-200/50'}`}>
          <div className="flex items-center gap-3">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center ${banner.type === 'error' ? 'bg-white/20' : 'bg-slate-100'}`}>
              <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                {banner.type === 'error' ? (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                )}
              </svg>
            </div>
            <p className="text-sm font-bold uppercase tracking-tight">{banner.message}</p>
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

  if (blockingRejection) {
    return (
      <div className="min-h-screen flex flex-col bg-slate-900 text-white text-center relative overflow-hidden font-sans">
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="max-w-md w-full space-y-10 animate-fade-in animate-zoom-in">
            <div className="relative mx-auto w-32 h-32">
              <div className="absolute inset-0 bg-red-500/20 rounded-full animate-ping"></div>
              <div className="relative w-32 h-32 bg-red-600 rounded-[2.5rem] flex items-center justify-center shadow-2xl shadow-red-500/40">
                <svg xmlns="http://www.w3.org/2000/svg" className="w-16 h-16 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
            </div>
            <div className="space-y-4">
              <h1 className="text-5xl font-black uppercase tracking-tighter leading-none">
                Pedido <br /> <span className="text-red-500">Recusado</span>
              </h1>
              <p className="text-slate-400 text-xl leading-relaxed font-medium px-4">
                {blockingRejection.message}
              </p>
            </div>
            <div className="pt-8 px-6">
              <button
                onClick={async () => {
                  try {
                    if (tableParam) {
                      const data = await acknowledgeRejection(tableParam);
                      // Se a mesa ainda estiver ocupada/em checkout, NÃO resetamos a sessão
                      // Assim o cliente não é expulso e não precisa de PIN
                      if (data.status === 'occupied' || data.status === 'billing') {
                        setBlockingRejection(null);
                        fetchTableData();
                        return;
                      }
                    }
                  } catch (e) {
                    console.error('Ack error:', e);
                  }
                  // Se era uma mesa "available" (apenas digital rejeitado), resetamos
                  localStorage.removeItem(`sessionToken_${tableParam}`);
                  updateTerminalState(false);
                  window.location.reload();
                }}
                className="w-full bg-slate-100 hover:bg-white text-slate-900 font-black py-5 rounded-3xl transition-all shadow-2xl shadow-white/10 uppercase tracking-[0.2em] text-sm active:scale-95"
              >
                OK, Entendi
              </button>
              <p className="mt-8 text-xs text-slate-500 italic leading-relaxed uppercase tracking-[0.2em] font-black opacity-50">
                Se tiver dúvidas, por favor chame um garçom.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (isSessionFinished) {
    return (
      <div className="h-[100dvh] flex flex-col bg-[#0f172a] text-white text-center relative overflow-hidden font-sans">
        {/* Background Decorative Elements */}
        <div className="absolute top-[-10%] left-[-10%] w-64 h-64 bg-emerald-500/10 rounded-full blur-3xl animate-pulse"></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-96 h-96 bg-blue-500/10 rounded-full blur-3xl animate-pulse delay-700"></div>

        {renderBanner()}

        <div className="flex-1 flex items-center justify-center p-4 relative z-10 overflow-y-auto">
          <div className="max-w-md w-full space-y-6 animate-fade-in animate-zoom-in py-4">

            {/* Success Icon Header */}
            <div className="relative mx-auto w-28 h-28">
              <div className="absolute inset-0 bg-emerald-500/20 rounded-full animate-ping"></div>
              <div className="absolute inset-3 bg-emerald-500/30 rounded-full animate-pulse"></div>
              <div className="relative w-28 h-28 bg-gradient-to-br from-emerald-400 to-emerald-600 rounded-[2rem] flex items-center justify-center shadow-[0_15px_40px_rgba(16,185,129,0.3)] rotate-3">
                <svg xmlns="http://www.w3.org/2000/svg" className="w-14 h-14 text-white drop-shadow-lg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                </svg>
              </div>
            </div>

            {/* Main Message */}
            <div className="space-y-3">
              <h1 className="text-5xl font-black uppercase tracking-tighter leading-[0.9] text-transparent bg-clip-text bg-gradient-to-b from-white via-white to-slate-500">
                Muito <br />
                <span className="text-emerald-400">Obrigado!</span>
              </h1>

              <div className="h-1 w-16 bg-emerald-500/40 mx-auto rounded-full"></div>

              <p className="text-slate-300 text-lg leading-tight font-medium px-2">
                Sua conta foi finalizada com sucesso. <br />
                <span className="text-emerald-300/80 italic font-bold">Agradecemos a preferência!</span>
              </p>
            </div>

            {/* Action & Footer */}
            <div className="pt-2 space-y-4">
              <div className="bg-white/5 backdrop-blur-md border border-white/10 p-4 rounded-[1.5rem] shadow-xl">
                <p className="text-xs text-slate-400 font-bold uppercase tracking-widest leading-relaxed">
                  Volte sempre para saborear <br />
                  o que temos de melhor! 🌟
                </p>
              </div>

              <button
                onClick={() => {
                  localStorage.removeItem(`sessionToken_${tableParam}`);
                  updateTerminalState(false);
                  setTableError(null);
                  setBlockingRejection(null);
                  fetchTableData();
                }}
                className="group relative w-full overflow-hidden bg-white text-slate-900 font-black py-5 rounded-[1.5rem] transition-all hover:scale-105 active:scale-95 shadow-[0_15px_30px_rgba(255,255,255,0.1)]"
              >
                <span className="relative z-10 uppercase tracking-[0.2em] text-sm">Voltar ao Início</span>
                <div className="absolute inset-0 bg-gradient-to-r from-emerald-100 to-white opacity-0 group-hover:opacity-100 transition-opacity"></div>
              </button>

              <p className="text-[9px] text-slate-500 uppercase tracking-[0.3em] font-black opacity-40">
                Sistema Fast Delivery &copy; 2026
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (isBilling) {
    return (
      <div className="min-h-screen flex flex-col bg-slate-900 text-white text-center overflow-hidden relative font-sans">
        {renderBanner()}
        <div className="flex-1 flex items-center justify-center p-6">
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
      </div>
    );
  }

  if (isPinRequired) {
    return (
      <div className="min-h-screen flex flex-col bg-slate-900 text-white text-center relative overflow-hidden font-sans">
        {renderBanner()}
        <div className="flex-1 flex items-center justify-center p-6">
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
      </div>
    );
  }

  if (tableError || !tableNumber) {
    return (
      <div className="min-h-screen flex flex-col bg-slate-900 text-white text-center relative overflow-hidden font-sans">
        {renderBanner()}
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="max-w-md w-full space-y-6">
            <div className="w-20 h-20 bg-red-500 rounded-3xl mx-auto flex items-center justify-center rotate-12">
              <span className="text-3xl font-black">X</span>
            </div>
            <h1 className="text-2xl font-black uppercase tracking-tighter">Erro de Acesso</h1>
            <p className="text-slate-400">{tableError || 'Mesa não identificada.'}</p>
          </div>
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
