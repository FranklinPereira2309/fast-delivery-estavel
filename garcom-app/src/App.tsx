import React, { useState, useEffect } from 'react';
import Login from './components/Login';
import TableDetails from './components/TableDetails';
import DirectOrderModal from './components/DirectOrderModal';
import type { User, TableSession, StoreStatus, Order, BusinessSettings } from './types';
import { db, socket } from './api';
import { LogOut, LayoutGrid, RefreshCw, PlusCircle, MessageSquare, History, AlertCircle, X } from 'lucide-react';
import Modal from './components/Modal';
import HistoryModal from './components/HistoryModal';

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
  const [storeStatus, setStoreStatus] = useState<StoreStatus>({ status: 'online', is_manually_closed: false, next_status_change: null });
  const [minutesToClose, setMinutesToClose] = useState<number | null>(null);
  const [recentOrders, setRecentOrders] = useState<Order[]>([]);

  const fetchStatus = async () => {
    try {
      const status = await db.getStoreStatus();
      setStoreStatus(status);
    } catch (e) {
      console.error(e);
    }
  };

  const fetchOrders = async () => {
    try {
      const orders = await db.getOrders();
      // Filter by current waiter
      const userOrders = orders.filter(o => o.waiterId === user.id);
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

      // Refresh selected table data if open
      if (selectedTable) {
        const updated = activeSessions.find(t => t.tableNumber === selectedTable.tableNumber);
        if (updated) {
          setSelectedTable(updated);
        } else {
          // If not in active sessions anymore, it's available
          setSelectedTable({
            tableNumber: selectedTable.tableNumber,
            status: 'available',
            items: [],
            startTime: new Date().toISOString() // Placeholder
          } as any);
        }
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

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

    socket.on('tableStatusChanged', fetchData);
    socket.on('newOrder', () => {
      fetchData();
      fetchOrders();
    });
    socket.on('orderStatusUpdated', fetchData);
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
  }, []); // FIX: Removed selectedTable dependency to avoid infinite loop

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

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans flex flex-col">
      {/* Header */}
      <header className="p-6 bg-white border-b border-slate-100 flex justify-between items-center sticky top-0 z-20 shadow-sm">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 overflow-hidden rounded-xl flex items-center justify-center shadow-lg shadow-blue-500/20">
            <img src="/favicon.png" alt="Logo" className="w-full h-full object-cover" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-sm font-black text-slate-900 uppercase tracking-tighter">App Garçom</h1>
              <div className={`flex items-center gap-1 px-2 py-0.5 rounded-full ${storeStatus.status === 'online' ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-600'}`}>
                <div className={`w-1.5 h-1.5 rounded-full ${storeStatus.status === 'online' ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'}`}></div>
                <span className="text-[8px] font-black uppercase tracking-widest">{storeStatus.status === 'online' ? 'Online' : 'Offline'}</span>
              </div>
            </div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{user.name.split(' ')[0]} • DF Service</p>
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
              <div className="flex items-center justify-center w-10 h-10 bg-amber-500 text-white rounded-2xl animate-bounce shadow-lg shadow-amber-500/20">
                <AlertCircle size={24} className="animate-pulse" />
              </div>
            )}
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => { setShowFeedbacks(true); setHasNewFeedback(false); }}
            className={`p-3 border rounded-2xl transition-colors active:scale-90 relative ${hasNewFeedback ? 'bg-indigo-600 border-indigo-700 text-white shadow-lg shadow-indigo-200 animate-pulse' : 'bg-slate-50 border-slate-100 text-slate-400 hover:text-blue-600'}`}
          >
            <MessageSquare size={18} />
            {hasNewFeedback && <span className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full border-2 border-white animate-ping"></span>}
          </button>
          <button onClick={fetchData} className="p-3 bg-slate-50 border border-slate-100 rounded-2xl text-slate-400 hover:text-blue-600 transition-colors active:scale-90">
            <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
          </button>
          <button
            onClick={() => setShowLogoutModal(true)}
            className="p-3 bg-red-50 border border-red-100 rounded-2xl text-red-500 hover:bg-red-100 transition-colors active:scale-90"
          >
            <LogOut size={18} />
          </button>
        </div>
      </header>

      {/* Store Status Banner */}
      {(storeStatus.status === 'offline' || minutesToClose !== null) && (
        <div className={`px-6 py-3 border-b text-xs font-black uppercase tracking-widest flex items-center justify-center gap-2 animate-in slide-in-from-top duration-300 ${storeStatus.status === 'offline' ? 'bg-red-600 text-white border-red-700' : 'bg-orange-500 text-white border-orange-600'}`}>
          <AlertCircle size={14} />
          {storeStatus.status === 'offline'
            ? (storeStatus.is_manually_closed ? 'Loja Fechada Temporariamente' : 'Loja Fora do Horário de Funcionamento')
            : `Atenção: A loja fechará em ${minutesToClose} minutos!`
          }
        </div>
      )}

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
                <span className="text-4xl font-black italic tracking-tighter mb-1">{table.tableNumber}</span>
                <div className="flex flex-col items-center">
                  <span className="text-[9px] font-black uppercase tracking-widest opacity-80">
                    {table.status === 'available' ? 'Livre' : table.status === 'occupied' ? 'Em Uso' : table.status === 'billing' ? 'Conta' : 'Pedido'}
                  </span>
                </div>

                {table.hasPendingDigital && (
                  <div className="absolute -top-2 -right-2 w-6 h-6 bg-amber-500 rounded-full flex items-center justify-center shadow-lg border-2 border-white animate-bounce">
                    <span className="text-[10px] text-white font-black">!</span>
                  </div>
                )}

                {(table.status === 'occupied' || table.status === 'billing') && (
                  <div className="absolute bottom-4 px-3 py-1 bg-slate-900/5 rounded-full">
                    <p className="text-[8px] font-black text-slate-500 uppercase">Em Uso</p>
                  </div>
                )}
              </button>
            ))}
          </div>
        )}
      </main>

      {/* Quick Action */}
      <footer className="p-4 bg-slate-50/80 backdrop-blur-md sticky bottom-0 flex gap-3">
        <button
          onClick={() => setShowHistory(true)}
          className="flex-1 py-4 px-3 bg-white border border-slate-200 text-slate-900 rounded-3xl shadow-[0_4px_12px_rgba(0,0,0,0.05)] active:translate-y-0.5 transition-all flex items-center justify-between gap-2 overflow-hidden"
        >
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 shrink-0 bg-blue-50 rounded-xl flex items-center justify-center text-blue-600">
              <History size={16} />
            </div>
            <div className="flex flex-col items-start leading-tight">
              <span className="text-[9px] font-black text-slate-400 tracking-widest uppercase">Produção</span>
              <span className="text-[11px] sm:text-xs font-black text-slate-900 uppercase">Hoje</span>
            </div>
          </div>
          <div className="bg-blue-600 text-white px-3 py-1.5 rounded-xl shadow-md shrink-0">
            <span className="text-sm font-black tracking-tighter">
              R$ {(() => {
                const today = new Date().toDateString();
                const myOrders = recentOrders.filter(o => {
                  const isToday = new Date(o.createdAt || 0).toDateString() === today;
                  const isMyOrder = o.waiterId === (user.waiterId || user.id);
                  return isToday && isMyOrder;
                });

                const feePercentage = settings?.serviceFeePercentage || 10;
                const isFeeActive = settings?.serviceFeeStatus !== false;

                const commission = myOrders.reduce((sum, o) => {
                  if (o.appliedServiceFee !== null && o.appliedServiceFee !== undefined) {
                    return sum + o.appliedServiceFee;
                  }
                  if (isFeeActive && o.status !== 'CANCELLED') {
                    return sum + (o.total * feePercentage / 100);
                  }
                  return sum;
                }, 0);

                return commission.toFixed(2);
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
          className={`flex-1 py-4 bg-slate-900 border-b-4 border-slate-950 text-white rounded-3xl shadow-lg active:translate-y-1 active:border-b-0 transition-all flex items-center justify-center gap-2 ${storeStatus.status === 'offline' ? 'grayscale opacity-50 cursor-not-allowed' : ''}`}
        >
          <PlusCircle size={18} />
          <span className="text-[11px] font-black uppercase tracking-[0.1em]">Pedido Balcão</span>
        </button>
      </footer>

      {selectedTable && (
        <TableDetails
          table={selectedTable}
          user={user}
          onClose={() => setSelectedTable(null)}
          onRefresh={fetchData}
          storeStatus={storeStatus}
        />
      )}

      {showDirectOrder && (
        <DirectOrderModal
          user={user}
          onClose={() => setShowDirectOrder(false)}
          onRefresh={fetchData}
          storeStatus={storeStatus}
        />
      )}

      {showHistory && (
        <HistoryModal
          user={user}
          onClose={() => setShowHistory(false)}
        />
      )}

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
      {showFeedbacks && (
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
      )}
    </div>
  );
};

const App: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    setUser(db.getCurrentUser());
  }, []);

  if (!user) {
    return <Login onLoginSuccess={setUser} />;
  }

  return <Dashboard user={user} />;
};

export default App;
