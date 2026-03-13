import React, { useState, useEffect } from 'react';
import Login from './components/Login';
import TableDetails from './components/TableDetails';
import DirectOrderModal from './components/DirectOrderModal';
import type { User, TableSession, StoreStatus, Order, BusinessSettings } from './types';
import { db, socket } from './api';
import { LogOut, LayoutGrid, RefreshCw, PlusCircle, MessageSquare, History, AlertCircle, X } from 'lucide-react';
import Modal from './components/Modal';
import HistoryModal from './components/HistoryModal';
import PrivacyScreen from './components/PrivacyScreen';

const Dashboard: React.FC<{ user: User }> = ({ user }) => {
  const [tables, setTables] = useState<TableSession[]>([]);
  const [tableCount, setTableCount] = useState(0);
  const [settings, setSettings] = useState<BusinessSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedTable, setSelectedTable] = useState<TableSession | null>(null);
  const [showDirectOrder, setShowDirectOrder] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [feedbacks, setFeedbacks] = useState<any[]>([]);
  const [showFeedbacks, setShowFeedbacks] = useState(false);
  const [hasNewFeedback, setHasNewFeedback] = useState(false);
  const [storeStatus, setStoreStatus] = useState<StoreStatus>({ status: 'online', is_manually_closed: false, next_status_change: null, enableDigitalMenu: true });
  const [countdown, setCountdown] = useState<string | null>(null);
  const [recentOrders, setRecentOrders] = useState<Order[]>([]);
  const [resolvedWaiterId, setResolvedWaiterId] = useState<string | null>(user.waiterId || null);

  // Privacy Screen States
  const [isLocked, setIsLocked] = useState(false);
  const [lastActivity, setLastActivity] = useState<number>(Date.now());

  const fetchStatus = async () => {
    try {
      const status = await db.getStoreStatus();
      setStoreStatus(status);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    const resolveWaiter = async () => {
      if (!user.waiterId) {
        try {
          const waiters = await db.getWaiters();
          const match = waiters.find(w => w.email?.toLowerCase() === user.email.toLowerCase());
          if (match) setResolvedWaiterId(match.id);
        } catch (e) {
          console.error('Error resolving waiter:', e);
        }
      }
    };
    resolveWaiter();
  }, [user.email, user.waiterId]);

  const fetchOrders = async () => {
    try {
      const orders = await db.getOrders();
      // Filter by current waiter
      const targetId = resolvedWaiterId || user.waiterId || user.id;
      const userOrders = orders.filter(o =>
        o.waiterId === targetId ||
        o.waiterId === user.id ||
        o.waiter?.email?.toLowerCase() === user.email.toLowerCase()
      );
      setRecentOrders(userOrders);
    } catch (e) {
      console.error(e);
    }
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      // First fetch settings if not already fetched
      if (!settings) {
        const s = await db.getSettings();
        setSettings(s);
        setTableCount(s.tableCount);
      }

      const activeSessions = await db.getTables();
      setTables(activeSessions);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  // Synchronize selectedTable details whenever 'tables' state changes (Socket or Manual)
  useEffect(() => {
    if (selectedTable) {
      const updated = tables.find(t => t.tableNumber === selectedTable.tableNumber);
      if (updated) {
        setSelectedTable(updated);
      } else {
        // If not in active sessions anymore, it's available (or closed)
        // Check if it's currently open as 'billing' or 'occupied' to avoid flickering on first load
        if (selectedTable.status !== 'available') {
          setSelectedTable({
            tableNumber: selectedTable.tableNumber,
            status: 'available',
            items: [],
            startTime: new Date().toISOString()
          } as any);
        }
      }
    }
  }, [tables]);

  const fetchFeedbacks = async () => {
    try {
      const fb = await db.getFeedbacks();
      setFeedbacks(fb);
    } catch (e) {
      console.error('Error fetching feedbacks', e);
    }
  };

  useEffect(() => {
    fetchData();
    fetchStatus();
    fetchOrders();

    socket.on('tableStatusChanged', (data) => {
      console.log('Real-time table update:', data);
      fetchData();
    });
    socket.on('newOrder', (data) => {
      console.log('Real-time new order:', data);
      fetchData();
      fetchOrders();
    });
    socket.on('orderStatusUpdated', (data) => {
      console.log('Real-time order status update (legacy):', data);
      fetchData();
    });
    socket.on('orderStatusChanged', (data) => {
      console.log('Real-time order status change:', data);
      fetchData();
    });
    socket.on('store_status_changed', (status: StoreStatus) => setStoreStatus(status));

    const handleNewFeedback = (feedback: any) => {
      setFeedbacks(prev => [feedback, ...prev]);
      setHasNewFeedback(true);
    };
    socket.on('newFeedback', handleNewFeedback);
    fetchFeedbacks();

    const interval = setInterval(() => {
      fetchStatus();
    }, 30000);

    return () => {
      socket.off('tableStatusChanged');
      socket.off('newOrder');
      socket.off('orderStatusUpdated');
      socket.off('store_status_changed');
      socket.off('newFeedback');
      clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    fetchOrders();
  }, [resolvedWaiterId]);

  useEffect(() => {
    if (storeStatus.status === 'online' && storeStatus.next_status_change) {
      const updateCountdown = () => {
        const diffMs = new Date(storeStatus.next_status_change!).getTime() - new Date().getTime();
        if (diffMs > 0 && diffMs <= 30 * 60 * 1000) {
          const mins = Math.floor(diffMs / 60000);
          const secs = Math.floor((diffMs % 60000) / 1000);
          setCountdown(`${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`);
        } else {
          setCountdown(null);
        }
      };
      updateCountdown();
      const interval = setInterval(updateCountdown, 1000);
      return () => clearInterval(interval);
    } else {
      setCountdown(null);
    }
  }, [storeStatus]);

  // Activity Tracker for Privacy Screen
  useEffect(() => {
    const handleActivity = () => setLastActivity(Date.now());

    // Attach event listeners
    window.addEventListener('mousemove', handleActivity);
    window.addEventListener('keydown', handleActivity);
    window.addEventListener('click', handleActivity);
    window.addEventListener('touchstart', handleActivity);

    // Initial check loop
    const privacyInterval = setInterval(() => {
      if (!settings?.waiterPrivacyEnabled || isLocked) return;

      const now = Date.now();
      const idleTime = now - lastActivity;
      const maxIdleTime = (settings?.waiterPrivacyTimer || 60) * 1000;

      if (idleTime > maxIdleTime) {
        setIsLocked(true);
      }
    }, 1000);

    return () => {
      window.removeEventListener('mousemove', handleActivity);
      window.removeEventListener('keydown', handleActivity);
      window.removeEventListener('click', handleActivity);
      window.removeEventListener('touchstart', handleActivity);
      clearInterval(privacyInterval);
    };
  }, [lastActivity, settings?.waiterPrivacyEnabled, settings?.waiterPrivacyTimer, isLocked]);

  const getStatusStyle = (status: TableSession['status']) => {
    switch (status) {
      case 'available': return 'bg-emerald-50 text-emerald-600 border-emerald-100';
      case 'occupied': return 'bg-red-50 text-red-600 border-red-100';
      case 'billing': return 'bg-orange-50 text-orange-600 border-orange-100';
      case 'pending_digital': return 'bg-purple-50 text-purple-600 border-purple-100 animate-pulse-subtle';
      default: return 'bg-slate-50 text-slate-400 border-slate-100';
    }
  };

  // Generate full grid based on tableCount
  const fullTableGrid = Array.from({ length: tableCount }, (_, i) => {
    const tableNum = i + 1;
    const session = tables.find(t => t.tableNumber === tableNum);
    return session || {
      tableNumber: tableNum,
      status: 'available' as const,
      items: [],
      startTime: '',
      hasPendingDigital: false
    };
  });

  if (settings && settings.enableWaiterApp === false) {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-8 text-center select-none">
        <div className="w-24 h-24 bg-rose-600 rounded-3xl flex items-center justify-center shadow-2xl shadow-rose-500/20 transform -rotate-12 mb-8 animate-bounce">
          <span className="text-white text-4xl font-black">!</span>
        </div>
        <h1 className="text-3xl font-black text-white tracking-tighter uppercase mb-4">Módulo Desativado</h1>
        <p className="text-slate-400 font-bold uppercase text-[10px] tracking-widest leading-relaxed max-w-xs">
          O acesso ao aplicativo de garçons foi desativado nas configurações do estabelecimento.
        </p>
        <div className="mt-12 h-1 w-12 bg-rose-600 rounded-full"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans flex flex-col">
      {isLocked && <PrivacyScreen user={user as any} onUnlock={() => { setIsLocked(false); setLastActivity(Date.now()); }} />}

      {/* Store Status Banner */}
      {(storeStatus.status === 'offline' || countdown !== null) && (
        <div className={`px-6 py-2 text-[10px] font-black uppercase tracking-widest text-white sticky top-0 z-[50] animate-in slide-in-from-top duration-300 text-center ${storeStatus.status === 'offline' ? 'bg-rose-600/90 backdrop-blur-md' : 'bg-orange-500/90 backdrop-blur-md'}`}>
          {storeStatus.status === 'offline'
            ? (storeStatus.is_manually_closed ? 'Loja Fechada Temporariamente' : 'Loja Fora do Horário de Funcionamento')
            : `Atenção: A loja fechará em ${countdown} minutos!`
          }
        </div>
      )}

      {/* Header */}
      <header className={`px-4 sm:px-6 pt-10 pb-4 bg-white sticky ${storeStatus.status === 'offline' || countdown !== null ? 'top-[30px]' : 'top-0'} z-40 flex items-center justify-between gap-2 sm:gap-4 border-b border-slate-100 shadow-sm overflow-hidden`}>
        <div className="flex items-center gap-2 sm:gap-4 flex-1 min-w-0">
          <div
            className="w-9 h-9 sm:w-10 sm:h-10 shrink-0 overflow-hidden rounded-xl flex items-center justify-center shadow-lg shadow-blue-500/20 cursor-pointer active:scale-90 transition-transform"
            onClick={() => setIsLocked(true)}
            title="Bloquear Tela"
          >
            <img src="/favicon.png" alt="Logo" className="w-full h-full object-cover" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 min-w-0">
              <h1 className="text-sm font-black text-slate-900 uppercase tracking-tighter truncate">GARÇOM APP</h1>
              <div className={`shrink-0 flex items-center gap-1 px-1.5 py-0.5 rounded-full ${storeStatus.status === 'online' ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-600'}`}>
                <div className={`w-1 h-1 rounded-full ${storeStatus.status === 'online' ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'}`}></div>
                <span className="text-[7px] sm:text-[8px] font-black uppercase tracking-widest">{storeStatus.status === 'online' ? 'On' : 'Off'}</span>
              </div>
            </div>
            <p className="text-[9px] sm:text-[10px] font-bold text-slate-400 uppercase tracking-widest truncate">{user.name.split(' ')[0]} • DF Service</p>
          </div>
          {tables.some(t => {
            if (!t.hasPendingDigital) return false;
            try {
              const parsed = JSON.parse(t.pendingReviewItems || '');
              return !(parsed && typeof parsed === 'object' && !Array.isArray(parsed) && parsed.rejection);
            } catch (e) {
              return !t.pendingReviewItems?.startsWith('REJECTED:');
            }
          }) && (
              <div className="flex items-center justify-center w-8 h-8 sm:w-10 sm:h-10 bg-amber-500 text-white rounded-xl sm:rounded-2xl animate-bounce shadow-lg shadow-amber-500/20 shrink-0">
                <AlertCircle size={20} className="animate-pulse" />
              </div>
            )}
        </div>
        <div className="flex gap-1.5 sm:gap-2 shrink-0">
          <button
            onClick={() => { setShowFeedbacks(true); setHasNewFeedback(false); }}
            className={`p-2.5 sm:p-3 border rounded-xl sm:rounded-2xl transition-colors active:scale-90 relative ${hasNewFeedback ? 'bg-indigo-600 border-indigo-700 text-white shadow-lg shadow-indigo-200 animate-pulse' : 'bg-slate-50 border-slate-100 text-slate-400 hover:text-blue-600'}`}
          >
            <MessageSquare size={18} />
            {hasNewFeedback && <span className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full border-2 border-white animate-ping"></span>}
          </button>
          <button
            onClick={() => window.location.reload()}
            className="p-2.5 sm:p-3 bg-blue-50 border border-blue-100 rounded-xl sm:rounded-2xl text-blue-600 hover:bg-blue-100 transition-colors active:scale-90"
            title="Recarregar App (F5)"
          >
            <RefreshCw size={18} />
          </button>
          <button
            onClick={() => setShowLogoutModal(true)}
            className="p-2.5 sm:p-3 bg-red-50 border border-red-100 rounded-xl sm:rounded-2xl text-red-500 hover:bg-red-100 transition-colors active:scale-90"
          >
            <LogOut size={18} />
          </button>
        </div>
      </header>


      {/* Stats / Filter Bar */}
      <div className="px-6 pt-6 flex gap-2 overflow-x-auto hide-scrollbar">
        <div className="shrink-0 px-4 py-2 bg-white rounded-xl border border-slate-100 shadow-sm flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
          <span className="text-[10px] font-black uppercase text-slate-600">Livre</span>
        </div>
        <div className="shrink-0 px-4 py-2 bg-white rounded-xl border border-slate-100 shadow-sm flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-purple-500"></div>
          <span className="text-[10px] font-black uppercase text-slate-600">App Digital</span>
        </div>
        <div className="shrink-0 px-4 py-2 bg-white rounded-xl border border-slate-100 shadow-sm flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-red-500"></div>
          <span className="text-[10px] font-black uppercase text-slate-600">Ocupada</span>
        </div>
        <div className="shrink-0 px-4 py-2 bg-white rounded-xl border border-slate-100 shadow-sm flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-orange-500"></div>
          <span className="text-[10px] font-black uppercase text-slate-600">Checkout</span>
        </div>
      </div>

      {/* Table Grid */}
      <main className="flex-1 p-6">
        {loading && tableCount === 0 ? (
          <div className="h-64 flex flex-col items-center justify-center text-slate-300 font-black uppercase text-[10px] tracking-widest italic animate-pulse">
            <LayoutGrid size={48} className="mb-4 opacity-20" />
            Sincronizando...
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4">
            {fullTableGrid.map(table => (
              <button
                key={table.tableNumber}
                onClick={() => {
                  if (storeStatus.status === 'offline' && table.status === 'available') {
                    return; // Prevent opening new tables if offline
                  }
                  setSelectedTable(table as any);
                }}
                className={`aspect-[4/3] flex flex-col items-center justify-center rounded-[2.5rem] border-2 transition-all active:scale-95 shadow-sm relative group bg-white ${getStatusStyle(table.status)} ${storeStatus.status === 'offline' && table.status === 'available' ? 'grayscale opacity-50 cursor-not-allowed' : ''}`}
              >
                <span className="text-4xl font-black italic tracking-tighter mb-0.5">{table.tableNumber}</span>
                <div className="flex flex-col items-center mt-0.5">
                  <span className="text-[9px] font-black uppercase tracking-widest opacity-80">
                    {table.status === 'available' ? 'Livre' : table.status === 'occupied' ? 'Em Uso' : table.status === 'billing' ? 'Conta' : 'Pedido'}
                  </span>
                </div>

                {table.hasPendingDigital && (
                  <div className="absolute -top-2 -right-2 w-6 h-6 bg-amber-500 rounded-full flex items-center justify-center shadow-lg border-2 border-white animate-bounce">
                    <span className="text-[10px] text-white font-black">!</span>
                  </div>
                )}

                {table.isOriginDigitalMenu ? (
                  <div className="absolute bottom-2 sm:bottom-3 px-3 py-1 bg-fuchsia-600 rounded-full w-fit max-w-[90%] flex justify-center items-center shadow-sm mx-auto">
                    <p className="text-[8.5px] font-black text-white uppercase tracking-widest truncate leading-none pt-[1px]">App Digital</p>
                  </div>
                ) : (table.status === 'occupied' || table.status === 'billing') ? (
                  <div className="absolute bottom-2 sm:bottom-3 px-3 py-1 bg-slate-900/5 rounded-full w-fit max-w-[90%] flex justify-center items-center mx-auto">
                    <p className="text-[8.5px] font-black text-slate-500 uppercase truncate leading-none pt-[1px]">Em Uso</p>
                  </div>
                ) : null}
              </button>
            ))}
          </div>
        )}
      </main>

      {/* Quick Action */}
      <footer className="p-3 sm:p-4 bg-slate-50/80 backdrop-blur-md sticky bottom-0 flex gap-2 sm:gap-3">
        <button
          onClick={() => setShowHistory(true)}
          className="flex-1 py-3.5 sm:py-4 px-2 sm:px-3 bg-white border border-slate-200 text-slate-900 rounded-3xl shadow-[0_4px_12px_rgba(0,0,0,0.05)] active:translate-y-0.5 transition-all flex items-center justify-between gap-1 sm:gap-2 overflow-hidden"
        >
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 sm:w-8 sm:h-8 shrink-0 bg-blue-50 rounded-lg sm:rounded-xl flex items-center justify-center text-blue-600">
              <History size={16} />
            </div>
            <div className="flex flex-col items-start leading-tight">
              <span className="text-[8px] sm:text-[9px] font-black text-slate-400 tracking-widest uppercase">Produção</span>
              <span className="text-[11px] sm:text-xs font-black text-slate-900 uppercase">Hoje</span>
            </div>
          </div>
          <div className="bg-blue-600 text-white px-2 sm:px-3 py-1 sm:py-1.5 rounded-lg sm:rounded-xl shadow-md shrink-0">
            <span className="text-xs sm:text-sm font-black tracking-tighter">
              R$ {(() => {
                const today = new Date().toDateString();
                const feePercentage = settings?.serviceFeePercentage || 10;
                const isFeeActive = settings?.serviceFeeStatus !== false;
                const currentWaiterId = resolvedWaiterId || user.waiterId || user.id;
                const isMyWaiter = (wid: string | null | undefined, wOrig?: any) =>
                  wid === currentWaiterId ||
                  wid === user.id ||
                  wOrig?.email?.toLowerCase() === user.email.toLowerCase();

                // 1. Commission from finalized orders
                const myOrders = recentOrders.filter(o => {
                  const isToday = new Date(o.createdAt || 0).toDateString() === today;
                  const isMyOrder = isMyWaiter(o.waiterId, o.waiter);
                  return isToday && isMyOrder;
                });

                const finalizedCommission = myOrders.reduce((sum, o) => {
                  if (o.appliedServiceFee !== null && o.appliedServiceFee !== undefined) {
                    return sum + o.appliedServiceFee;
                  }
                  if (isFeeActive && o.type === 'TABLE' && o.status !== 'CANCELLED') {
                    // Reverse calculate base value if fee was applied into the total
                    return sum + (o.total - (o.total / (1 + (feePercentage / 100))));
                  }
                  return sum;
                }, 0);

                // 2. Commission from active tables (real-time)
                const myActiveTables = tables.filter(t => {
                  const isMyTable = isMyWaiter(t.waiterId) || (t.waiter && isMyWaiter(t.waiter.id));
                  return t.status !== 'available' && isMyTable;
                });

                const activeCommission = myActiveTables.reduce((sum, t) => {
                  if (!isFeeActive) return sum;
                  const tableTotal = t.items.reduce((acc, it) => acc + (it.price * it.quantity), 0);
                  return sum + (tableTotal * feePercentage / 100);
                }, 0);

                return (finalizedCommission + activeCommission).toFixed(2);
              })()}
            </span>
          </div>
        </button>

        <button
          onClick={() => {
            if (storeStatus.status === 'offline') return;
            setShowDirectOrder(true);
          }}
          disabled={storeStatus.status === 'offline'}
          className={`flex-1 py-3.5 sm:py-4 bg-slate-900 border-b-4 border-slate-950 text-white rounded-3xl shadow-lg active:translate-y-1 active:border-b-0 transition-all flex items-center justify-center gap-1 sm:gap-2 ${storeStatus.status === 'offline' ? 'grayscale opacity-50 cursor-not-allowed' : ''}`}
        >
          <PlusCircle size={18} />
          <span className="text-[10px] sm:text-[11px] font-black uppercase tracking-[0.05em] sm:tracking-[0.1em]">Pedido Balcão</span>
        </button>
      </footer>

      {
        selectedTable && (
          <TableDetails
            table={selectedTable}
            user={user}
            onClose={() => setSelectedTable(null)}
            onRefresh={fetchData}
            storeStatus={storeStatus}
            resolvedWaiterId={resolvedWaiterId}
          />
        )
      }

      {
        showDirectOrder && (
          <DirectOrderModal
            user={user}
            onClose={() => setShowDirectOrder(false)}
            onRefresh={fetchData}
            storeStatus={storeStatus}
            resolvedWaiterId={resolvedWaiterId}
          />
        )
      }

      {
        showHistory && (
          <HistoryModal
            user={user}
            tables={tables}
            settings={settings as any}
            resolvedWaiterId={resolvedWaiterId || ''}
            onClose={() => setShowHistory(false)}
          />
        )
      }

      <Modal
        isOpen={showLogoutModal}
        type="confirm"
        title="Sair do Sistema"
        message="Deseja realmente sair da aplicação e voltar para o login?"
        confirmText="Sair Agora"
        onConfirm={() => {
          db.logout();
          window.location.reload();
        }}
        onClose={() => setShowLogoutModal(false)}
      />

      {/* FEEDBACKS MODAL */}
      {
        showFeedbacks && (
          <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="absolute inset-0" onClick={() => setShowFeedbacks(false)} />
            <div className="relative w-full sm:w-[480px] bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl flex flex-col max-h-[90vh] animate-in slide-in-from-bottom-full sm:slide-in-from-bottom-10 duration-300">
              <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-indigo-50/50 rounded-t-3xl sm:rounded-t-3xl">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-indigo-100 rounded-xl flex items-center justify-center text-indigo-600 shadow-inner">
                    <MessageSquare size={20} />
                  </div>
                  <div>
                    <h3 className="font-black text-slate-900 tracking-tighter uppercase text-sm">Mensagens</h3>
                    <p className="text-[9px] font-bold text-indigo-400 uppercase tracking-widest">Feedbacks e Sugestões</p>
                  </div>
                </div>
                <button
                  onClick={() => setShowFeedbacks(false)}
                  className="w-10 h-10 bg-white border border-slate-200 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-600 transition-colors active:scale-95 shadow-sm"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="p-6 overflow-y-auto flex-1 space-y-4 bg-slate-50/50">
                {feedbacks.length > 0 ? (
                  feedbacks.map((fb, i) => (
                    <div key={i} className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex gap-4 animate-in fade-in slide-in-from-bottom-4" style={{ animationDelay: `${i * 50}ms` }}>
                      <div className="w-10 h-10 shrink-0 bg-amber-50 rounded-xl flex items-center justify-center text-amber-600 font-black italic shadow-inner border border-amber-100/50">
                        {fb.tableNumber}
                      </div>
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-[10px] font-black uppercase text-slate-400 tracking-widest">
                            {new Date(fb.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                          </span>
                          {fb.name && <span className="text-[10px] font-bold text-slate-500">• {fb.name}</span>}
                        </div>
                        <p className="text-sm font-medium text-slate-700 leading-relaxed">{fb.message}</p>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="py-12 flex flex-col items-center justify-center text-slate-400 gap-3">
                    <div className="w-16 h-16 bg-slate-100 border-2 border-slate-200 border-dashed rounded-full flex items-center justify-center">
                      <MessageSquare size={24} className="text-slate-300" />
                    </div>
                    <p className="text-xs font-black uppercase tracking-widest">Nenhuma Mensagem Hoje</p>
                  </div>
                )}
              </div>

              <div className="p-6 bg-white border-t border-slate-100 rounded-b-3xl sm:rounded-b-3xl">
                <button
                  onClick={() => setShowFeedbacks(false)}
                  className="w-full py-4 bg-slate-900 hover:bg-slate-800 text-white rounded-2xl font-black uppercase tracking-widest text-xs transition-all active:scale-95 flex items-center justify-center gap-2 shadow-xl shadow-slate-900/20"
                >
                  Fechar Painel
                </button>
              </div>
            </div>
          </div>
        )
      }
    </div >
  );
};

const App: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    setUser(db.getCurrentUser());
  }, []);

  if (!user || user.mustChangePassword) {
    return <Login onLoginSuccess={setUser} initialUser={user || undefined} />;
  }

  return <Dashboard user={user} />;
};

export default App;
