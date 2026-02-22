
import React, { useState, useEffect, useMemo } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, Cell, PieChart, Pie, Legend } from 'recharts';
import { db } from '../services/db';
import { Order, OrderStatus, SaleType } from '../types';

const Dashboard: React.FC = () => {
  const [orders, setOrders] = useState<Order[]>([]);
  const [clientCount, setClientCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

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
      { name: 'Delivery', value: types[SaleType.OWN_DELIVERY], color: '#3b82f6' },
      { name: 'Balcão', value: types[SaleType.COUNTER], color: '#10b981' },
      { name: 'Mesa', value: types[SaleType.TABLE], color: '#f59e0b' }
    ].filter(item => item.value > 0);
  }, [orders]);

  const COLORS_PAYMENT = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444'];

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
        {[
          { label: 'Receita (Hoje)', value: `R$ ${stats.revenueToday.toFixed(2)}`, color: 'text-emerald-600', bg: 'bg-emerald-50', icon: '💰' },
          { label: 'Pedidos (Hoje)', value: stats.ordersToday.toString(), color: 'text-blue-600', bg: 'bg-blue-50', icon: '📦' },
          { label: 'Ticket Médio', value: `R$ ${stats.avgTicket.toFixed(2)}`, color: 'text-orange-600', bg: 'bg-orange-50', icon: '🎫' },
          { label: 'Base de Clientes', value: stats.totalClients.toString(), color: 'text-indigo-600', bg: 'bg-indigo-50', icon: '👥' },
        ].map((stat, i) => (
          <div key={i} className="bg-white p-6 rounded-[2rem] shadow-sm border border-slate-100 group hover:shadow-xl transition-all">
            <div className="flex justify-between items-start mb-4">
              <span className={`p-3 rounded-2xl ${stat.bg} text-xl`}>{stat.icon}</span>
              <span className="text-[10px] font-black text-slate-300 uppercase tracking-widest">Tempo Real</span>
            </div>
            <p className="text-slate-500 text-[10px] font-black uppercase tracking-widest">{stat.label}</p>
            <p className={`text-3xl font-black mt-1 tracking-tighter ${stat.color}`}>{stat.value}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Gráfico de Vendas de 7 dias */}
        <div className="lg:col-span-2 bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-100">
          <div className="flex justify-between items-end mb-8">
            <div>
              <h3 className="text-slate-800 font-black uppercase tracking-tight text-lg">Fluxo Financeiro</h3>
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Últimos 7 dias de operação</p>
            </div>
            <div className="text-right">
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Total Semana</p>
              <p className="text-2xl font-black text-slate-900">R$ {chartData.reduce((acc, d) => acc + d.vendas, 0).toFixed(2)}</p>
            </div>
          </div>
          <div className="h-80 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="colorSales" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 10, fontWeight: 700 }} dy={10} />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 10, fontWeight: 700 }} />
                <Tooltip
                  contentStyle={{ borderRadius: '20px', border: 'none', boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1)', padding: '15px' }}
                  itemStyle={{ fontWeight: 800, fontSize: '12px', textTransform: 'uppercase' }}
                />
                <Area type="monotone" dataKey="vendas" stroke="#3b82f6" strokeWidth={4} fillOpacity={1} fill="url(#colorSales)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Gráfico de Volume de Pedidos */}
        <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-100 flex flex-col">
          <h3 className="text-slate-800 font-black uppercase tracking-tight text-lg mb-1">Volume de Pedidos</h3>
          <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mb-8">Frequência diária</p>
          <div className="flex-1 min-h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 10, fontWeight: 700 }} />
                <Tooltip
                  cursor={{ fill: '#f8fafc' }}
                  contentStyle={{ borderRadius: '20px', border: 'none', boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1)' }}
                />
                <Bar dataKey="pedidos" radius={[10, 10, 0, 0]}>
                  {chartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={index === chartData.length - 1 ? '#3b82f6' : '#e2e8f0'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-6 pt-6 border-t border-slate-50">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Performance Semanal</span>
            </div>
            <div className="w-full h-2 bg-slate-100 rounded-full mt-2 overflow-hidden">
              <div className="h-full bg-blue-500 rounded-full transition-all duration-500" style={{ width: `${Math.min(100, (stats.ordersToday / 20) * 100)}%` }}></div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Análise por Tipo de Pagamento */}
        <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-100 flex flex-col">
          <div className="mb-6">
            <h3 className="text-slate-800 font-black uppercase tracking-tight text-lg">Mix de Pagamentos</h3>
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Volume financeiro por método</p>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
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
                  contentStyle={{ borderRadius: '15px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                  formatter={(value: number) => `R$ ${value.toFixed(2)}`}
                />
                <Legend iconType="circle" wrapperStyle={{ paddingTop: '20px', fontSize: '10px', fontWeight: 800, textTransform: 'uppercase' }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Acompanhamento do Delivery */}
        <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-100 flex flex-col">
          <div className="mb-6">
            <h3 className="text-slate-800 font-black uppercase tracking-tight text-lg">Canais de Venda</h3>
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Comparativo Delivery vs Salão/Balcão</p>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
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
                  contentStyle={{ borderRadius: '15px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-4 grid grid-cols-3 gap-2">
            {deliveryData.map((item, i) => (
              <div key={i} className="text-center p-3 rounded-2xl bg-slate-50 border border-slate-100">
                <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">{item.name}</p>
                <p className="text-sm font-black text-slate-800">{item.value} <span className="text-[9px] opacity-50">PED</span></p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
