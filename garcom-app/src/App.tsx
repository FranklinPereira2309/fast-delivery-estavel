import React, { useState, useEffect } from 'react';
import Login from './components/Login';
import TableDetails from './components/TableDetails';
import type { User, TableSession } from './types';
import { db, socket } from './api';

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

  const getStatusColor = (status: TableSession['status']) => {
    switch (status) {
      case 'available': return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
      case 'occupied': return 'bg-red-500/10 text-red-400 border-red-500/20';
      case 'billing': return 'bg-blue-500/10 text-blue-400 border-blue-500/20';
      case 'pending-digital': return 'bg-amber-500/20 text-amber-500 border-amber-500/30 animate-pulse-subtle';
      default: return 'bg-slate-800 text-slate-500';
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-white font-sans flex flex-col">
      {/* Header */}
      <header className="p-6 pb-4 flex justify-between items-center glass sticky top-0 z-10">
        <div>
          <h1 className="text-xl font-black italic tracking-tighter text-blue-500">DF SERVICE</h1>
          <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{user.name} • {user.email}</p>
        </div>
        <button onClick={() => { if (confirm('Sair do sistema?')) { db.logout(); window.location.reload(); } }} className="p-3 bg-white/5 rounded-2xl hover:bg-white/10 text-slate-400 active:scale-90 transition-all">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
          </svg>
        </button>
      </header>

      {/* Table Grid */}
      <main className="flex-1 p-6">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-sm font-black uppercase tracking-widest text-slate-400">Mapa de Mesas</h2>
          <div className="flex gap-2">
            <div className="w-2 h-2 rounded-full bg-emerald-500/50 shadow-lg shadow-emerald-500/20"></div>
            <div className="w-2 h-2 rounded-full bg-red-500/50"></div>
            <div className="w-2 h-2 rounded-full bg-amber-500/50"></div>
          </div>
        </div>

        {loading ? (
          <div className="h-48 flex items-center justify-center text-slate-600 font-black uppercase text-[10px] tracking-widest italic animate-pulse">Sincronizando Banco de Dados...</div>
        ) : (
          <div className="grid grid-cols-3 gap-4">
            {tables.map(table => (
              <button
                key={table.tableNumber}
                onClick={() => setSelectedTable(table)}
                className={`aspect-square flex flex-col items-center justify-center rounded-[2rem] border transition-all active:scale-90 shadow-xl ${getStatusColor(table.status)}`}
              >
                <span className="text-3xl font-black italic tracking-tighter">{table.tableNumber}</span>
                <span className="text-[8px] font-black uppercase tracking-tighter mt-1 opacity-60">
                  {table.status === 'available' ? 'LIVRE' : table.status === 'occupied' ? 'EM USO' : table.status === 'billing' ? 'CONTA' : 'PEDIDO'}
                </span>
                {table.hasPendingDigital && (
                  <div className="absolute top-2 right-2 w-2 h-2 bg-amber-500 rounded-full animate-ping"></div>
                )}
              </button>
            ))}
          </div>
        )}
      </main>

      {/* Quick Action */}
      <footer className="p-6 pt-0">
        <button className="w-full py-5 bg-gradient-to-r from-blue-600 to-blue-700 rounded-[2rem] font-black text-white uppercase text-xs tracking-widest shadow-2xl shadow-blue-500/20 active:scale-95 transition-all">
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
