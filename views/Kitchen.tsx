
import React, { useState, useEffect, useRef } from 'react';
import { Order, OrderStatus, OrderStatusLabels, Product, InventoryItem, User, SaleType, OrderItem, Waiter } from '../types';
import { db } from '../services/db';
import { socket } from '../services/socket';
import { Icons } from '../constants';

const Kitchen: React.FC = () => {
  const [orders, setOrders] = useState<Order[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [waiters, setWaiters] = useState<Waiter[]>([]);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [viewTab, setViewTab] = useState<'FILA' | 'HISTORICO'>('FILA');

  // Controle de seleção local por pedido: { orderId: [uids selecionados] }
  const [selectedItems, setSelectedItems] = useState<Record<string, string[]>>({});

  const lastOrdersCount = useRef<number>(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    audioRef.current = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3');
    const session = db.getCurrentSession();
    if (session) setCurrentUser(session.user);

    refreshData(true);
    const interval = setInterval(() => refreshData(false), 3000);

    // Socket.io Real-time
    const handleNewOrder = () => refreshData(false);
    socket.on('newOrder', handleNewOrder);

    return () => {
      clearInterval(interval);
      socket.off('newOrder', handleNewOrder);
    };
  }, [viewTab]);

  const refreshData = async (isFirstLoad: boolean) => {
    const allOrders = await db.getOrders();
    const allProducts = await db.getProducts();
    const allInventory = await db.getInventory();
    const allWaiters = await db.getWaiters();

    // Filtro inteligente: Pedidos ativos (não finalizados ou cancelados)
    const activeOrders = allOrders.filter(o =>
      o.status !== OrderStatus.CANCELLED &&
      o.status !== OrderStatus.DELIVERED
    );

    if (!isFirstLoad && viewTab === 'FILA' && activeOrders.length > lastOrdersCount.current) {
      audioRef.current?.play().catch(e => console.log("Audio play blocked"));
    }

    lastOrdersCount.current = activeOrders.length;

    if (viewTab === 'FILA') {
      setOrders(activeOrders.sort((a, b) => a.createdAt.localeCompare(b.createdAt)));
    } else {
      // Histórico mostra pedidos que tem itens prontos
      const finished = allOrders.filter(o => o.items.some(it => it.isReady))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      setOrders(finished);
    }

    setProducts(allProducts);
    setInventory(allInventory);
    setWaiters(allWaiters);
  };

  const toggleItemSelection = (orderId: string, itemUid: string) => {
    setSelectedItems(prev => {
      const current = prev[orderId] || [];
      const next = current.includes(itemUid)
        ? current.filter(uid => uid !== itemUid)
        : [...current, itemUid];
      return { ...prev, [orderId]: next };
    });
  };

  const markSelectedAsReady = async (order: Order) => {
    if (!currentUser) return;
    const itemsToMark = selectedItems[order.id] || [];
    if (itemsToMark.length === 0) return alert("Selecione ao menos um item para finalizar.");

    const updatedItems = order.items.map(it => {
      if (itemsToMark.includes(it.uid)) {
        return { ...it, isReady: true, readyAt: new Date().toISOString() };
      }
      return it;
    });

    const allReady = updatedItems.every(it => it.isReady);
    const anyReady = updatedItems.some(it => it.isReady);
    const updatedOrder: Order = {
      ...order,
      items: updatedItems,
      status: allReady ? OrderStatus.READY : (anyReady ? OrderStatus.PARTIALLY_READY : OrderStatus.PREPARING)
    };

    await db.saveOrder(updatedOrder, currentUser);

    if (order.type === SaleType.TABLE && order.tableNumber) {
      const sess = (await db.getTableSessions()).find(s => s.tableNumber === order.tableNumber);
      if (sess) {
        await db.saveTableSession({ ...sess, items: updatedItems });
      }
    }

    setSelectedItems(prev => {
      const next = { ...prev };
      delete next[order.id];
      return next;
    });

    await refreshData(false);
  };


  const translateOrderType = (type: SaleType | string) => {
    switch (type) {
      case SaleType.COUNTER: return 'Balcão';
      case SaleType.TABLE: return 'Mesa';
      case SaleType.OWN_DELIVERY: return 'Delivery';
      default: return type;
    }
  };

  const getWaiterName = (waiterId?: string) => {
    if (!waiterId) return 'Garçom Externo';
    return waiters.find(w => w.id === waiterId)?.name || 'Garçom';
  };

  return (
    <div className="space-y-6">
      <div className="flex gap-6 border-b pb-2">
        <button onClick={() => setViewTab('FILA')} className={`pb-4 text-xl font-black uppercase transition-all ${viewTab === 'FILA' ? 'text-blue-600 border-b-4 border-blue-600' : 'text-slate-400 hover:text-slate-600'}`}>Fila de Produção</button>
        <button onClick={() => setViewTab('HISTORICO')} className={`pb-4 text-xl font-black uppercase transition-all ${viewTab === 'HISTORICO' ? 'text-blue-600 border-b-4 border-blue-600' : 'text-slate-400 hover:text-slate-600'}`}>Histórico de Itens</button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {orders.length > 0 ? orders.map(order => (
          <div
            key={order.id}
            className={`bg-white rounded-[2rem] border-2 transition-all flex flex-col overflow-hidden shadow-sm hover:shadow-xl ${viewTab === 'FILA' ? 'border-blue-100' : 'border-slate-100 opacity-90'
              }`}
          >
            <div className={`p-6 flex flex-col ${viewTab === 'FILA' ? 'bg-blue-50' : 'bg-slate-50'}`}>
              <div className="flex justify-between items-start">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest truncate max-w-[150px]">
                  {order.type === SaleType.TABLE ? getWaiterName(order.waiterId) : (order.id.split('-')[1] || order.id)}
                </p>
                <span className="text-[10px] font-black bg-white px-3 py-1 rounded-full text-blue-600 shadow-sm uppercase">
                  {new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(new Date(order.createdAt))}
                </span>
              </div>
              <h4 className="font-black text-slate-800 uppercase text-lg mt-2">
                {translateOrderType(order.type)} {order.tableNumber ? `- MESA ${order.tableNumber}` : ''}
                {order.status === OrderStatus.REOPENED && (
                  <span className="ml-2 inline-block px-2 py-0.5 bg-amber-100 text-amber-600 rounded-md text-[8px] font-black animate-pulse">REABERTA</span>
                )}
              </h4>
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-tight truncate">{order.clientName}</p>
            </div>

            <div className="p-6 flex-1 space-y-4 max-h-[400px] overflow-y-auto">
              <div className="flex justify-between items-center mb-2">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                  {viewTab === 'FILA' ? 'Itens Pendentes' : 'Itens Produzidos'}
                </p>
              </div>

              {order.items.filter(it => viewTab === 'FILA' ? !it.isReady : it.isReady).map((item, idx) => {
                const product = products.find(p => p.id === item.productId);
                const isSelected = (selectedItems[order.id] || []).includes(item.uid);

                return (
                  <div key={item.uid} className="space-y-2 animate-in fade-in duration-300">
                    <label className={`block cursor-pointer bg-white p-4 rounded-2xl border transition-all shadow-sm ${isSelected ? 'border-blue-600 ring-2 ring-blue-50' : 'border-slate-100 hover:border-blue-200'
                      }`}>
                      <div className="flex items-center gap-3">
                        {viewTab === 'FILA' && (
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleItemSelection(order.id, item.uid)}
                            className="w-4 h-4 rounded-md border-slate-300 text-blue-600 focus:ring-blue-500"
                          />
                        )}
                        <div className="flex-1">
                          <p className="font-black text-slate-800 uppercase text-xs">
                            <span className="text-blue-600 text-sm">{item.quantity}x</span> {product?.name}
                          </p>
                          {item.isReady && (
                            <p className="text-[8px] text-emerald-500 font-black uppercase mt-1">Pronto em: {new Date(item.readyAt!).toLocaleTimeString()}</p>
                          )}
                        </div>
                      </div>
                    </label>
                  </div>
                );
              })}

              {viewTab === 'FILA' && order.items.some(it => it.isReady) && (
                <div className="pt-4 border-t border-slate-100">
                  <p className="text-[8px] font-black text-slate-300 uppercase tracking-widest mb-2">Itens já saíram:</p>
                  {order.items.filter(it => it.isReady).map((it, i) => (
                    <p key={it.uid} className="text-[10px] font-bold text-slate-300 line-through uppercase">{it.quantity}x {products.find(p => p.id === it.productId)?.name}</p>
                  ))}
                </div>
              )}
            </div>

            {viewTab === 'FILA' && (
              <div className="p-6 bg-white border-t border-slate-50">
                {!order.items.every(it => it.isReady) && (
                  <button
                    onClick={() => markSelectedAsReady(order)}
                    className="w-full py-4 bg-blue-600 hover:bg-blue-700 text-white font-black text-xs uppercase rounded-2xl shadow-xl shadow-blue-100 transition-all active:scale-95 flex items-center justify-center gap-2"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                    Concluir Selecionados
                  </button>
                )}
              </div>
            )}
          </div>
        )) : (
          <div className="col-span-full py-20 text-center bg-white rounded-[3rem] border-2 border-dashed border-slate-100">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-16 w-16 mx-auto text-slate-100 mb-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            <p className="text-slate-400 font-black uppercase tracking-[0.2em] text-[10px]">Cozinha em dia! Sem pendências.</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default Kitchen;
