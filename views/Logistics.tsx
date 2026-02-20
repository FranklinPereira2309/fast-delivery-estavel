
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

      {/* CUPOM DE ENTREGA AGRUPADO */}
      {printingOrder && businessSettings && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-md">
          <div className="relative w-full max-w-[80mm] bg-white p-8 border border-dashed shadow-2xl font-receipt text-[11px] text-black print-container is-receipt animate-in zoom-in duration-200">
            <div className="text-center mb-6 border-b border-dashed pb-4">
              <h2 className="font-black text-sm uppercase tracking-tighter">{businessSettings.name}</h2>
              <p className="text-[9px] font-bold mt-1">CUPOM DE ENTREGA</p>
              <p className="text-[10px] font-black mt-2">PEDIDO: {printingOrder.id.split('-')[1] || printingOrder.id}</p>
            </div>

            <div className="space-y-4 mb-6">
              <div>
                <p className="font-black uppercase text-[10px]">Cliente:</p>
                <p className="text-xs font-black">{printingOrder.clientName}</p>
              </div>
              <div>
                <p className="font-black uppercase text-[10px]">Endereço de Entrega:</p>
                <p className="text-xs font-black leading-tight border border-slate-200 p-2 rounded-lg bg-slate-50">{printingOrder.clientAddress || 'Endereço não cadastrado'}</p>
              </div>
            </div>

            <div className="border-y border-dashed py-4 mb-4">
              <p className="font-black uppercase text-[9px] mb-2 text-center">Itens do Pedido</p>
              {groupedPrintingItems.map(([id, data]) => (
                <div key={id} className="flex justify-between font-black uppercase py-0.5 border-b border-slate-50 last:border-0">
                  <span>{data.quantity}x {data.name.substring(0, 20)}</span>
                  <span>R$ {(data.quantity * data.price).toFixed(2)}</span>
                </div>
              ))}
            </div>

            <div className="flex justify-between items-end border-b border-dashed pb-4 mb-4">
              <span className="font-black text-[9px] uppercase">TOTAL A RECEBER:</span>
              <span className="text-xl font-black">R$ {printingOrder.total.toFixed(2)}</span>
            </div>

            <div className="flex gap-2 no-print">
              <button onClick={() => window.print()} className="flex-1 bg-slate-900 text-white py-3 rounded-2xl font-black uppercase text-[10px] tracking-widest shadow-xl">Imprimir</button>
              <button onClick={() => setPrintingOrder(null)} className="flex-1 bg-slate-100 text-slate-600 py-3 rounded-2xl font-black uppercase text-[10px] tracking-widest">Fechar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Logistics;
