
import React, { useState, useEffect, useRef } from 'react';
import { Order, OrderStatus, OrderStatusLabels, Product, InventoryItem, User, SaleType, OrderItem, Waiter, BusinessSettings } from '../types';
import { db } from '../services/db';
import { socket } from '../services/socket';
import { Icons } from '../constants';
import { useDigitalAlert } from '../hooks/useDigitalAlert';
import { useToast } from '../hooks/useToast';

const Kitchen: React.FC = () => {
  const { addToast } = useToast();
  const { isAlerting, dismissAlert } = useDigitalAlert();
  const [orders, setOrders] = useState<Order[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [waiters, setWaiters] = useState<Waiter[]>([]);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [viewTab, setViewTab] = useState<'FILA' | 'HISTORICO'>('FILA');
  const [isLoading, setIsLoading] = useState(false);
  const [businessSettings, setBusinessSettings] = useState<BusinessSettings | null>(null);
  const [printingOrder, setPrintingOrder] = useState<Order | null>(null);
  const [viewingItemsOrder, setViewingItemsOrder] = useState<Order | null>(null);

  // Controle de seleção local por pedido: { orderId: [uids selecionados] }
  const [selectedItems, setSelectedItems] = useState<Record<string, string[]>>({});
  const [acknowledgedOrders, setAcknowledgedOrders] = useState<Set<string>>(new Set());

  const prevItemCounts = useRef<Record<string, number>>({});
  const lastOrdersCount = useRef<number>(0);

  useEffect(() => {
    const session = db.getCurrentSession();
    if (session) setCurrentUser(session.user);

    refreshData(true);
    const interval = setInterval(() => refreshData(false), 10000); // 10s para Render Free

    // Socket.io Real-time
    const handleNewOrder = () => refreshData(false);
    socket.on('newOrder', handleNewOrder);

    return () => {
      clearInterval(interval);
      socket.off('newOrder', handleNewOrder);
    };
  }, [viewTab]);

  const refreshData = async (isFirstLoad: boolean) => {
    if (isFirstLoad) setIsLoading(true);
    try {
      const allOrders = await db.getOrders();
      const allProducts = await db.getProducts();
      const allInventory = await db.getInventory();
      const allWaiters = await db.getWaiters();
      const settings = await db.getSettings();

      // Filtro inteligente: Pedidos ativos (não finalizados ou cancelados) QUE POSSUEM itens em preparo
      const activeOrders = allOrders.filter(o =>
        o.status !== OrderStatus.CANCELLED &&
        o.status !== OrderStatus.DELIVERED &&
        o.items.length > 0 &&
        !(o.isOriginDeliveryApp && o.status === OrderStatus.PENDING)
      );

      // Detectar novos itens em pedidos existentes para resetar o blink
      activeOrders.forEach(order => {
        const currentCount = order.items.length;
        const prevCount = prevItemCounts.current[order.id] || 0;

        if (currentCount > prevCount && !isFirstLoad) {
          // Se aumentou o número de itens, remove do acknowledged para voltar a piscar
          setAcknowledgedOrders(prev => {
            const next = new Set(prev);
            next.delete(order.id);
            return next;
          });
        }
        prevItemCounts.current[order.id] = currentCount;
      });

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
      setBusinessSettings(settings);
    } catch (error) {
      console.error("Error refreshing Kitchen data:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const toggleItemSelection = (orderId: string, itemUid: string) => {
    // Acknowledge order on any interaction
    if (!acknowledgedOrders.has(orderId)) {
      setAcknowledgedOrders(prev => new Set(prev).add(orderId));
    }
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
    if (itemsToMark.length === 0) {
      addToast({ title: 'Aviso', message: "Selecione ao menos um item para finalizar.", type: 'INFO' });
      return;
    }

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

    try {
      await db.markItemsReady(order.id, itemsToMark, currentUser);
    } catch (error: any) {
      addToast({ title: 'Erro', message: error.message || "Erro ao salvar pedido na cozinha.", type: 'DANGER' });
    }

    setSelectedItems(prev => {
      const next = { ...prev };
      delete next[order.id];
      return next;
    });

    await refreshData(false);
  };

  const handlePrint = (order: Order) => {
    setPrintingOrder(order);
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
    <div className="h-full flex flex-col space-y-6 rounded-[2rem] p-2 transition-all duration-300 relative" onClick={() => { if (isAlerting) dismissAlert(); }}>
      <div className="flex gap-6 shrink-0">
        <button onClick={() => setViewTab('FILA')} className={`pb-4 text-xl font-black uppercase transition-all ${viewTab === 'FILA' ? 'text-blue-600 border-b-4 border-blue-600' : 'text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300'}`}>Fila de Produção</button>
        <button onClick={() => setViewTab('HISTORICO')} className={`pb-4 text-xl font-black uppercase transition-all ${viewTab === 'HISTORICO' ? 'text-blue-600 border-b-4 border-blue-600' : 'text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300'}`}>Histórico de Itens</button>
      </div>

      <div className="flex-1 min-h-0 overflow-hidden">
        {orders.length > 0 ? (
          viewTab === 'FILA' ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-x-4 md:gap-x-6 gap-y-10 md:gap-y-14 h-full overflow-y-auto pr-2 custom-scrollbar content-start items-start pb-4">
              {orders.map(order => (
                <div
                  key={order.id}
                  onClick={() => {
                    if (!acknowledgedOrders.has(order.id)) {
                      setAcknowledgedOrders(prev => new Set(prev).add(order.id));
                    }
                  }}
                  className={`bg-white dark:bg-slate-800 rounded-[2rem] border-2 transition-all flex flex-col overflow-hidden shadow-sm hover:shadow-xl border-blue-100 dark:border-blue-900/30 ${!acknowledgedOrders.has(order.id) ? 'animate-moderate-blink border-blue-400 dark:border-blue-500' : ''}`}
                >
                  <div className="flex flex-col p-6 bg-blue-50 dark:bg-blue-900/20">
                    <div className="flex justify-between items-start gap-2">
                      <div className="flex-1 min-w-0">
                        <h4 className="text-lg font-black text-slate-800 dark:text-white uppercase tracking-tighter truncate">
                          {translateOrderType(order.type)} {order.tableNumber ? `- MESA ${order.tableNumber}` : ''}
                        </h4>
                        <p className="text-[10px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-widest truncate">
                          {order.clientName || 'Cliente Direto'}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handlePrint(order);
                          }}
                          className="p-2 bg-white dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 rounded-xl shadow-sm hover:bg-blue-600 hover:text-white dark:hover:bg-blue-600 transition-all active:scale-90"
                          title="Imprimir Cupom de Produção"
                        >
                          <Icons.Print size={14} />
                        </button>
                        <span className="text-[10px] font-black bg-white dark:bg-blue-900/40 px-3 py-1 rounded-full text-blue-600 dark:text-blue-400 shadow-sm">
                          {new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(new Date(order.createdAt))}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="p-4 md:p-6 flex-1 flex flex-col min-h-0">
                    <div className="flex justify-between items-center mb-3">
                      <p className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">
                        Itens Pendentes
                      </p>
                    </div>
                    <div className="space-y-2 overflow-y-auto pr-1 custom-scrollbar max-h-[350px] md:max-h-[450px]">
                      {order.items.filter(it => !it.isReady).map((item) => {
                        const product = products.find(p => p.id === item.productId);
                        const isSelected = (selectedItems[order.id] || []).includes(item.uid);

                        return (
                          <div key={item.uid} className="space-y-1 animate-in fade-in duration-300">
                            <label className={`block cursor-pointer bg-white dark:bg-slate-900/40 p-3 rounded-xl border transition-all shadow-sm ${isSelected ? 'border-blue-600 dark:border-blue-500 ring-2 ring-blue-50 dark:ring-blue-900/20' : 'border-slate-100 dark:border-slate-800 hover:border-blue-100 dark:hover:border-blue-900/40'}`}>
                              <div className="flex items-center gap-3">
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  onChange={() => toggleItemSelection(order.id, item.uid)}
                                  className="w-4 h-4 rounded-md border-slate-300 text-blue-600 focus:ring-blue-500"
                                />
                                <div className="flex-1 min-w-0">
                                  <p className="font-black text-slate-700 dark:text-slate-300 uppercase text-[11px] truncate">
                                    <span className="text-blue-600 dark:text-blue-400 text-xs">{item.quantity}x</span> {product?.name}
                                  </p>
                                  {item.observations && (
                                    <p className="inline-block text-[9px] text-orange-600 dark:text-orange-400 font-bold bg-orange-100/50 dark:bg-orange-900/20 px-2 py-0.5 rounded-md mt-1 border border-orange-200/50 dark:border-orange-900/30">
                                      Obs: {item.observations}
                                    </p>
                                  )}
                                  
                                  {/* Ficha Técnica (Ingredientes) */}
                                  {product?.recipe && product.recipe.length > 0 && (
                                    <div className="mt-2 space-y-1 bg-slate-50/50 dark:bg-slate-800/20 p-2 rounded-lg border border-slate-100/50 dark:border-slate-800/50">
                                      <p className="text-[8px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-1 flex items-center gap-1">
                                        <Icons.Alert size={8} /> Ficha Técnica
                                      </p>
                                      {product.recipe.map((r, idx) => {
                                        const invItem = inventory.find(inv => inv.id === r.inventoryItemId);
                                        const totalQty = r.quantity * item.quantity;
                                        return (
                                          <div key={idx} className="flex items-center gap-1.5">
                                            <div className="w-1 h-1 rounded-full bg-blue-400/50" />
                                            <p className="text-[9px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-tight">
                                              {invItem?.name}: <span className="text-blue-600 dark:text-blue-400">{totalQty} {invItem?.unit}</span>
                                            </p>
                                          </div>
                                        );
                                      })}
                                    </div>
                                  )}
                                </div>
                              </div>
                            </label>
                          </div>
                        );
                      })}
                    </div>

                    {order.items.some(it => it.isReady) && (
                      <div className="pt-4 border-t border-slate-100 dark:border-slate-700 mt-auto">
                        <p className="text-[8px] font-black text-slate-300 dark:text-slate-600 uppercase tracking-widest mb-2">Itens já saíram:</p>
                        {order.items.filter(it => it.isReady).map((it) => (
                          <p key={it.uid} className="text-[10px] font-bold text-slate-300 dark:text-slate-600 line-through uppercase">{it.quantity}x {products.find(p => p.id === it.productId)?.name}</p>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="p-4 md:p-6 bg-slate-50/50 dark:bg-slate-900/50 border-t border-slate-100 dark:border-slate-700 shrink-0">
                    {!order.items.every(it => it.isReady) && (
                      <button
                        onClick={() => markSelectedAsReady(order)}
                        className="w-full py-5 md:py-4 bg-blue-600 hover:bg-blue-700 text-white font-black text-sm md:text-xs uppercase rounded-2xl shadow-xl shadow-blue-200 dark:shadow-blue-900/20 transition-all active:scale-95 flex items-center justify-center gap-3"
                      >
                        <Icons.Check size={18} />
                        Concluir Selecionados
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="h-full overflow-auto bg-white dark:bg-slate-900 rounded-[2.5rem] border border-slate-100 dark:border-slate-800 shadow-sm custom-scrollbar">
              <table className="w-full text-left border-collapse min-w-[800px]">
                <thead>
                  <tr className="bg-slate-50/50 dark:bg-slate-800/30 border-b border-slate-100 dark:border-slate-800">
                    <th className="px-8 py-5 text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">Status</th>
                    <th className="px-8 py-5 text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">Tipo / Origem</th>
                    <th className="px-8 py-5 text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">Atendimento</th>
                    <th className="px-8 py-5 text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">Data / Hora</th>
                    <th className="px-8 py-5 text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">Total</th>
                    <th className="px-8 py-5 text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
                  {orders.map(order => (
                    <tr key={order.id} className="hover:bg-slate-50/30 dark:hover:bg-slate-800/20 group transition-colors">
                      <td className="px-8 py-5">
                        <span className="px-3 py-1.5 rounded-xl text-[9px] font-black uppercase text-white shadow-sm bg-emerald-500">
                          CONCLUÍDO
                        </span>
                      </td>
                      <td className="px-8 py-5">
                        <p className="font-black text-slate-800 dark:text-white text-[11px] uppercase tracking-tighter">
                          {translateOrderType(order.type)} {order.tableNumber ? `(Mesa ${order.tableNumber})` : ''}
                        </p>
                        <p className="text-[9px] text-slate-400 dark:text-slate-500 font-bold uppercase truncate max-w-[150px]">
                          {order.clientName || 'Cliente Direto'}
                        </p>
                      </td>
                      <td className="px-8 py-5">
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 bg-slate-100 dark:bg-slate-800 rounded-lg flex items-center justify-center text-[9px] font-black text-slate-500">
                            {getWaiterName(order.waiterId).charAt(0)}
                          </div>
                          <p className="text-[10px] font-bold text-slate-600 dark:text-slate-400 uppercase">
                            {getWaiterName(order.waiterId)}
                          </p>
                        </div>
                      </td>
                      <td className="px-8 py-5">
                        <div className="space-y-0.5">
                          <p className="text-[10px] font-bold text-slate-700 dark:text-slate-300">
                            {new Date(order.createdAt).toLocaleDateString('pt-BR')}
                          </p>
                          <p className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase">
                            {new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(new Date(order.createdAt))}
                          </p>
                        </div>
                      </td>
                      <td className="px-8 py-5">
                        <p className="text-[11px] font-black text-blue-600 dark:text-blue-400">
                          R$ {(order.total || 0).toFixed(2)}
                        </p>
                      </td>
                      <td className="px-8 py-5">
                        <div className="flex justify-end gap-2">
                          <button
                            onClick={() => setViewingItemsOrder(order)}
                            className="p-2.5 text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 bg-slate-50 dark:bg-slate-800/50 rounded-xl transition-all"
                            title="Ver Itens / Imprimir Cupom"
                          >
                            <Icons.Print size={18} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : (
          <div className="h-full flex flex-col items-center justify-center text-center bg-white dark:bg-slate-900 rounded-[3rem] border-2 border-dashed border-slate-100 dark:border-slate-800 p-8">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-24 w-24 mx-auto text-slate-100 dark:text-slate-800 mb-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            <p className="text-slate-400 dark:text-slate-500 font-black uppercase tracking-[0.2em] text-xs">Cozinha em dia! Sem pendências.</p>
          </div>
        )}
      </div>

      {/* Modal de Itens Preparados */}
      {viewingItemsOrder && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-md">
          <div className="bg-white dark:bg-slate-900 rounded-[2.5rem] shadow-2xl w-full max-w-lg overflow-hidden animate-in zoom-in duration-200 border border-slate-100 dark:border-slate-800">
            <div className="p-8 border-b border-slate-50 dark:border-slate-800 flex justify-between items-center">
              <div>
                <h3 className="text-xl font-black text-slate-800 dark:text-white uppercase tracking-tighter">Itens Preparados</h3>
                <p className="text-[10px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-widest">
                  {translateOrderType(viewingItemsOrder.type)} {viewingItemsOrder.tableNumber ? `- Mesa ${viewingItemsOrder.tableNumber}` : ''}
                </p>
              </div>
              <button
                onClick={() => setViewingItemsOrder(null)}
                className="p-3 bg-slate-50 dark:bg-slate-800 text-slate-400 dark:text-slate-500 rounded-2xl hover:text-red-500 transition-all"
              >
                <Icons.X size={20} />
              </button>
            </div>

            <div className="p-8 max-h-[60vh] overflow-y-auto custom-scrollbar">
              <div className="space-y-3">
                {viewingItemsOrder.items.filter(it => it.isReady).map((item) => {
                  const product = products.find(p => p.id === item.productId);
                  return (
                    <div key={item.uid} className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-2xl border border-slate-100 dark:border-slate-800 flex justify-between items-center">
                      <div className="flex-1 min-w-0">
                        <p className="font-black text-slate-800 dark:text-slate-200 uppercase text-xs">
                          <span className="text-blue-600 dark:text-blue-400">{item.quantity}x</span> {product?.name}
                        </p>
                        {item.observations && (
                          <p className="text-[9px] text-orange-600 dark:text-orange-400 font-bold mt-1">
                            Obs: {item.observations}
                          </p>
                        )}
                      </div>
                      <div className="text-right shrink-0 ml-4">
                        <span className="text-[8px] font-black text-emerald-500 dark:text-emerald-400 uppercase bg-emerald-100 dark:bg-emerald-900/40 px-2 py-1 rounded-md">
                          PRONTO
                        </span>
                        {item.readyAt && (
                          <p className="text-[8px] text-slate-400 font-bold mt-1 italic">
                            {new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(new Date(item.readyAt))}
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="p-8 bg-slate-50/50 dark:bg-slate-900 border-t border-slate-100 dark:border-slate-800 flex justify-end gap-3">
              <button
                onClick={() => {
                  handlePrint(viewingItemsOrder);
                  setViewingItemsOrder(null);
                }}
                className="flex-1 py-4 bg-slate-900 dark:bg-blue-600 text-white rounded-2xl font-black uppercase text-[10px] tracking-widest shadow-xl transition-all flex items-center justify-center gap-2"
              >
                <Icons.Print size={14} />
                Imprimir Cupom
              </button>
              <button
                onClick={() => setViewingItemsOrder(null)}
                className="px-8 py-4 bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-400 rounded-2xl font-black uppercase text-[10px] tracking-widest border border-slate-200 dark:border-slate-700 transition-all"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {printingOrder && businessSettings && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-md">
          <div className="relative w-full max-w-[80mm] bg-white p-8 border border-dashed shadow-2xl font-receipt text-[11px] text-black print-container is-receipt animate-in zoom-in duration-200">
            <div className="text-center mb-6 border-b border-dashed pb-4">
              <h2 className="font-black text-sm uppercase tracking-tighter">{businessSettings.name}</h2>
              <p className="text-[9px] font-bold mt-1 uppercase">
                {viewTab === 'FILA' ? 'Cupom de Produção' : 'Conferência de Consumo'}
              </p>
              
              {printingOrder.tableNumber && (
                <div className="mt-4 flex justify-center">
                  <span className="bg-slate-900 text-white px-4 py-1.5 rounded-lg font-black text-xs uppercase tracking-widest">
                    Mesa {printingOrder.tableNumber}
                  </span>
                </div>
              )}
            </div>

            <div className="space-y-1 mb-4">
              <p>DATA: {new Date(printingOrder.createdAt).toLocaleString('pt-BR')}</p>
              <p>TIPO: {translateOrderType(printingOrder.type)}</p>
              <p>CLIENTE: {printingOrder.clientName || 'Cliente Direto'}</p>
              {printingOrder.waiterId && (
                <p>RESPONSÁVEL: {getWaiterName(printingOrder.waiterId)}</p>
              )}
            </div>

            <div className="border-t border-dashed my-3 py-3 space-y-3">
              {printingOrder.items.map((it, idx) => {
                const product = products.find(p => p.id === it.productId);
                const isReady = it.isReady;
                
                // Em modo HISTORICO, só mostra os prontos. No modo FILA (Produção), mostra todos.
                if (viewTab === 'HISTORICO' && !isReady) return null;

                return (
                  <div key={idx} className="space-y-1">
                    <div className={`flex justify-between font-black uppercase py-0.5 ${isReady && viewTab === 'FILA' ? 'line-through opacity-50' : ''}`}>
                      <span>{it.quantity}X {(product?.name || 'Item').substring(0, 22)}</span>
                      {isReady && it.readyAt && (
                        <span className="text-[8px] opacity-50">
                          {new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(new Date(it.readyAt))}
                        </span>
                      )}
                    </div>
                    
                    {/* Ficha Técnica no Cupom */}
                    {product?.recipe && product.recipe.length > 0 && (
                      <div className="pl-4 space-y-0.5 border-l border-slate-200">
                        <p className="text-[8px] font-black uppercase text-slate-500">Ficha Técnica:</p>
                        {product.recipe.map((r, rIdx) => {
                          const invItem = inventory.find(inv => inv.id === r.inventoryItemId);
                          return (
                            <p key={rIdx} className="text-[9px] font-bold text-slate-700 uppercase">
                              - {invItem?.name}: {r.quantity * it.quantity} {invItem?.unit}
                            </p>
                          );
                        })}
                      </div>
                    )}

                    {it.observations && (
                      <p className="text-[9px] text-orange-600 font-black pl-4">
                        * OBS: {it.observations}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>

            {viewTab === 'HISTORICO' && (
              <div className="flex justify-between items-end border-t border-dashed pt-4 mb-8">
                <span className="font-black text-[10px] uppercase tracking-widest">TOTAL:</span>
                <span className="text-2xl font-black">R$ {(printingOrder.total || 0).toFixed(2)}</span>
              </div>
            )}

            {viewTab === 'FILA' && (
              <div className="text-center border-t border-dashed pt-4 mb-8">
                <p className="text-[8px] font-black uppercase tracking-widest opacity-50 italic">Fila de Produção - Sem valor fiscal</p>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4 no-print mt-6">
              <button
                onClick={() => window.print()}
                className="bg-slate-900 text-white py-4 rounded-[22px] font-receipt font-black uppercase text-[11px] shadow-xl hover:bg-black active:scale-95 transition-all flex items-center justify-center"
              >
                IMPRIMIR
              </button>
              <button
                onClick={() => setPrintingOrder(null)}
                className="bg-slate-50 text-slate-400 py-4 rounded-[22px] font-receipt font-black uppercase text-[11px] hover:bg-slate-100 active:scale-95 transition-all flex items-center justify-center"
              >
                FECHAR
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Kitchen;
