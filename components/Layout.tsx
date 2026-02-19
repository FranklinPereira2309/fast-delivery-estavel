
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
      <aside className="w-64 bg-slate-900 text-white flex flex-col shadow-xl shrink-0">
        <div className="p-6">
          <h1 className="text-xl font-bold tracking-tight flex items-center gap-2">
            <span className="p-2 bg-blue-600 rounded-lg">DF</span>
            Delivery Fast
          </h1>
        </div>

        <nav className="flex-1 mt-4 px-3 space-y-1 overflow-y-auto">
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
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 ${activeTab === item.id
                  ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/50'
                  : 'text-slate-400 hover:bg-slate-800 hover:text-white'
                  } ${blinkClass}`}
              >
                <item.icon />
                <span className="font-medium">{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="p-4 bg-slate-800/50 m-4 rounded-xl">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center font-bold text-sm uppercase">
              {currentUser.name.substring(0, 2)}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold truncate">{currentUser.name}</p>
              <p className="text-[10px] text-slate-400 truncate uppercase">Sessão 24h</p>
            </div>
            <button
              onClick={onLogout}
              className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-all"
              title="Sair"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
            </button>
          </div>
        </div>
      </aside>

      <main className="flex-1 flex flex-col min-w-0">
        <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-8 shrink-0">
          <h2 className="text-lg font-semibold text-slate-800">
            {navItems.find(i => i.id === activeTab)?.label || 'Acesso Negado'}
          </h2>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 text-sm text-slate-500 bg-slate-100 px-3 py-1.5 rounded-full">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              Conectado como {currentUser.email}
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
