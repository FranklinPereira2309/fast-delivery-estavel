
import React, { useState, useEffect, useRef } from 'react';
import { Icons } from '../constants';
import { db } from '../services/db';
import { User, Order, OrderStatus, TableSession, SaleType } from '../types';

interface LayoutProps {
  children: React.ReactNode;
  activeTab: string;
  setActiveTab: (tab: string) => void;
  currentUser: User;
  onLogout: () => void;
}

const Layout: React.FC<LayoutProps> = ({ children, activeTab, setActiveTab, currentUser, onLogout }) => {
  const [shouldBlinkMonitor, setShouldBlinkMonitor] = useState(false);
  const [shouldBlinkPOS, setShouldBlinkPOS] = useState(false);
  const [shouldBlinkLogistics, setShouldBlinkLogistics] = useState(false);
  const [shouldBlinkKitchen, setShouldBlinkKitchen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(true);
  const lastOrdersMap = useRef<Record<string, { status: OrderStatus, itemCount: number }>>({});
  const isFirstRun = useRef(true);

  const allNavItems = [
    { id: 'dashboard', label: 'Dashboard', icon: Icons.Dashboard },
    { id: 'pos', label: 'PDV / Vendas', icon: Icons.POS },
    { id: 'sales-monitor', label: 'Monitor de Vendas', icon: Icons.View },
    {
      id: 'tables', label: 'Gestão de Mesas', icon: () => (
        <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
        </svg>
      )
    },
    { id: 'kitchen', label: 'Cozinha', icon: Icons.Kitchen },
    { id: 'crm', label: 'Clientes (CRM)', icon: Icons.CRM },
    { id: 'inventory', label: 'Estoque / Cardápio', icon: Icons.Inventory },
    { id: 'logistics', label: 'Logística', icon: Icons.Logistics },
    { id: 'reports', label: 'Relatórios', icon: Icons.Print },
    { id: 'settings', label: 'Configurações', icon: Icons.Settings },
  ];

  useEffect(() => {
    const monitorSystem = async () => {
      const orders = await db.getOrders();

      // 1. Checagem do Monitor de Vendas (Mudanças de Status) e Cozinha (Novos Pedidos)
      let hasOrderChange = false;
      let hasNewOrder = false;

      orders.forEach(order => {
        const prev = lastOrdersMap.current[order.id];
        const currentItemCount = order.items?.length || 0;

        if (prev) {
          if (prev.status !== order.status) {
            hasOrderChange = true;
          }
          if (order.type === SaleType.TABLE && currentItemCount > prev.itemCount) {
            hasNewOrder = true;
          }
        } else {
          hasNewOrder = true;
        }

        lastOrdersMap.current[order.id] = {
          status: order.status,
          itemCount: currentItemCount
        };
      });

      if (!isFirstRun.current) {
        if (hasOrderChange && activeTab !== 'sales-monitor') {
          setShouldBlinkMonitor(true);
          setTimeout(() => setShouldBlinkMonitor(false), 5000);
        }

        if (hasNewOrder && activeTab !== 'kitchen') {
          setShouldBlinkKitchen(true);
          setTimeout(() => setShouldBlinkKitchen(false), 3000);
        }
      }

      isFirstRun.current = false;

      // 2. Checagem do PDV (Mesas aguardando recebimento)
      const tableSessions = await db.getTableSessions();
      const hasBillingTables = tableSessions.some(s => s.status === 'billing');
      setShouldBlinkPOS(hasBillingTables && activeTab !== 'pos');

      // 3. Checagem de Logística (Pedidos prontos para entrega)
      const hasReadyDelivery = orders.some(o => o.status === OrderStatus.READY && o.type === SaleType.OWN_DELIVERY);
      setShouldBlinkLogistics(hasReadyDelivery && activeTab !== 'logistics');
    };

    const interval = setInterval(monitorSystem, 3000);
    return () => clearInterval(interval);
  }, [activeTab]);

  const navItems = allNavItems.filter(item => currentUser.permissions.includes(item.id));

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden">
      {/* Sidebar */}
      <aside className={`${isSidebarCollapsed ? 'w-20' : 'w-64'} bg-slate-900 text-white flex flex-col shadow-xl shrink-0 transition-all duration-300 ease-in-out`}>
        <div className="p-4 flex items-center justify-between overflow-hidden">
          {!isSidebarCollapsed && (
            <h1 className="text-xl font-bold tracking-tight flex items-center gap-2 animate-in fade-in slide-in-from-left-2 duration-300">
              <span className="p-2 bg-blue-600 rounded-lg shrink-0">DF</span>
              <span className="truncate">Delivery Fast</span>
            </h1>
          )}
          {isSidebarCollapsed && (
            <div className="p-2 bg-blue-600 rounded-lg mx-auto">
              <span className="text-white font-black">DF</span>
            </div>
          )}
        </div>

        <div className="px-3 mb-2">
          <button
            onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
            className="w-full p-2 hover:bg-slate-800 text-slate-400 hover:text-white rounded-lg transition-all flex items-center justify-center gap-2"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className={`h-5 w-5 transition-transform duration-300 ${isSidebarCollapsed ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
            </svg>
            {!isSidebarCollapsed && <span className="text-[10px] font-black uppercase tracking-widest">Recolher</span>}
          </button>
        </div>

        <nav className="flex-1 mt-2 px-3 space-y-1 overflow-y-auto scrollbar-hide">
          {navItems.map((item) => {
            const isMonitor = item.id === 'sales-monitor';
            const isPOS = item.id === 'pos';
            const isLogistics = item.id === 'logistics';
            const isKitchen = item.id === 'kitchen';

            let blinkClass = '';
            if (isMonitor && shouldBlinkMonitor) blinkClass = 'animate-notify-turquoise border-none';
            if (isPOS && shouldBlinkPOS) blinkClass = 'animate-notify-turquoise border-none';
            if (isLogistics && shouldBlinkLogistics) blinkClass = 'animate-notify-turquoise border-none';
            if (isKitchen && shouldBlinkKitchen) blinkClass = 'animate-notify-turquoise border-none';

            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl transition-all duration-200 group relative ${activeTab === item.id
                  ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/50'
                  : 'text-slate-400 hover:bg-slate-800 hover:text-white'
                  } ${blinkClass} ${isSidebarCollapsed ? 'justify-center' : ''}`}
                title={isSidebarCollapsed ? item.label : ''}
              >
                <div className="shrink-0 scale-110">
                  <item.icon />
                </div>
                {!isSidebarCollapsed && (
                  <span className="font-medium truncate animate-in fade-in slide-in-from-left-1 duration-200">
                    {item.label}
                  </span>
                )}
                {isSidebarCollapsed && (
                  <div className="absolute left-full ml-2 px-2 py-1 bg-slate-800 text-white text-[10px] rounded opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity whitespace-nowrap z-50">
                    {item.label}
                  </div>
                )}
              </button>
            );
          })}
        </nav>
      </aside>

      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <header className="h-20 bg-white border-b border-slate-200 flex items-center justify-between px-8 shrink-0 shadow-sm z-10">
          <div className="flex items-center gap-6">
            <h2 className="text-xl font-black text-slate-900 uppercase tracking-tighter">
              {navItems.find(i => i.id === activeTab)?.label || 'Acesso Negado'}
            </h2>

            <div className="h-8 w-[1px] bg-slate-200 hidden md:block"></div>

            {/* Sessão do Usuário Logado - Agora na Topbar */}
            <div className="flex items-center gap-3 group">
              <div className="w-10 h-10 rounded-2xl bg-slate-900 text-white flex items-center justify-center font-black text-sm uppercase shadow-lg shadow-slate-200 transition-transform group-hover:scale-105">
                {currentUser.name.substring(0, 2)}
              </div>
              <div className="hidden sm:block">
                <p className="text-sm font-black text-slate-900 uppercase tracking-tighter leading-tight">{currentUser.name}</p>
                <div className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                  <p className="text-[9px] text-slate-400 font-bold uppercase tracking-widest">Sessão Ativa</p>
                </div>
              </div>
              <button
                onClick={onLogout}
                className="ml-2 p-3 bg-slate-50 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all flex items-center gap-2 group/logout"
                title="Sair do Sistema"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 transition-transform group-hover/logout:translate-x-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
                <span className="text-[10px] font-black uppercase tracking-widest hidden lg:block">Sair</span>
              </button>
            </div>
          </div>

          <div className="hidden xl:flex items-center gap-4">
            <div className="flex items-center gap-2 text-[10px] font-black text-slate-400 bg-slate-50 border border-slate-100 px-4 py-2 rounded-xl uppercase tracking-widest">
              Email: <span className="text-slate-900">{currentUser.email}</span>
            </div>
          </div>
        </header>

        <section className="flex-1 overflow-y-auto p-8">
          {children}
        </section>
      </main>
    </div>
  );
};

export default Layout;
