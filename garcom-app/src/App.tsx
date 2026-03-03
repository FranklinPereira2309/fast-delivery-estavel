import React, { useState, useEffect } from 'react';
import Login from './components/Login';
import TableDetails from './components/TableDetails';
import DirectOrderModal from './components/DirectOrderModal';
import type { User, TableSession, StoreStatus, Order } from './types';
import { db, socket } from './api';
import { LogOut, LayoutGrid, RefreshCw, PlusCircle, MessageSquare, History, AlertCircle } from 'lucide-react';
import Modal from './components/Modal';
import HistoryModal from './components/HistoryModal';

const Dashboard: React.FC<{ user: User }> = ({ user }) => {
  const [tables, setTables] = useState<TableSession[]>([]);
  const [tableCount, setTableCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [selectedTable, setSelectedTable] = useState<TableSession | null>(null);
  const [showDirectOrder, setShowDirectOrder] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showLogoutModal, setShowLogoutModal] = useState(false);
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
      if (tableCount === 0) {
        const settings = await db.getSettings();
        setTableCount(settings.tableCount);
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

    const interval = setInterval(() => {
      fetchStatus();
    }, 30000);

    return () => {
      socket.off('tableStatusChanged');
      socket.off('newOrder');
      socket.off('orderStatusUpdated');
      socket.off('store_status_changed');
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
              <div className="flex items-center gap-2 px-3 py-1.5 bg-amber-500 text-white rounded-xl animate-bounce shadow-lg shadow-amber-500/20">
                <AlertCircle size={14} className="animate-pulse" />
                <span className="text-[9px] font-black uppercase tracking-widest">Novo Pedido</span>
              </div>
            )}
        </div>
        <div className="flex gap-2">
          <button onClick={() => {/* Handle messages */ }} className="p-3 bg-slate-50 border border-slate-100 rounded-2xl text-slate-400 hover:text-blue-600 transition-colors active:scale-90">
            <MessageSquare size={18} />
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
      <footer className="p-6 pt-0 bg-slate-50/80 backdrop-blur-md sticky bottom-0 flex gap-3">
        <button
          onClick={() => setShowHistory(true)}
          className="flex-1 py-5 bg-white border border-slate-200 text-slate-900 rounded-[2rem] font-black uppercase text-[10px] tracking-[0.1em] shadow-sm active:translate-y-0.5 transition-all flex items-center justify-center gap-3"
        >
          <div className="flex justify-between items-center w-full px-1">
            <div className="flex flex-col items-start leading-none gap-1">
              <div className="flex items-center gap-1.5">
                <History size={14} className="text-slate-400" />
                <span className="text-[10px] font-black uppercase text-slate-800">Atendimentos</span>
              </div>
              <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest">Sua Comissão Hoje</p>
            </div>
            <div className="flex flex-col items-end">
              <span className="text-sm font-black text-blue-600 tracking-tighter">
                R$ {recentOrders.filter(o => {
                  const today = new Date().toDateString();
                  return new Date(o.createdAt || 0).toDateString() === today;
                }).reduce((sum, o) => sum + (o.appliedServiceFee || 0), 0).toFixed(2)}
              </span>
              <div className="w-12 h-1 bg-slate-100 rounded-full mt-1 overflow-hidden">
                <div
                  className="h-full bg-blue-500 transition-all duration-1000"
                  style={{ width: `${Math.min((recentOrders.filter(o => new Date(o.createdAt || 0).toDateString() === new Date().toDateString()).reduce((sum, o) => sum + (o.appliedServiceFee || 0), 0) / 100) * 100, 100)}%` }}
                ></div>
              </div>
            </div>
          </div>
        </button>
        <button
          onClick={() => {
            if (storeStatus.status === 'offline') return;
            setShowDirectOrder(true);
          }}
          disabled={storeStatus.status === 'offline'}
          className={`flex-1 py-5 bg-slate-900 border-b-4 border-slate-950 text-white rounded-[2rem] font-black uppercase text-[10px] tracking-[0.1em] shadow-2xl active:translate-y-1 active:border-b-0 transition-all flex items-center justify-center gap-2 ${storeStatus.status === 'offline' ? 'grayscale opacity-50 cursor-not-allowed' : ''}`}
        >
          <PlusCircle size={18} />
          Pedido Balcão
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
