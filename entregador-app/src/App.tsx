import React, { useState, useEffect, useRef, useMemo } from 'react';
import { DeliveryDriver, Order, OrderStatus, OrderStatusLabels, SaleType, User, Product } from './types';
import { db, BusinessSettings } from './services/db';
import { socket } from './services/socket';
import { Icons } from './constants';

const playNotificationSound = () => {
  try {
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);

    oscillator.type = 'sine';
    // Soft chime-like frequency sequence
    const now = audioContext.currentTime;
    oscillator.frequency.setValueAtTime(880, now);
    oscillator.frequency.exponentialRampToValueAtTime(440, now + 0.5);

    gainNode.gain.setValueAtTime(0, now);
    gainNode.gain.linearRampToValueAtTime(0.1, now + 0.1);
    gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.5);

    oscillator.start(now);
    oscillator.stop(now + 0.5);
  } catch (e) {
    console.error("Audio error:", e);
  }
};

const App: React.FC = () => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loginError, setLoginError] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const [driver, setDriver] = useState<DeliveryDriver | null>(null);
  const [myOrders, setMyOrders] = useState<Order[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [businessSettings, setBusinessSettings] = useState<BusinessSettings | null>(null);
  const [isAlertOpen, setIsAlertOpen] = useState(false);
  const [printingOrder, setPrintingOrder] = useState<Order | null>(null);

  const [activeTab, setActiveTab] = useState<'PENDING' | 'HISTORY' | 'CHAT'>('PENDING');
  const [historyOrders, setHistoryOrders] = useState<Order[]>([]);
  const [historyStartDate, setHistoryStartDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().split('T')[0];
  });
  const [historyEndDate, setHistoryEndDate] = useState(new Date().toISOString().split('T')[0]);
  const [printingHistoryOrder, setPrintingHistoryOrder] = useState<Order | null>(null);
  const [storeStatus, setStoreStatus] = useState<{ status: 'online' | 'offline' }>({ status: 'offline' });

  // Chat states
  const [messages, setMessages] = useState<any[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const chatEndRef = useRef<HTMLDivElement>(null);

  const previousOrderCount = useRef(-1);

  useEffect(() => {
    const user = db.getCurrentUser();
    if (user) {
      setCurrentUser(user);
    }
    setIsLoading(false);
  }, []);

  useEffect(() => {
    if (!currentUser) return;

    refreshData();
    const interval = setInterval(refreshData, 5000);

    socket.on('store_status_changed', (data: any) => {
      setStoreStatus(data);
    });

    return () => {
      clearInterval(interval);
      socket.off('store_status_changed');
      socket.off('new_message');
    };
  }, [currentUser]);

  useEffect(() => {
    if (driver) {
      socket.emit('join_chat', driver.id);
      loadChatHistory();

      socket.on('new_message', (msg: any) => {
        if (msg.driverId === driver.id) {
          setMessages(prev => {
            // Evitar duplicatas se o socket e o polling baterem
            if (prev.find(m => m.id === msg.id)) return prev;
            return [...prev, msg];
          });
        }
      });
    }
  }, [driver]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');
    try {
      const user = await db.login(email, password);
      setCurrentUser(user);
    } catch (err: any) {
      setLoginError(err.message);
    }
  };

  const handleLogout = () => {
    db.logout();
    setCurrentUser(null);
    setDriver(null);
    setMyOrders([]);
  };

  const refreshData = async () => {
    if (!currentUser) return;

    try {
      const currentDriver = await db.getDriverProfile(currentUser.email);
      setDriver(currentDriver);

      const [allOrders, allProds, settings, status] = await Promise.all([
        db.getOrders(),
        db.getProducts(),
        db.getSettings(),
        db.getStoreStatus()
      ]);

      setProducts(allProds);
      setBusinessSettings(settings);
      setStoreStatus(status);

      const driverOrders = allOrders.filter(o =>
        o.type === SaleType.OWN_DELIVERY &&
        (o.status === OrderStatus.OUT_FOR_DELIVERY || o.status === OrderStatus.READY) &&
        o.driverId === currentDriver.id
      ).sort((a, b) => b.createdAt.localeCompare(a.createdAt));

      setMyOrders(driverOrders);

      const histOrders = allOrders.filter(o =>
        o.type === SaleType.OWN_DELIVERY &&
        o.status === OrderStatus.DELIVERED &&
        o.driverId === currentDriver.id
      ).sort((a, b) => b.createdAt.localeCompare(a.createdAt));

      setHistoryOrders(histOrders);

      if (previousOrderCount.current > -1 && driverOrders.length > previousOrderCount.current) {
        setIsAlertOpen(true);
        playNotificationSound();
      }
      previousOrderCount.current = driverOrders.length;
    } catch (e) {
      console.error("Erro ao atualizar dados:", e);
    }
  };

  // Auto-rejection logic: 5 minutes
  useEffect(() => {
    const interval = setInterval(() => {
      const now = new Date();
      myOrders.forEach(order => {
        if (order.status === OrderStatus.READY) {
          // Use assignedAt for precise timing, fallback to createdAt
          const referenceTime = order.assignedAt ? new Date(order.assignedAt) : new Date(order.createdAt);
          const diffInMinutes = (now.getTime() - referenceTime.getTime()) / 60000;
          if (diffInMinutes >= 5) {
            console.log(`Auto-rejecting order ${order.id} due to timeout (5 mins since assignment)`);
            updateDeliveryStatus(order.id, OrderStatus.READY, ''); // DriverId '' means null/unassigned
          }
        }
      });
    }, 10000); // Check every 10 seconds

    return () => clearInterval(interval);
  }, [myOrders]);

  const loadChatHistory = async () => {
    if (!driver) return;
    try {
      const history = await db.getChatHistory(driver.id);
      setMessages(history);
    } catch (e) {
      console.error("Erro ao carregar chat:", e);
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !driver || !currentUser) return;

    const msgData = {
      driverId: driver.id,
      content: newMessage,
      senderName: driver.name,
      isFromDriver: true
    };

    try {
      const savedMsg = await db.sendChatMessage(msgData);
      socket.emit('send_message', savedMsg);
      setNewMessage('');
    } catch (e) {
      console.error("Erro ao enviar mensagem:", e);
    }
  };

  const updateDeliveryStatus = async (orderId: string, status: OrderStatus, forceDriverId?: string | null) => {
    if (!currentUser) return;
    // Fix: Allow empty string to pass through for de-assignment
    await db.updateOrderStatus(orderId, status, currentUser, forceDriverId === undefined ? undefined : (forceDriverId as string));
    refreshData();
  };

  const groupedPrintingItems = useMemo(() => {
    if (!printingOrder) return [];
    const grouped: Record<string, { name: string, quantity: number, price: number }> = {};
    printingOrder.items.forEach(item => {
      const prod = products.find(p => p.id === item.productId);
      if (!grouped[item.productId]) {
        grouped[item.productId] = {
          name: prod?.name || '...',
          quantity: 0,
          price: item.price
        };
      }
      grouped[item.productId].quantity += item.quantity;
    });
    return Object.entries(grouped);
  }, [printingOrder, products]);

  const deliveryFeeValue = useMemo(() => {
    if (!businessSettings?.phone) return 0; // Mock check
    return 8.00; // Default Fee
  }, [businessSettings]);

  if (isLoading) return null;

  if (!currentUser) {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-6 select-none">
        <div className="w-24 h-24 bg-blue-600 rounded-3xl flex items-center justify-center shadow-2xl shadow-blue-500/20 transform -rotate-12 mb-8">
          <span className="text-white text-4xl font-black">DA</span>
        </div>
        <div className="w-full max-w-md bg-white p-10 rounded-[2.5rem] shadow-2xl">
          <h2 className="text-3xl font-black text-slate-900 tracking-tighter mb-2">DRIVER APP</h2>
          <p className="text-slate-400 font-bold uppercase text-[10px] tracking-widest mb-8">Acesso restrito para entregadores</p>

          <form onSubmit={handleLogin} className="space-y-6">
            <div className="space-y-2">
              <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1">E-mail</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="w-full bg-slate-50 border-none rounded-2xl px-6 py-4 text-sm font-bold focus:ring-4 focus:ring-blue-500/10 transition-all outline-none"
                placeholder="seu@email.com"
                required
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1">Senha</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="w-full bg-slate-50 border-none rounded-2xl px-6 py-4 text-sm font-bold focus:ring-4 focus:ring-blue-500/10 transition-all outline-none"
                placeholder="••••••••"
                required
              />
            </div>
            {loginError && <p className="text-xs font-black text-red-500 uppercase text-center">{loginError}</p>}
            <button
              type="submit"
              className="w-full bg-blue-600 text-white py-5 rounded-2xl font-black uppercase text-xs tracking-widest shadow-xl shadow-blue-500/20 active:scale-95 transition-all mt-4"
            >
              Entrar no Sistema
            </button>
          </form>
        </div>
        <p className="mt-8 text-slate-600 text-[10px] font-black uppercase tracking-[0.3em]">Fransoft Developer®</p>
      </div>
    );
  }

  if (!driver) {
    return (
      <div className="flex flex-col items-center justify-center h-screen p-8 text-center bg-slate-50 select-none">
        <div className="w-24 h-24 bg-white rounded-full shadow-xl flex items-center justify-center mb-6">
          <Icons.Alert className="w-12 h-12 text-blue-500" />
        </div>
        <h2 className="text-2xl font-black text-slate-800 uppercase tracking-tight mb-2">Acesso Restrito</h2>
        <p className="text-slate-500 text-sm max-w-xs leading-relaxed mb-8">
          Sua conta (<span className="font-bold text-slate-700">{currentUser.email}</span>) não está vinculada a um entregador.
        </p>
        <button onClick={handleLogout} className="px-8 py-4 bg-slate-900 text-white rounded-2xl font-black uppercase text-xs tracking-widest shadow-xl active:scale-95 transition-all">Sair</button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[100dvh] bg-slate-50 overflow-hidden select-none">
      {/* NOVELTY ALERT */}
      {isAlertOpen && (
        <div className="fixed top-6 left-6 right-6 z-[100] bg-blue-600 text-white p-6 rounded-[2rem] shadow-2xl flex items-center gap-4 animate-in slide-in-from-top duration-500">
          <div className="w-12 h-12 bg-white/20 rounded-2xl flex items-center justify-center shrink-0">
            <Icons.Alert className="w-6 h-6" />
          </div>
          <div className="flex-1">
            <h4 className="font-black text-sm uppercase tracking-tight">NOVA ENTREGA!</h4>
            <p className="text-[10px] font-bold opacity-80 uppercase leading-tight">Você recebeu uma nova rota de entrega.</p>
          </div>
          <button onClick={() => setIsAlertOpen(false)} className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center">
            <Icons.Check className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* HEADER COMPACTO */}
      <header className="bg-white px-6 py-4 flex justify-between items-center shadow-sm z-20 border-b border-slate-100 shrink-0">
        <div className="flex flex-col">
          <h1 className="text-xl font-black text-slate-900 tracking-tighter leading-none">DRIVER <span className="text-blue-600">APP</span></h1>
          <div className="flex items-center gap-1.5 mt-1">
            <div className={`w-1.5 h-1.5 rounded-full ${storeStatus.status === 'online' ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'}`} />
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Loja {storeStatus.status === 'online' ? 'Aberta' : 'Fechada'}</span>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex flex-col items-end">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-0.5">Olá,</span>
            <span className="text-sm font-black text-slate-800">{driver.name.split(' ')[0]}</span>
          </div>
          <button onClick={handleLogout} className="p-2 text-slate-300 hover:text-red-500 transition-all">
            <Icons.SignOut className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* CONTEÚDO PRINCIPAL */}
      <main className="flex-1 overflow-y-auto p-4 pb-24 relative custom-scrollbar">
        {activeTab === 'PENDING' && (
          <div className="flex flex-col gap-4 animate-in slide-in-from-right duration-300">
            {/* RESUMO DE HOJE */}
            <div className="bg-slate-900 p-6 rounded-[2.5rem] shadow-xl shadow-slate-200 mb-2 relative overflow-hidden group">
              <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/10 rounded-full -mr-16 -mt-16 blur-3xl group-hover:bg-blue-500/20 transition-all duration-700" />
              <div className="relative flex justify-between items-center">
                <div>
                  <h3 className="text-blue-400 text-[10px] font-black uppercase tracking-[0.2em] mb-1">Entregas de Hoje</h3>
                  <div className="flex items-baseline gap-2">
                    <span className="text-4xl font-black text-white">
                      {historyOrders.filter(o => {
                        const orderDate = new Date(o.createdAt).toLocaleDateString('en-CA'); // YYYY-MM-DD format regardless of TZ
                        const todayDate = new Date().toLocaleDateString('en-CA');
                        return orderDate === todayDate;
                      }).length}
                    </span>
                    <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Concluídas</span>
                  </div>
                </div>
                <button
                  onClick={() => setActiveTab('HISTORY')}
                  className="bg-white/10 hover:bg-white/20 text-white px-5 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all backdrop-blur-md border border-white/10 active:scale-95"
                >
                  Ver Histórico
                </button>
              </div>
            </div>

            <div className="flex justify-between items-center mb-1 mt-2">
              <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest pl-1">Entregas Pendentes ({myOrders.length})</h3>
            </div>
            {myOrders.length > 0 ? myOrders.map(order => (
              <div key={order.id} className="bg-white p-5 rounded-[2rem] shadow-sm border border-slate-100 flex flex-col gap-4 active:scale-[0.98] transition-all">
                <div className="flex justify-between items-start">
                  <div>
                    <span className="text-[10px] font-black text-blue-600 uppercase tracking-widest">Pedido #{order.id.split('-')[1] || order.id}</span>
                    <h4 className="text-lg font-black text-slate-800 leading-tight mt-0.5">{order.clientName}</h4>
                  </div>
                  <div className={`px-4 py-1.5 rounded-full text-[9px] font-black uppercase text-white shadow-lg ${order.status === OrderStatus.READY ? 'bg-amber-500' : 'bg-blue-600'}`}>
                    {OrderStatusLabels[order.status]}
                  </div>
                </div>

                <div className="bg-slate-50/80 p-4 rounded-2xl flex flex-col gap-1 border border-slate-100">
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <Icons.Logistics className="w-3.5 h-3.5 text-blue-500" />
                      <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Destino do Pedido</span>
                    </div>
                    {order.clientPhone && (
                      <a
                        href={`tel:${order.clientPhone}`}
                        className="p-2 bg-white rounded-xl shadow-sm border border-slate-100 text-blue-600 hover:scale-110 active:scale-95 transition-all"
                        title="Ligar para o Cliente"
                      >
                        <Icons.Chat className="w-3.5 h-3.5" />
                      </a>
                    )}
                  </div>
                  <p className="text-xs font-bold text-slate-700 leading-snug mb-2">{order.clientAddress}</p>

                  <div className="flex items-center gap-3 mt-1">
                    <a
                      href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(order.clientAddress || '')}`}
                      target="_blank" rel="noopener noreferrer"
                      className="text-[10px] font-black text-blue-600 uppercase hover:underline inline-flex items-center gap-1"
                    >
                      Abrir no GPS <Icons.Map className="w-3 h-3" />
                    </a>
                    {order.clientPhone && (
                      <a
                        href={`tel:${order.clientPhone}`}
                        className="text-[10px] font-black text-emerald-600 uppercase hover:underline inline-flex items-center gap-1"
                      >
                        Ligar para Cliente <Icons.Chat className="w-3 h-3" />
                      </a>
                    )}
                  </div>
                </div>

                <div className="flex justify-between items-center pt-2">
                  <div className="flex flex-col">
                    <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Total</span>
                    <span className="text-xl font-black text-slate-900">R$ {order.total.toFixed(2)}</span>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => setPrintingOrder(order)} className="p-3 bg-slate-900 text-white rounded-2xl shadow-xl active:scale-90 transition-all">
                      <Icons.Print className="w-5 h-5" />
                    </button>
                    {order.status === OrderStatus.READY ? (
                      <div className="flex gap-2">
                        <button
                          onClick={() => updateDeliveryStatus(order.id, OrderStatus.READY, '')}
                          className="px-4 py-3 bg-slate-100 text-slate-500 rounded-2xl font-black uppercase text-[10px] tracking-widest active:scale-95 transition-all"
                        >
                          Rejeitar
                        </button>
                        <button
                          onClick={() => updateDeliveryStatus(order.id, OrderStatus.OUT_FOR_DELIVERY, driver.id)}
                          className="px-6 py-3 bg-blue-600 text-white rounded-2xl font-black uppercase text-[10px] tracking-widest shadow-xl shadow-blue-500/30 active:scale-95 transition-all"
                        >
                          Aceitar
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => updateDeliveryStatus(order.id, OrderStatus.DELIVERED)}
                        className="px-6 py-3 bg-emerald-500 text-white rounded-2xl font-black uppercase text-[10px] tracking-widest shadow-xl shadow-emerald-500/30 active:scale-95 transition-all"
                      >
                        Finalizar
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )) : (
              <div className="flex flex-col items-center justify-center py-20 bg-white rounded-[3rem] border border-dashed border-slate-200">
                <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mb-4">
                  <Icons.Logistics className="w-8 h-8 text-slate-300" />
                </div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Nenhuma entrega pendente</p>
              </div>
            )}
          </div>
        )}

        {activeTab === 'HISTORY' && (
          <div className="flex flex-col gap-4 animate-in slide-in-from-right duration-300">
            <div className="bg-white p-4 rounded-3xl shadow-sm border border-slate-100 flex gap-3 mb-2 overflow-x-auto custom-scrollbar shrink-0">
              <div className="flex-1 min-w-[120px]">
                <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Início</span>
                <input type="date" value={historyStartDate} onChange={e => setHistoryStartDate(e.target.value)} className="w-full p-3 bg-slate-50 rounded-xl text-xs font-bold border-none" />
              </div>
              <div className="flex-1 min-w-[120px]">
                <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Fim</span>
                <input type="date" value={historyEndDate} onChange={e => setHistoryEndDate(e.target.value)} className="w-full p-3 bg-slate-50 rounded-xl text-xs font-bold border-none" />
              </div>
            </div>
            {historyOrders.filter(o => {
              const date = o.createdAt.split('T')[0];
              return date >= historyStartDate && date <= historyEndDate;
            }).map(order => (
              <div key={order.id} className="bg-white p-5 rounded-[2rem] shadow-sm border border-slate-50 flex flex-col gap-3 group">
                <div className="flex justify-between items-center">
                  <div>
                    <h5 className="text-sm font-black text-slate-800 uppercase leading-none">{order.clientName}</h5>
                    <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{new Date(order.createdAt).toLocaleDateString('pt-BR')}</span>
                  </div>
                  <button onClick={() => setPrintingHistoryOrder(order)} className="p-2.5 bg-slate-50 text-slate-400 hover:text-blue-600 rounded-xl transition-all">
                    <Icons.Print className="w-4 h-4" />
                  </button>
                </div>
                <div className="flex justify-between items-center border-t border-slate-50 pt-2">
                  <span className="text-[10px] font-bold text-emerald-500 uppercase tracking-widest flex items-center gap-1">
                    <div className="w-1 h-1 bg-emerald-500 rounded-full" /> Finalizada
                  </span>
                  <span className="text-sm font-black text-slate-800">R$ {order.total.toFixed(2)}</span>
                </div>
              </div>
            ))}
          </div>
        )}

        {activeTab === 'CHAT' && (
          <div className="flex flex-col h-full min-h-[400px] bg-white rounded-[2rem] shadow-sm border border-slate-100 overflow-hidden animate-in slide-in-from-right duration-300">
            <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
              <h3 className="text-xs font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
                <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" /> Suporte Logística
              </h3>
            </div>
            <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3 custom-scrollbar">
              {messages.length === 0 && (
                <div className="flex flex-col items-center justify-center py-12 opacity-30">
                  <Icons.Dashboard className="w-12 h-12 mb-4" />
                  <p className="text-[10px] font-black uppercase tracking-widest">Inicie um diálogo com a base</p>
                </div>
              )}
              {messages.map((msg, i) => (
                <div key={msg.id || i} className={`flex ${msg.isFromDriver ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[80%] p-4 rounded-3xl shadow-sm text-sm ${msg.isFromDriver ? 'bg-blue-600 text-white rounded-tr-none' : 'bg-slate-100 text-slate-800 rounded-tl-none'}`}>
                    <p className="font-bold mb-0.5">{msg.content}</p>
                    <span className={`text-[9px] uppercase font-black tracking-widest opacity-60 block mt-1 ${msg.isFromDriver ? 'text-right' : 'text-left'}`}>
                      {new Date(msg.timestamp).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                </div>
              ))}
              <div ref={chatEndRef} />
            </div>
            <form onSubmit={handleSendMessage} className="p-3 bg-white border-t border-slate-100 flex gap-2">
              <input
                type="text" value={newMessage}
                onChange={e => setNewMessage(e.target.value)}
                placeholder="Sua mensagem..."
                className="flex-1 bg-slate-50 border-none rounded-2xl px-4 text-sm font-bold focus:ring-2 focus:ring-blue-500/20 transition-all outline-none"
              />
              <button type="submit" className="w-12 h-12 bg-blue-600 text-white rounded-2xl shadow-lg shadow-blue-500/30 flex items-center justify-center active:scale-90 transition-all">
                <Icons.Send className="w-5 h-5 -rotate-12" />
              </button>
            </form>
          </div>
        )}
      </main>

      {/* NAVIGATION BAR - MOBILE STYLE - FIXED AT BOTTOM */}
      <nav className="shrink-0 bg-white/95 backdrop-blur-xl border-t border-slate-100 px-6 py-4 flex justify-between items-center z-30 shadow-[0_-10px_30px_-15px_rgba(0,0,0,0.1)] pb-safe">
        <button
          onClick={() => setActiveTab('PENDING')}
          className={`flex flex-col items-center gap-1 transition-all ${activeTab === 'PENDING' ? 'text-blue-600 scale-110' : 'text-slate-300'}`}
        >
          <Icons.Logistics className="w-6 h-6" />
          <span className="text-[9px] font-black uppercase tracking-widest">Início</span>
        </button>
        <button
          onClick={() => setActiveTab('CHAT')}
          className={`flex flex-col items-center gap-1 transition-all relative ${activeTab === 'CHAT' ? 'text-blue-600 scale-110' : 'text-slate-300'}`}
        >
          <Icons.Chat className="w-6 h-6" />
          <span className="text-[9px] font-black uppercase tracking-widest">Chat</span>
        </button>
        <button
          onClick={() => setActiveTab('HISTORY')}
          className={`flex flex-col items-center gap-1 transition-all ${activeTab === 'HISTORY' ? 'text-blue-600 scale-110' : 'text-slate-300'}`}
        >
          <Icons.History className="w-6 h-6" />
          <span className="text-[9px] font-black uppercase tracking-widest">Histórico</span>
        </button>
      </nav>

      {/* MODALS DE IMPRESSÃO - REUTILIZADOS MAS ESTILIZADOS */}
      {printingOrder && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-md animate-in fade-in duration-200" onClick={() => setPrintingOrder(null)}>
          <div className="relative w-full max-w-sm bg-white p-6 rounded-[2.5rem] shadow-2xl overflow-hidden font-receipt" onClick={e => e.stopPropagation()}>
            <div className="text-center mb-6 pb-4 border-b border-dashed border-slate-200">
              <h2 className="font-black text-lg uppercase tracking-tight">PEDIDO #{printingOrder.id.split('-')[1] || printingOrder.id}</h2>
              <p className="text-[10px] font-black text-slate-400 mt-1 uppercase tracking-widest">Resumo de Entrega</p>
            </div>
            <div className="flex flex-col gap-1 mb-4 text-xs font-bold text-slate-800">
              <p>CLIENTE: {printingOrder.clientName}</p>
              <p className="leading-tight mt-1 bg-slate-50 p-3 rounded-xl border border-slate-100">DESTINO: {printingOrder.clientAddress}</p>
            </div>
            <div className="border-y border-dashed border-slate-200 py-3 mb-4 max-h-40 overflow-y-auto custom-scrollbar">
              {groupedPrintingItems.map(([id, data]) => (
                <div key={id} className="flex justify-between items-center py-0.5">
                  <span className="text-[11px] font-black">{data.quantity}x {data.name}</span>
                  <span className="text-[11px] font-black">R$ {(data.quantity * data.price).toFixed(2)}</span>
                </div>
              ))}
            </div>
            <div className="flex justify-between items-center mb-6 px-1 text-[10px] font-black uppercase tracking-widest text-slate-400">
              <span>TAXA ENTREGA:</span>
              <span className="text-slate-900">R$ {deliveryFeeValue.toFixed(2)}</span>
            </div>
            <div className="flex justify-between items-end mb-8 px-1">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none">VALOR FINAL:</span>
              <span className="text-2xl font-black text-blue-600 leading-none">R$ {printingOrder.total.toFixed(2)}</span>
            </div>
            <button onClick={() => setPrintingOrder(null)} className="w-full py-4 bg-slate-100 text-slate-600 rounded-2xl font-black uppercase text-xs tracking-widest hover:bg-slate-200 transition-all">Fechar visualização</button>
          </div>
        </div>
      )}

      {printingHistoryOrder && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-md animate-in fade-in duration-200" onClick={() => setPrintingHistoryOrder(null)}>
          <div className="relative w-full max-w-[80mm] bg-white p-8 border border-dashed shadow-2xl font-receipt text-[11px] text-black print-container is-receipt" onClick={e => e.stopPropagation()}>
            <div className="text-center mb-6 border-b border-dashed pb-4">
              <h2 className="font-black text-sm uppercase tracking-tighter">ESTABELECIMENTO</h2>
              <p className="text-[9px] font-bold mt-1 uppercase">Cópia de Comprovante</p>
            </div>
            <div className="space-y-1 mb-4">
              <p>DATA: {new Date(printingHistoryOrder.createdAt).toLocaleString('pt-BR')}</p>
              <p>CLIENTE: {printingHistoryOrder.clientName}</p>
              {printingHistoryOrder.clientAddress && (
                <p className="font-bold border-t border-dashed mt-2 pt-1 uppercase leading-tight">ENTREGA: {printingHistoryOrder.clientAddress}</p>
              )}
              <p className="font-bold border-t border-dashed mt-2 pt-1 uppercase">ENTREGADOR: {driver.name}</p>
            </div>
            <div className="flex justify-between items-center border-t border-dashed pt-4 mb-2 text-[10px] uppercase font-black">
              <span>Taxa Entrega:</span>
              <span>R$ {deliveryFeeValue.toFixed(2)}</span>
            </div>
            <div className="flex justify-between items-end border-t border-dashed pt-4 mb-6">
              <span className="font-black text-[9px] uppercase tracking-widest">TOTAL:</span>
              <span className="text-2xl font-black">R$ {printingHistoryOrder.total.toFixed(2)}</span>
            </div>
            <div className="flex gap-2 no-print">
              <button onClick={() => window.print()} className="flex-1 bg-slate-900 text-white py-4 rounded-2xl font-black uppercase text-[10px] shadow-xl">Imprimir</button>
              <button onClick={() => setPrintingHistoryOrder(null)} className="flex-1 bg-slate-100 text-slate-600 py-4 rounded-2xl font-black uppercase text-[10px]">Fechar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
