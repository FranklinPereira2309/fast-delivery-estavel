
import React, { useState, useEffect, useMemo } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, Cell, PieChart, Pie, Legend } from 'recharts';
import { db } from '../services/db';
import { Order, OrderStatus, SaleType } from '../types';
import { Icons } from '../constants';
import { useTheme } from '../components/ThemeProvider';

const Dashboard: React.FC = () => {
  const [orders, setOrders] = useState<Order[]>([]);
  const [clientCount, setClientCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const { theme } = useTheme();

  const isDark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  const gridColor = isDark ? '#1e293b' : '#f1f5f9';
  const labelColor = isDark ? '#64748b' : '#94a3b8';

  useEffect(() => {
    const fetchData = async () => {
      const [allOrders, allClients] = await Promise.all([
        db.getOrders(),
        db.getClients()
      ]);
      setOrders(allOrders);
      setClientCount(allClients.length);
      setIsLoading(false);
    };
    fetchData();
  }, []);

  const stats = useMemo(() => {
    const today = new Date().toLocaleDateString('pt-BR');
    const todayOrders = orders.filter(o => new Date(o.createdAt).toLocaleDateString('pt-BR') === today);
    const deliveredToday = todayOrders.filter(o => o.status === OrderStatus.DELIVERED);

    const revenueToday = deliveredToday.reduce((acc, o) => acc + o.total, 0);
    const avgTicket = deliveredToday.length > 0 ? revenueToday / deliveredToday.length : 0;

    return {
      revenueToday,
      ordersToday: todayOrders.length,
      avgTicket,
      totalClients: clientCount
    };
  }, [orders, clientCount]);

  const chartData = useMemo(() => {
    const last7Days = Array.from({ length: 7 }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - (6 - i));
      return d.toLocaleDateString('pt-BR');
    });

    return last7Days.map(dateStr => {
      const dayOrders = orders.filter(o => new Date(o.createdAt).toLocaleDateString('pt-BR') === dateStr);
      const revenue = dayOrders.filter(o => o.status === OrderStatus.DELIVERED).reduce((acc, o) => acc + o.total, 0);
      return {
        name: dateStr.split('/')[0] + '/' + dateStr.split('/')[1],
        vendas: revenue,
        pedidos: dayOrders.length
      };
    });
  }, [orders]);

  const paymentData = useMemo(() => {
    const methods: Record<string, number> = {
      'DINHEIRO': 0,
      'PIX': 0,
      'CRÉDITO': 0,
      'DÉBITO': 0
    };

    orders.filter(o => o.status === OrderStatus.DELIVERED).forEach(order => {
      const method = order.paymentMethod || 'DINHEIRO';
      if (methods[method] !== undefined) {
        methods[method] += order.total;
      }
    });

    return Object.entries(methods).map(([name, value]) => ({ name, value }));
  }, [orders]);

  const deliveryData = useMemo(() => {
    const types: Record<string, number> = {
      [SaleType.OWN_DELIVERY]: 0,
      [SaleType.COUNTER]: 0,
      [SaleType.TABLE]: 0
    };

    orders.forEach(order => {
      if (types[order.type] !== undefined) {
        types[order.type] += 1;
      }
    });

    return [
      { name: 'Delivery', value: types[SaleType.OWN_DELIVERY], color: '#4f46e5' },
      { name: 'Balcão', value: types[SaleType.COUNTER], color: '#10b981' },
      { name: 'Mesa', value: types[SaleType.TABLE], color: '#f59e0b' }
    ].filter(item => item.value > 0);
  }, [orders]);

  const COLORS_PAYMENT = ['#10b981', '#4f46e5', '#f59e0b', '#ef4444'];

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-12">
      {/* Cards de Métricas Reais */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white dark:bg-slate-900 p-8 rounded-[3rem] shadow-sm border border-slate-100 dark:border-slate-800 transition-colors">
          <div className="flex items-center gap-4 mb-6">
            <div className="w-12 h-12 bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-2xl flex items-center justify-center">
              <Icons.DollarSign size={24} /> {/* Changed from POS to DollarSign for revenue */}
            </div>
            <div>
              <p className="text-[10px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-widest">Receita (Hoje)</p>
              <h3 className="text-2xl font-black text-slate-800 dark:text-white uppercase tracking-tighter">
                {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(stats.revenueToday)}
              </h3>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-8 rounded-[3rem] shadow-sm border border-slate-100 dark:border-slate-800 transition-colors">
          <div className="flex items-center gap-4 mb-6">
            <div className="w-12 h-12 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 rounded-2xl flex items-center justify-center">
              <Icons.Package size={24} /> {/* Changed from Check to Package for orders */}
            </div>
            <div>
              <p className="text-[10px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-widest">Pedidos (Hoje)</p>
              <h3 className="text-2xl font-black text-slate-800 dark:text-white uppercase tracking-tighter">{stats.ordersToday}</h3>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-8 rounded-[3rem] shadow-sm border border-slate-100 dark:border-slate-800 transition-colors">
          <div className="flex items-center gap-4 mb-6">
            <div className="w-12 h-12 bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 rounded-2xl flex items-center justify-center">
              <Icons.Ticket size={24} /> {/* Changed from Clock to Ticket for avg ticket */}
            </div>
            <div>
              <p className="text-[10px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-widest">Ticket Médio</p>
              <h3 className="text-2xl font-black text-slate-800 dark:text-white uppercase tracking-tighter">
                {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(stats.avgTicket)}
              </h3>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-8 rounded-[3rem] shadow-sm border border-slate-100 dark:border-slate-800 transition-colors">
          <div className="flex items-center gap-4 mb-6">
            <div className="w-12 h-12 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded-2xl flex items-center justify-center">
              <Icons.Users size={24} /> {/* Changed from Clock to Users for clients */}
            </div>
            <div>
              <p className="text-[10px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-widest">Base de Clientes</p>
              <h3 className="text-2xl font-black text-slate-800 dark:text-white uppercase tracking-tighter">{stats.totalClients}</h3>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Gráfico de Vendas de 7 dias */}
        <div className="lg:col-span-2 bg-white dark:bg-slate-900 p-8 rounded-[2.5rem] shadow-sm border border-slate-100 dark:border-slate-800 transition-colors">
          <div className="flex justify-between items-end mb-8">
            <div>
              <h3 className="text-slate-800 dark:text-white font-black uppercase tracking-tight text-lg">Fluxo Financeiro</h3>
              <p className="text-[10px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-widest">Últimos 7 dias de operação</p>
            </div>
            <div className="text-right">
              <p className="text-[10px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-widest">Total Semana</p>
              <p className="text-2xl font-black text-slate-900 dark:text-white">R$ {chartData.reduce((acc, d) => acc + d.vendas, 0).toFixed(2)}</p>
            </div>
          </div>
          <div className="h-80 w-full">
            <ResponsiveContainer width="100%" height="100%" minWidth={0}>
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="colorSales" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#4f46e5" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#4f46e5" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={gridColor} />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: labelColor, fontSize: 10, fontWeight: 700 }} dy={10} />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: labelColor, fontSize: 10, fontWeight: 700 }} />
                <Tooltip
                  contentStyle={{ borderRadius: '20px', border: 'none', backgroundColor: isDark ? '#0f172a' : '#ffffff', boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1)', padding: '15px' }}
                  itemStyle={{ fontWeight: 800, fontSize: '12px', textTransform: 'uppercase' }}
                  labelStyle={{ color: isDark ? '#cbd5e1' : '#64748b', fontWeight: 700, marginBottom: '5px' }}
                />
                <Area type="monotone" dataKey="vendas" stroke="#4f46e5" strokeWidth={4} fillOpacity={1} fill="url(#colorSales)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Gráfico de Volume de Pedidos */}
        <div className="bg-white dark:bg-slate-900 p-8 rounded-[2.5rem] shadow-sm border border-slate-100 dark:border-slate-800 transition-colors flex flex-col">
          <h3 className="text-slate-800 dark:text-white font-black uppercase tracking-tight text-lg mb-1">Volume de Pedidos</h3>
          <p className="text-[10px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-widest mb-8">Frequência diária</p>
          <div className="flex-1 min-h-[300px]">
            <ResponsiveContainer width="100%" height="100%" minWidth={0}>
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={gridColor} />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: labelColor, fontSize: 10, fontWeight: 700 }} />
                <Tooltip
                  cursor={{ fill: isDark ? '#1e293b' : '#f8fafc' }}
                  contentStyle={{ borderRadius: '20px', border: 'none', backgroundColor: isDark ? '#0f172a' : '#ffffff', boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1)' }}
                  labelStyle={{ color: isDark ? '#cbd5e1' : '#64748b' }}
                />
                <Bar dataKey="pedidos" radius={[10, 10, 0, 0]}>
                  {chartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={index === chartData.length - 1 ? '#4f46e5' : isDark ? '#334155' : '#e2e8f0'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-6 pt-6 border-t border-slate-50 dark:border-slate-800">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">Performance Semanal</span>
            </div>
            <div className="w-full h-2 bg-slate-100 dark:bg-slate-800 rounded-full mt-2 overflow-hidden">
              <div className="h-full bg-blue-500 rounded-full transition-all duration-500" style={{ width: `${Math.min(100, (stats.ordersToday / 20) * 100)}%` }}></div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Análise por Tipo de Pagamento */}
        <div className="bg-white dark:bg-slate-900 p-8 rounded-[2.5rem] shadow-sm border border-slate-100 dark:border-slate-800 transition-colors flex flex-col">
          <div className="mb-6">
            <h3 className="text-slate-800 dark:text-white font-black uppercase tracking-tight text-lg">Mix de Pagamentos</h3>
            <p className="text-[10px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-widest">Volume financeiro por método</p>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%" minWidth={0}>
              <PieChart>
                <Pie
                  data={paymentData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={80}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {paymentData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS_PAYMENT[index % COLORS_PAYMENT.length]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{ borderRadius: '15px', border: 'none', backgroundColor: isDark ? '#0f172a' : '#ffffff', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                  itemStyle={{ color: isDark ? '#cbd5e1' : '#1e293b' }}
                  formatter={(value: number) => `R$ ${value.toFixed(2)}`}
                />
                <Legend iconType="circle" wrapperStyle={{ paddingTop: '20px', fontSize: '10px', fontWeight: 800, textTransform: 'uppercase', color: labelColor }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Acompanhamento do Delivery */}
        <div className="bg-white dark:bg-slate-900 p-8 rounded-[2.5rem] shadow-sm border border-slate-100 dark:border-slate-800 transition-colors flex flex-col">
          <div className="mb-6">
            <h3 className="text-slate-800 dark:text-white font-black uppercase tracking-tight text-lg">Canais de Venda</h3>
            <p className="text-[10px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-widest">Comparativo Delivery vs Salão/Balcão</p>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%" minWidth={0}>
              <PieChart>
                <Pie
                  data={deliveryData}
                  cx="50%"
                  cy="50%"
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="value"
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                >
                  {deliveryData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{ borderRadius: '15px', border: 'none', backgroundColor: isDark ? '#0f172a' : '#ffffff', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                  itemStyle={{ color: isDark ? '#cbd5e1' : '#1e293b' }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-4 grid grid-cols-3 gap-2">
            {deliveryData.map((item, i) => (
              <div key={i} className="text-center p-3 rounded-2xl bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700">
                <p className="text-[8px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-1">{item.name}</p>
                <p className="text-sm font-black text-slate-800 dark:text-white">{item.value} <span className="text-[9px] opacity-50">PED</span></p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
