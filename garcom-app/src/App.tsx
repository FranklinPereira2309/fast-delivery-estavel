import React, { useState, useEffect } from 'react';
import Login from './components/Login';
import TableDetails from './components/TableDetails';
import type { User, TableSession } from './types';
import { db, socket } from './api';
import { LogOut, LayoutGrid, RefreshCw, PlusCircle } from 'lucide-react';

const Dashboard: React.FC<{ user: User }> = ({ user }) => {
  const [tables, setTables] = useState<TableSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTable, setSelectedTable] = useState<TableSession | null>(null);

  const fetchData = async () => {
    try {
      const data = await db.getTables();
      setTables(data);
      if (selectedTable) {
        const updated = data.find(t => t.tableNumber === selectedTable.tableNumber);
        if (updated) setSelectedTable(updated);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();

    socket.on('tableStatusChanged', fetchData);
    socket.on('newOrder', fetchData);
    socket.on('orderStatusUpdated', fetchData);

    return () => {
      socket.off('tableStatusChanged');
      socket.off('newOrder');
      socket.off('orderStatusUpdated');
    };
  }, [selectedTable]);

  const getStatusStyle = (status: TableSession['status']) => {
    switch (status) {
      case 'available': return 'bg-emerald-50 text-emerald-600 border-emerald-100';
      case 'occupied': return 'bg-red-50 text-red-600 border-red-100';
      case 'billing': return 'bg-blue-50 text-blue-600 border-blue-100';
      case 'pending-digital': return 'bg-amber-50 text-amber-600 border-amber-100 animate-pulse-subtle';
      default: return 'bg-slate-50 text-slate-400 border-slate-100';
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans flex flex-col">
      {/* Header */}
      <header className="p-6 bg-white border-b border-slate-100 flex justify-between items-center sticky top-0 z-20 shadow-sm">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 overflow-hidden rounded-xl flex items-center justify-center shadow-lg shadow-blue-500/20">
            <img src="/favicon.png" alt="Logo" className="w-full h-full object-cover" />
          </div>
          <div>
            <h1 className="text-sm font-black text-slate-900 uppercase tracking-tighter">App Garçom</h1>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{user.name.split(' ')[0]} • DF Service</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={fetchData} className="p-3 bg-slate-50 border border-slate-100 rounded-2xl text-slate-400 hover:text-blue-600 transition-colors active:scale-90">
            <RefreshCw size={18} />
          </button>
          <button
            onClick={() => { if (confirm('Sair do sistema?')) { db.logout(); window.location.reload(); } }}
            className="p-3 bg-red-50 border border-red-100 rounded-2xl text-red-500 hover:bg-red-100 transition-colors active:scale-90"
          >
            <LogOut size={18} />
          </button>
        </div>
      </header>

      {/* Stats / Filter Bar */}
      <div className="px-6 pt-6 flex gap-2 overflow-x-auto hide-scrollbar">
        <div className="shrink-0 px-4 py-2 bg-white rounded-xl border border-slate-100 shadow-sm flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
          <span className="text-[10px] font-black uppercase text-slate-600">{tables.filter(t => t.status === 'available').length} Livres</span>
        </div>
        <div className="shrink-0 px-4 py-2 bg-white rounded-xl border border-slate-100 shadow-sm flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-red-500"></div>
          <span className="text-[10px] font-black uppercase text-slate-600">{tables.filter(t => t.status === 'occupied').length} Ocupadas</span>
        </div>
        <div className="shrink-0 px-4 py-2 bg-white rounded-xl border border-slate-100 shadow-sm flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-blue-500"></div>
          <span className="text-[10px] font-black uppercase text-slate-600">{tables.filter(t => t.status === 'billing').length} Conta</span>
        </div>
        <div className="shrink-0 px-4 py-2 bg-white rounded-xl border border-slate-100 shadow-sm flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-amber-500"></div>
          <span className="text-[10px] font-black uppercase text-slate-600">{tables.filter(t => t.hasPendingDigital).length} Digital</span>
        </div>
      </div>

      {/* Table Grid */}
      <main className="flex-1 p-6">
        {loading ? (
          <div className="h-64 flex flex-col items-center justify-center text-slate-300 font-black uppercase text-[10px] tracking-widest italic animate-pulse">
            <LayoutGrid size={48} className="mb-4 opacity-20" />
            Sincronizando...
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4">
            {[...tables].sort((a, b) => a.tableNumber - b.tableNumber).map(table => (
              <button
                key={table.tableNumber}
                onClick={() => setSelectedTable(table)}
                className={`aspect-[4/3] flex flex-col items-center justify-center rounded-[2.5rem] border-2 transition-all active:scale-95 shadow-sm relative group bg-white ${getStatusStyle(table.status)}`}
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
                    <p className="text-[8px] font-black text-slate-500 uppercase">Mesa {table.tableNumber}</p>
                  </div>
                )}
              </button>
            ))}
          </div>
        )}
      </main>

      {/* Quick Action */}
      <footer className="p-6 pt-0 bg-slate-50/80 backdrop-blur-md sticky bottom-0">
        <button className="w-full py-5 bg-slate-900 border-b-4 border-slate-950 text-white rounded-[2rem] font-black uppercase text-[11px] tracking-[0.2em] shadow-2xl active:translate-y-1 active:border-b-0 transition-all flex items-center justify-center gap-3">
          <PlusCircle size={20} />
          Lançamento Direto
        </button>
      </footer>

      {selectedTable && (
        <TableDetails
          table={selectedTable}
          onClose={() => setSelectedTable(null)}
          onRefresh={fetchData}
        />
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
