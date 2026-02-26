
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Order, OrderStatus, OrderStatusLabels, SaleType, Product } from '../types';
import { db, BusinessSettings } from '../services/db';
import { Icons } from '../constants';
import CustomAlert from '../components/CustomAlert';

const SalesMonitor: React.FC = () => {
  const [orders, setOrders] = useState<Order[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [businessSettings, setBusinessSettings] = useState<BusinessSettings | null>(null);
  const [printingOrder, setPrintingOrder] = useState<Order | null>(null);
  const [isNfceVisual, setIsNfceVisual] = useState(false);
  const [editingPaymentMethod, setEditingPaymentMethod] = useState(false);
  const [newPaymentMethod, setNewPaymentMethod] = useState('');
  const [isSavingPayment, setIsSavingPayment] = useState(false);
  const [changedOrderIds, setChangedOrderIds] = useState<Set<string>>(new Set());

  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 15;

  const prevOrdersRef = useRef<Record<string, OrderStatus>>({});

  useEffect(() => {
    refreshData();
    const interval = setInterval(refreshData, 3000);
    return () => clearInterval(interval);
  }, []);

  const refreshData = async () => {
    const [p, o, s] = await Promise.all([
      db.getProducts(),
      db.getOrders(),
      db.getSettings(),
    ]);

    setProducts(p);
    const sortedOrders = o.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    const newChangedIds = new Set<string>();
    sortedOrders.forEach(order => {
      if (prevOrdersRef.current[order.id] && prevOrdersRef.current[order.id] !== order.status) {
        newChangedIds.add(order.id);
        setTimeout(() => {
          setChangedOrderIds(prev => {
            const next = new Set(prev);
            next.delete(order.id);
            return next;
          });
        }, 5000);
      }
      prevOrdersRef.current[order.id] = order.status;
    });

    if (newChangedIds.size > 0) {
      setChangedOrderIds(prev => new Set([...prev, ...newChangedIds]));
    }

    setOrders(sortedOrders);
    setBusinessSettings(s);
  };

  const getFriendlySaleType = (type: SaleType | string) => {
    switch (type) {
      case SaleType.COUNTER: return 'Balcão';
      case SaleType.TABLE: return 'Mesa';
      case SaleType.OWN_DELIVERY: return 'Delivery';
      default: return type;
    }
  };

  // Agrupamento para o cupom de reemissão
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
    <div className="flex flex-col h-full gap-6 animate-in fade-in duration-500">
      <div className="flex-1 bg-white rounded-[3rem] shadow-sm border border-slate-100 overflow-hidden flex flex-col">
        <div className="p-8 border-b border-slate-50 bg-slate-50 flex justify-between items-center">
          <div>
            <h3 className="font-black text-slate-800 uppercase tracking-tighter text-xl">Monitor de Vendas e Fluxo</h3>
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Acompanhamento de status e finalizações em tempo real</p>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b text-slate-400 text-[10px] uppercase font-black tracking-widest bg-slate-50/50">
                <th className="px-8 py-6">Status Atual</th>
                <th className="px-8 py-6">Identificação / Mesa</th>
                <th className="px-8 py-6">Itens</th>
                <th className="px-8 py-6">Taxa</th>
                <th className="px-8 py-6 text-right">Controle</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {orders.map(order => {
                const isRecentlyChanged = changedOrderIds.has(order.id);
                const blinkClass = isRecentlyChanged ? 'animate-notify-turquoise' : '';

                return (
                  <tr key={order.id} className="hover:bg-slate-50/50 group transition-colors">
                    <td className="px-8 py-5">
                      <span className={`text-[9px] font-black px-4 py-2 rounded-xl text-white uppercase shadow-sm transition-all duration-300 ${blinkClass} ${order.status === OrderStatus.DELIVERED ? 'bg-slate-900' :
                        order.status === OrderStatus.READY ? 'bg-emerald-500' :
                          order.status === OrderStatus.PARTIALLY_READY ? 'bg-orange-500' :
                            order.status === OrderStatus.PREPARING ? 'bg-blue-500' :
                              order.status === OrderStatus.REOPENED ? 'bg-amber-500' : 'bg-slate-400'
                        }`}>
                        {OrderStatusLabels[order.status]}
                      </span>
                    </td>
                    <td className="px-8 py-5">
                      <p className="font-black text-slate-800 text-[11px] uppercase tracking-tighter">{order.clientName} {order.tableNumber ? `(Mesa ${order.tableNumber})` : ''}</p>
                      <div className="flex flex-wrap items-center gap-2 mt-1.5 text-[9px] text-slate-400 font-black uppercase tracking-widest">
                        <span>{new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(new Date(order.createdAt))}</span>
                        <span className="text-slate-200">•</span>
                        <span>{getFriendlySaleType(order.type)}</span>
                        <span className="text-blue-600 font-bold">R$ {order.total.toFixed(2)}</span>
                      </div>
                    </td>
                    <td className="px-8 py-5">
                      <div className="text-[10px] text-slate-500 font-bold uppercase truncate max-w-[200px]">
                        {Object.values(order.items.reduce((acc: Record<string, { name: string, q: number }>, it) => {
                          const p = products.find(prod => prod.id === it.productId);
                          const name = p?.name || '...';
                          if (!acc[name]) acc[name] = { name, q: 0 };
                          acc[name].q += it.quantity;
                          return acc;
                        }, {})).map((group: any) => `${group.q}x ${group.name}`).join(', ')}
                      </div>
                    </td>
                    <td className="px-8 py-5">
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                        {order.deliveryFee ? `R$ ${order.deliveryFee.toFixed(2)}` : '--'}
                      </p>
                    </td>
                    <td className="px-8 py-5 text-right">
                      <div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-all">
                        <button onClick={() => {
                          setPrintingOrder(order);
                          setIsNfceVisual(false);
                          setEditingPaymentMethod(false);
                          setNewPaymentMethod(order.paymentMethod || 'DINHEIRO');
                        }} className="p-2 text-slate-300 hover:text-blue-500" title="Reemitir Cupom Simples"><Icons.Print className="w-4 h-4" /></button>

                        {order.nfeStatus === 'EMITTED' && (
                          <button onClick={() => {
                            setPrintingOrder(order);
                            setIsNfceVisual(true);
                            setEditingPaymentMethod(false);
                            setNewPaymentMethod(order.paymentMethod || 'DINHEIRO');
                          }} className="p-2 text-slate-300 hover:text-emerald-500" title="Reemitir Cupom Fiscal (NFC-e)"><Icons.QrCode className="w-4 h-4" /></button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {orders.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-8 py-20 text-center text-slate-300 italic uppercase text-[10px] font-black tracking-widest">
                    Nenhuma venda registrada no sistema.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {printingOrder && businessSettings && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-md">
          <div className="relative w-full max-w-[80mm] bg-white p-8 border border-dashed shadow-2xl font-receipt text-[11px] text-black is-receipt animate-in zoom-in duration-200">
            {isNfceVisual ? (
              // NFC-e (DANFE) Layout
              <div className="space-y-4">
                <div className="text-center border-b border-dashed pb-4">
                  <h2 className="font-black text-xs uppercase">DANFE NFC-e</h2>
                  <p className="text-[8px] font-bold">Documento Auxiliar da Nota Fiscal de Consumidor Eletrônica</p>
                </div>

                <div className="text-[9px] space-y-1">
                  <div className="flex justify-between">
                    <span>NFC-e nº: {printingOrder.nfeNumber?.split('-')[1] || '000001'}</span>
                    <span>Série: 001</span>
                  </div>
                  <p>Emissão: {new Date(printingOrder.createdAt).toLocaleString('pt-BR')}</p>
                  <p>Protocolo: {Math.floor(Math.random() * 100000000000000)}</p>
                </div>

                <div className="border-t border-b border-dashed py-2">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="text-[8px] uppercase font-black">
                        <th>Item</th>
                        <th className="text-right">Vl. Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {groupedPrintingItems.map(([id, data]) => (
                        <tr key={id} className="text-[9px] uppercase font-black">
                          <td>{data.quantity}x {data.name.substring(0, 15)}</td>
                          <td className="text-right">R$ {(data.quantity * data.price).toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="flex justify-between font-black uppercase text-xs">
                  <span>Valor Total R$</span>
                  <span>{printingOrder.total.toFixed(2)}</span>
                </div>

                <div className="text-center space-y-2 mt-4 flex flex-col items-center">
                  <div className="w-32 h-32 bg-slate-50 border-2 border-slate-100 flex items-center justify-center">
                    <Icons.QrCode className="w-20 h-20 opacity-20" />
                  </div>
                  <p className="text-[8px] font-bold uppercase tracking-tighter">Consulta via QR Code ou Chave de Acesso</p>
                  <p className="text-[7px] break-all font-mono opacity-60">35240212345678000190650010000000011000000012</p>
                </div>

                <div className="text-center text-[7px] italic border-t border-dashed pt-2">
                  <p>PRODUTOS E SERVIÇOS TRIBUTADOS PELO ICMS NO DESTINO</p>
                </div>
              </div>
            ) : (
              // Standard Sales Coupon Layout
              <>
                <div className="text-center mb-6 border-b border-dashed pb-4">
                  <h2 className="font-black text-sm uppercase tracking-tighter">{businessSettings.name}</h2>
                  <p className="text-[9px] font-bold mt-1">CNPJ: {businessSettings.cnpj}</p>
                  <p className="text-[10px] font-black mt-3 border border-slate-900 py-1 uppercase tracking-widest">Comprovante de Pagamento</p>
                </div>
                <div className="space-y-1 mb-4">
                  <p>DATA: {new Date(printingOrder.createdAt).toLocaleString('pt-BR')}</p>
                  <p>CLIENTE: {printingOrder.clientName}</p>
                  {printingOrder.clientPhone && <p>FONE: {printingOrder.clientPhone}</p>}
                  {printingOrder.clientAddress && (
                    <p className="font-bold border-t border-dashed mt-2 pt-1 uppercase leading-tight">ENTREGA: {printingOrder.clientAddress}</p>
                  )}
                  {printingOrder.tableNumber && <p className="font-black">MESA: {printingOrder.tableNumber}</p>}
                  <p>STATUS: {OrderStatusLabels[printingOrder.status]}</p>

                  <div className="mt-2 pt-2 border-t border-dashed no-print">
                    <div className="flex justify-between items-center bg-slate-50 p-2 rounded-lg border border-slate-100">
                      {editingPaymentMethod ? (
                        <div className="flex gap-2 w-full">
                          <select
                            value={newPaymentMethod}
                            onChange={(e) => setNewPaymentMethod(e.target.value)}
                            className="flex-1 text-[9px] font-black uppercase p-1 rounded border outline-none cursor-pointer"
                            disabled={isSavingPayment}
                          >
                            <option value="DINHEIRO">Dinheiro</option>
                            <option value="PIX">PIX</option>
                            <option value="CRÉDITO">Crédito</option>
                            <option value="DÉBITO">Débito</option>
                          </select>
                          <button
                            disabled={isSavingPayment}
                            onClick={async () => {
                              setIsSavingPayment(true);
                              try {
                                const session = db.getCurrentSession();
                                await db.updateOrderPaymentMethod(printingOrder.id, newPaymentMethod, session?.user || { id: 'system', name: 'Sistema', email: '', password: '', permissions: [], createdAt: '' });
                                setPrintingOrder({ ...printingOrder, paymentMethod: newPaymentMethod });
                                setOrders(prev => prev.map(o => o.id === printingOrder.id ? { ...o, paymentMethod: newPaymentMethod } : o));
                                setEditingPaymentMethod(false);
                              } catch (err) {
                                console.error('Error updating payment', err);
                              } finally {
                                setIsSavingPayment(false);
                              }
                            }}
                            className="bg-emerald-500 text-white px-2 py-1 rounded text-[8px] font-black uppercase"
                          >
                            Salvar
                          </button>
                          <button
                            onClick={() => setEditingPaymentMethod(false)}
                            className="bg-slate-200 text-slate-600 px-2 py-1 rounded text-[8px] font-black uppercase"
                          >
                            X
                          </button>
                        </div>
                      ) : (
                        <>
                          <p className="font-black">PAGTO: {printingOrder.paymentMethod || 'DINHEIRO'}</p>
                          <button
                            onClick={() => setEditingPaymentMethod(true)}
                            className="text-[9px] text-blue-600 font-bold underline px-2"
                          >
                            Editar
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  <p className="font-black hidden print:block pt-1">PAGTO: {printingOrder.paymentMethod || 'DINHEIRO'}</p>
                </div>
                <div className="border-t border-dashed my-3 py-3">
                  {groupedPrintingItems.map(([id, data]) => (
                    <div key={id} className="flex justify-between font-black uppercase py-0.5">
                      <span>{data.quantity}x {data.name.substring(0, 18)}</span>
                      <span>R$ {(data.quantity * data.price).toFixed(2)}</span>
                    </div>
                  ))}
                </div>
                <div className="flex justify-between items-end border-t border-dashed pt-4 mb-1">
                  <span className="font-black text-[9px] uppercase tracking-widest">SUBTOTAL:</span>
                  <span className="text-sm font-black">R$ {(printingOrder.total - (printingOrder.deliveryFee || 0)).toFixed(2)}</span>
                </div>
                {printingOrder.deliveryFee !== undefined && printingOrder.deliveryFee > 0 && (
                  <div className="flex justify-between items-end mb-1">
                    <span className="font-black text-[9px] uppercase tracking-widest">TAXA ENTREGA:</span>
                    <span className="text-sm font-black">R$ {printingOrder.deliveryFee.toFixed(2)}</span>
                  </div>
                )}
                <div className="flex justify-between items-end border-t border-dashed pt-2 mb-6">
                  <span className="font-black text-[9px] uppercase tracking-widest">TOTAL:</span>
                  <span className="text-2xl font-black">R$ {printingOrder.total.toFixed(2)}</span>
                </div>
              </>
            )}

            <div className="flex flex-col gap-2 no-print">
              <div className="flex gap-2">
                <button onClick={() => window.print()} className="flex-[2] bg-slate-900 text-white py-4 rounded-2xl font-black uppercase text-[10px] tracking-widest shadow-xl">Imprimir</button>
                <button onClick={() => setPrintingOrder(null)} className="flex-1 bg-slate-100 text-slate-600 py-4 rounded-2xl font-black uppercase text-[10px] tracking-widest">Fechar</button>
              </div>

              {printingOrder.nfeStatus === 'EMITTED' && (
                <button
                  onClick={() => setIsNfceVisual(!isNfceVisual)}
                  className="w-full py-3 border-2 border-dashed border-slate-200 text-slate-400 rounded-xl font-black uppercase text-[8px] hover:border-blue-400 hover:text-blue-500 transition-all"
                >
                  {isNfceVisual ? 'Ver Comprovante Simples' : 'Ver DANFE NFC-e'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SalesMonitor;
