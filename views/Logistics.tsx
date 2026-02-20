
import React, { useState, useEffect, useMemo } from 'react';
import { DeliveryDriver, Order, OrderStatus, OrderStatusLabels, SaleType, User, Product } from '../types';
import { db, BusinessSettings } from '../services/db';
import { Icons } from '../constants';

const Logistics: React.FC = () => {
  const [drivers, setDrivers] = useState<DeliveryDriver[]>([]);
  const [readyOrders, setReadyOrders] = useState<Order[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [businessSettings, setBusinessSettings] = useState<BusinessSettings | null>(null);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [printingOrder, setPrintingOrder] = useState<Order | null>(null);

  const [activeTab, setActiveTab] = useState<'PENDING' | 'HISTORY'>('PENDING');
  const [historyOrders, setHistoryOrders] = useState<Order[]>([]);
  const [historyStartDate, setHistoryStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [historyEndDate, setHistoryEndDate] = useState(new Date().toISOString().split('T')[0]);
  const [historyDriverId, setHistoryDriverId] = useState<string>('TODOS');
  const [printingHistoryOrder, setPrintingHistoryOrder] = useState<Order | null>(null);

  useEffect(() => {
    refreshData();
    const session = db.getCurrentSession();
    if (session) setCurrentUser(session.user);

    const interval = setInterval(refreshData, 3000);
    return () => clearInterval(interval);
  }, []);

  const refreshData = async () => {
    const [allDrivers, allOrders, allProds, settings] = await Promise.all([
      db.getDrivers(),
      db.getOrders(),
      db.getProducts(),
      db.getSettings()
    ]);
    setDrivers(allDrivers);
    setProducts(allProds);
    setBusinessSettings(settings);
    setReadyOrders(allOrders.filter(o =>
      o.type === SaleType.OWN_DELIVERY &&
      [OrderStatus.READY, OrderStatus.OUT_FOR_DELIVERY, OrderStatus.DELIVERED].includes(o.status)
    ).sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
    setHistoryOrders(allOrders.filter(o => o.type === SaleType.OWN_DELIVERY && o.status === OrderStatus.DELIVERED));
  };

  const assignDriver = async (orderId: string, driverId: string) => {
    if (!currentUser) return;
    await db.updateOrderStatus(orderId, OrderStatus.OUT_FOR_DELIVERY, currentUser, driverId);
    refreshData();
  };

  const updateDeliveryStatus = async (orderId: string, status: OrderStatus) => {
    if (!currentUser) return;
    await db.updateOrderStatus(orderId, status, currentUser);
    refreshData();
  };

  const getDriverName = (driverId?: string) => {
    if (!driverId) return 'Desconhecido';
    return drivers.find(d => d.id === driverId)?.name || 'Removido';
  };

  // Agrupamento para o cupom de entrega
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

  return (
    <div className="flex flex-col h-full gap-6">
      <div className="flex items-center gap-4 bg-white p-2 rounded-3xl w-max shadow-sm border border-slate-100 flex-shrink-0">
        <button
          onClick={() => setActiveTab('PENDING')}
          className={`px-6 py-3 rounded-2xl text-[11px] font-black uppercase tracking-widest transition-all ${activeTab === 'PENDING' ? 'bg-slate-900 text-white shadow-xl' : 'text-slate-400 hover:bg-slate-50'}`}
        >
          Entregas Pendentes
        </button>
        <button
          onClick={() => setActiveTab('HISTORY')}
          className={`px-6 py-3 rounded-2xl text-[11px] font-black uppercase tracking-widest transition-all ${activeTab === 'HISTORY' ? 'bg-slate-900 text-white shadow-xl' : 'text-slate-400 hover:bg-slate-50'}`}
        >
          Histórico
        </button>
      </div>

      {activeTab === 'PENDING' ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6 overflow-y-auto pb-8">
          {readyOrders.length > 0 ? readyOrders.map(order => (
            <div key={order.id} className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 flex flex-col gap-4 group hover:shadow-xl transition-all">
              <div className="flex justify-between items-start">
                <div>
                  <h4 className="font-black text-slate-800 uppercase text-lg">{order.id.split('-')[1] || order.id}</h4>
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">{order.clientName}</p>
                </div>
                <div className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase text-white shadow-sm ${order.status === OrderStatus.READY ? 'bg-emerald-500' :
                  order.status === OrderStatus.OUT_FOR_DELIVERY ? 'bg-blue-600' : 'bg-slate-900'
                  }`}>
                  {OrderStatusLabels[order.status]}
                </div>
              </div>

              <div className="bg-slate-50 p-4 rounded-2xl flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <Icons.Logistics />
                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Destino:</p>
                </div>
                <p className="text-xs font-bold text-slate-700 leading-tight">{order.clientAddress || 'Endereço não informado'}</p>
              </div>

              <div className="flex justify-between items-center text-sm font-black text-slate-900 border-t border-slate-50 pt-3">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-slate-400 uppercase">Total:</span>
                  <span>R$ {order.total.toFixed(2)}</span>
                </div>
                <button
                  onClick={() => setPrintingOrder(order)}
                  className="p-2 text-slate-300 hover:text-blue-500 hover:bg-blue-50 rounded-xl transition-all"
                  title="Imprimir Cupom de Entrega"
                >
                  <Icons.Print />
                </button>
              </div>

              {order.status === OrderStatus.READY ? (
                <div className="mt-4 space-y-3">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Vincular Entregador:</p>
                  <div className="flex flex-col gap-2 max-h-40 overflow-y-auto pr-1">
                    {drivers.length > 0 ? drivers.map(driver => (
                      <button
                        key={driver.id}
                        onClick={() => assignDriver(order.id, driver.id)}
                        className="flex items-center gap-3 p-3 bg-white border border-slate-200 rounded-2xl text-left hover:border-blue-500 hover:bg-blue-50 transition-all group/btn"
                      >
                        <div className="w-8 h-8 bg-slate-900 rounded-lg flex items-center justify-center text-white text-[10px] font-black">{driver.name.charAt(0)}</div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[11px] font-black text-slate-800 truncate">{driver.name}</p>
                          <p className="text-[9px] text-slate-400 uppercase font-bold">{driver.vehicle.model}</p>
                        </div>
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-slate-200 group-hover/btn:text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M9 5l7 7-7 7" /></svg>
                      </button>
                    )) : (
                      <p className="text-[10px] text-slate-400 font-bold text-center italic py-2">Nenhum entregador online.</p>
                    )}
                  </div>
                </div>
              ) : order.status === OrderStatus.OUT_FOR_DELIVERY ? (
                <div className="mt-4 space-y-4">
                  <div className="flex items-center gap-3 p-4 bg-blue-50 border border-blue-100 rounded-2xl">
                    <div className="w-10 h-10 bg-blue-600 rounded-full flex items-center justify-center text-white font-black uppercase shadow-md">{getDriverName(order.driverId).charAt(0)}</div>
                    <div className="flex-1">
                      <p className="text-xs font-black text-blue-900 truncate">Com: {getDriverName(order.driverId)}</p>
                      <p className="text-[9px] text-blue-400 font-black uppercase mt-0.5">Veículo: {drivers.find(d => d.id === order.driverId)?.vehicle.plate || 'N/A'}</p>
                    </div>
                  </div>
                  <div className="p-3 bg-slate-50 border border-slate-100 rounded-xl text-center">
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Aguardando confirmação do Entregador no APP...</p>
                  </div>
                </div>
              ) : (
                <div className="mt-4 p-4 bg-emerald-50 border border-emerald-100 rounded-2xl text-center">
                  <p className="text-[10px] font-black text-emerald-700 uppercase tracking-widest">Entrega Finalizada</p>
                  <p className="text-[9px] text-emerald-400 font-bold uppercase mt-1">Por: {getDriverName(order.driverId)}</p>
                </div>
              )}
            </div>
          )) : (
            <div className="col-span-full py-20 text-center bg-white rounded-3xl border-2 border-dashed border-slate-100">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 mx-auto text-slate-200 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              <p className="text-slate-400 font-bold uppercase tracking-widest text-xs">Sem entregas pendentes no momento...</p>
            </div>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-6 h-full overflow-hidden">
          <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 flex gap-4 items-end flex-wrap">
            <div className="space-y-2 flex-1 min-w-[200px] relative">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Data Início</label>
              <input type="date" value={historyStartDate} onChange={e => setHistoryStartDate(e.target.value)} className="w-full p-4 bg-slate-50 border-none rounded-2xl font-bold text-sm" />
            </div>
            <div className="space-y-2 flex-1 min-w-[200px] relative">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Data Fim</label>
              <input type="date" value={historyEndDate} onChange={e => setHistoryEndDate(e.target.value)} className="w-full p-4 bg-slate-50 border-none rounded-2xl font-bold text-sm" />
            </div>
            <div className="space-y-2 flex-1 min-w-[200px] relative">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Entregador</label>
              <select value={historyDriverId} onChange={e => setHistoryDriverId(e.target.value)} className="w-full p-4 bg-slate-50 border-none rounded-2xl font-bold text-sm">
                <option value="TODOS">TODOS OS ENTREGADORES</option>
                {drivers.map(d => (
                  <option key={d.id} value={d.id}>{d.name} ({d.vehicle.plate})</option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6 pb-8">
            {historyOrders.filter(o => {
              const orderDate = o.createdAt.split('T')[0];
              const inDate = orderDate >= historyStartDate && orderDate <= historyEndDate;
              const inDriver = historyDriverId === 'TODOS' || o.driverId === historyDriverId;
              return inDate && inDriver;
            }).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map(order => (
              <div key={order.id} className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 flex flex-col gap-4 group hover:shadow-xl transition-all h-max">
                <div className="flex justify-between items-start">
                  <div>
                    <h4 className="font-black text-slate-800 uppercase text-lg">{order.id.split('-')[1] || order.id}</h4>
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">{order.clientName}</p>
                    <p className="text-[10px] text-slate-400 font-bold uppercase mt-1">Data: {new Date(order.createdAt).toLocaleDateString('pt-BR')}</p>
                  </div>
                  <div className="px-3 py-1.5 rounded-xl text-[10px] font-black uppercase text-white shadow-sm bg-emerald-500">
                    FINALIZADA
                  </div>
                </div>

                <div className="bg-slate-50 p-4 rounded-2xl flex flex-col gap-2">
                  <div className="flex items-center gap-2">
                    <Icons.Logistics />
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Entregue por:</p>
                  </div>
                  <p className="text-xs font-bold text-slate-700 leading-tight">{getDriverName(order.driverId)}</p>
                </div>

                <div className="flex justify-between items-center text-sm font-black text-slate-900 border-t border-slate-50 pt-3">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-slate-400 uppercase">Total:</span>
                    <span>R$ {order.total.toFixed(2)}</span>
                  </div>
                  <button
                    onClick={() => setPrintingHistoryOrder(order)}
                    className="p-2 text-slate-300 hover:text-blue-500 hover:bg-blue-50 rounded-xl transition-all"
                    title="Imprimir Cópia de Comprovante"
                  >
                    <Icons.Print />
                  </button>
                </div>
              </div>
            ))}
            {historyOrders.filter(o => {
              const orderDate = o.createdAt.split('T')[0];
              const inDate = orderDate >= historyStartDate && orderDate <= historyEndDate;
              const inDriver = historyDriverId === 'TODOS' || o.driverId === historyDriverId;
              return inDate && inDriver;
            }).length === 0 && (
                <div className="col-span-full py-20 text-center bg-white rounded-3xl border-2 border-dashed border-slate-100 mt-2">
                  <p className="text-slate-400 font-bold uppercase tracking-widest text-xs">Nenhum histórico encontrado para os filtros.</p>
                </div>
              )}
          </div>
        </div>
      )
      }

      {/* CUPOM DE ENTREGA AGRUPADO */}
      {
        printingOrder && businessSettings && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-md">
            <div className="relative w-full max-w-[80mm] bg-white p-8 border border-dashed shadow-2xl font-receipt text-[11px] text-black print-container is-receipt animate-in zoom-in duration-200">
              <div className="text-center mb-6 border-b border-dashed pb-4">
                <h2 className="font-black text-sm uppercase tracking-tighter">{businessSettings.name}</h2>
                <p className="text-[9px] font-bold mt-1 uppercase">Comprovante de Pagamento</p>
              </div>

              <div className="space-y-1 mb-4">
                <p>DATA: {new Date(printingOrder.createdAt).toLocaleString('pt-BR')}</p>
                <p>CLIENTE: {printingOrder.clientName}</p>
                {printingOrder.clientPhone && <p>FONE: {printingOrder.clientPhone}</p>}
                {printingOrder.clientAddress && (
                  <p className="font-bold border-t border-dashed mt-2 pt-1 uppercase leading-tight">ENTREGA: {printingOrder.clientAddress}</p>
                )}
                {printingOrder.tableNumber && <p className="font-black">MESA: {printingOrder.tableNumber}</p>}
                <p>MÉTODO: {printingOrder.paymentMethod || 'DINHEIRO'}</p>
              </div>

              <div className="border-t border-dashed my-3 py-3">
                {groupedPrintingItems.map(([id, data]) => (
                  <div key={id} className="flex justify-between font-black uppercase py-0.5">
                    <span>{data.quantity}x {data.name.substring(0, 18)}</span>
                    <span>R$ {(data.quantity * data.price).toFixed(2)}</span>
                  </div>
                ))}
              </div>

              <div className="flex justify-between items-end border-t border-dashed pt-4 mb-6">
                <span className="font-black text-[9px] uppercase tracking-widest">TOTAL:</span>
                <span className="text-2xl font-black">R$ {printingOrder.total.toFixed(2)}</span>
              </div>

              <div className="flex gap-2 no-print">
                <button onClick={() => window.print()} className="flex-1 bg-slate-900 text-white py-4 rounded-2xl font-black uppercase text-[10px] shadow-xl">Imprimir</button>
                <button onClick={() => setPrintingOrder(null)} className="flex-1 bg-slate-100 text-slate-600 py-4 rounded-2xl font-black uppercase text-[10px]">Fechar</button>
              </div>
            </div>
          </div>
        )
      }

      {/* CUPOM DE HISTÓRICO RESUMIDO */}
      {
        printingHistoryOrder && businessSettings && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-md">
            <div className="relative w-full max-w-[80mm] bg-white p-8 border border-dashed shadow-2xl font-receipt text-[11px] text-black print-container is-receipt animate-in zoom-in duration-200">
              <div className="text-center mb-6 border-b border-dashed pb-4">
                <h2 className="font-black text-sm uppercase tracking-tighter">{businessSettings.name}</h2>
                <p className="text-[9px] font-bold mt-1 uppercase">Cópia de Comprovante</p>
              </div>

              <div className="space-y-1 mb-4">
                <p>DATA: {new Date(printingHistoryOrder.createdAt).toLocaleString('pt-BR')}</p>
                <p>CLIENTE: {printingHistoryOrder.clientName}</p>
                {printingHistoryOrder.clientPhone && <p>FONE: {printingHistoryOrder.clientPhone}</p>}
                {printingHistoryOrder.clientAddress && (
                  <p className="font-bold border-t border-dashed mt-2 pt-1 uppercase leading-tight">ENTREGA: {printingHistoryOrder.clientAddress}</p>
                )}
                <p>MÉTODO: {printingHistoryOrder.paymentMethod || 'DINHEIRO'}</p>
                <p className="font-bold border-t border-dashed mt-2 pt-1 uppercase">ENTREGADOR: {getDriverName(printingHistoryOrder.driverId)}</p>
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
        )
      }
    </div >
  );
};

export default Logistics;
