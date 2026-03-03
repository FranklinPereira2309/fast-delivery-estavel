
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Order, OrderStatus, OrderStatusLabels, SaleType, Product, User } from '../types';
import { QRCodeCanvas } from 'qrcode.react';
import { db, BusinessSettings } from '../services/db';
import { Icons } from '../constants';
import CustomAlert from '../components/CustomAlert';

const SalesMonitor: React.FC = () => {
  const [orders, setOrders] = useState<Order[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [businessSettings, setBusinessSettings] = useState<BusinessSettings | null>(null);
  const [printingOrder, setPrintingOrder] = useState<Order | null>(null);
  const [isNfceVisual, setIsNfceVisual] = useState(false);
  const currentUser = db.getCurrentSession()?.user;
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
    if (sortedOrders.some(o => o.nfeStatus)) {
      console.log('Fiscal orders found in Monitor:', sortedOrders.filter(o => o.nfeStatus));
    }
  };

  const getFriendlySaleType = (type: SaleType | string) => {
    switch (type) {
      case SaleType.COUNTER: return 'Balcão';
      case SaleType.TABLE: return 'Mesa';
      case SaleType.OWN_DELIVERY: return 'Delivery';
      default: return type;
    }
  };

  const renderPaymentEditor = () => (
    <div className="mt-2 pt-2 border-t border-dashed no-print w-full">
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
              <option value="FIADO">Fiado</option>
              <option value="PIX + DINHEIRO">PIX + Dinheiro</option>
              <option value="CRÉDITO + DINHEIRO">Crédito + Dinheiro</option>
              <option value="DÉBITO + DINHEIRO">Débito + Dinheiro</option>
              <option value="PIX + CRÉDITO">PIX + Crédito</option>
              <option value="CRÉDITO + DÉBITO">Crédito + Débito</option>
              {/* Fallback caso seja um metodo composto customizado não mapeado acima e seja exatamente o original */}
              {printingOrder?.paymentMethod && ![
                'DINHEIRO', 'PIX', 'CRÉDITO', 'DÉBITO', 'FIADO',
                'PIX + DINHEIRO', 'CRÉDITO + DINHEIRO', 'DÉBITO + DINHEIRO',
                'PIX + CRÉDITO', 'CRÉDITO + DÉBITO'
              ].includes(printingOrder.paymentMethod) && (
                  <option value={printingOrder.paymentMethod}>{printingOrder.paymentMethod}</option>
                )}
            </select>
            <button
              disabled={isSavingPayment}
              onClick={async () => {
                setIsSavingPayment(true);
                try {
                  const session = db.getCurrentSession();
                  await db.updateOrderPaymentMethod(printingOrder!.id, newPaymentMethod, session?.user || { id: 'system', name: 'Sistema', email: '', password: '', permissions: [], createdAt: '', active: true });
                  setPrintingOrder({ ...printingOrder!, paymentMethod: newPaymentMethod });
                  setOrders(prev => prev.map(o => o.id === printingOrder!.id ? { ...o, paymentMethod: newPaymentMethod } : o));
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
            <p className="font-black text-[10px]">PAGTO: {printingOrder?.paymentMethod || 'PENDENTE'}</p>
            <button
              onClick={() => setEditingPaymentMethod(true)}
              className="text-[9px] text-blue-600 font-bold underline px-2"
            >
              Editar
            </button>
          </>
        )}
      </div>
      <p className="font-black hidden print:block pt-1 text-[10px]">PAGTO: {printingOrder?.paymentMethod || 'PENDENTE'}</p>
    </div>
  );

  // Agrupamento para o cupom de reemissão
  const groupedPrintingItems = useMemo(() => {
    if (!printingOrder) return [];
    const grouped: Record<string, { product: Product | undefined, quantity: number, price: number }> = {};
    if (printingOrder && Array.isArray(printingOrder.items)) {
      printingOrder.items.forEach(item => {
        if (!grouped[item.productId]) {
          grouped[item.productId] = {
            product: products.find(p => p.id === item.productId),
            quantity: 0,
            price: item.price
          };
        }
        grouped[item.productId].quantity += item.quantity;
      });
    }
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
        <div className="flex-1 overflow-auto p-4 sm:p-8 bg-slate-50/30">
          <div className="bg-white rounded-[2.5rem] shadow-sm border border-slate-100 overflow-hidden min-w-[320px]">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse min-w-[700px] sm:min-w-0">
                <thead>
                  <tr className="bg-slate-50/50 border-b border-slate-100">
                    <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Status</th>
                    <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Cliente / Mesa</th>
                    <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Itens</th>
                    <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {orders.map(order => {
                    const isRecentlyChanged = changedOrderIds.has(order.id);
                    const blinkClass = isRecentlyChanged ? 'animate-notify-turquoise' : '';

                    return (
                      <tr key={order.id} className="hover:bg-slate-50/50 group transition-colors">
                        <td className="px-8 py-5">
                          <div className="flex justify-start">
                            <span className={`text-[8px] sm:text-[9px] font-black px-2 sm:px-4 py-1.5 sm:py-2 rounded-xl text-white uppercase shadow-sm transition-all duration-300 ${blinkClass} ${order.status === OrderStatus.DELIVERED ? 'bg-slate-900' :
                              order.status === OrderStatus.READY ? 'bg-emerald-500' :
                                order.status === OrderStatus.PARTIALLY_READY ? 'bg-orange-500' :
                                  order.status === OrderStatus.PREPARING ? 'bg-blue-500' :
                                    order.status === OrderStatus.REOPENED ? 'bg-amber-500' : 'bg-slate-400'
                              }`}>
                              {OrderStatusLabels[order.status]}
                            </span>
                          </div>
                        </td>
                        <td className="px-8 py-5">
                          <p className="font-black text-slate-800 text-[11px] uppercase tracking-tighter">{order.clientName} {order.tableNumber ? `(Mesa ${order.tableNumber})` : ''}</p>
                          <div className="flex flex-wrap items-center gap-2 mt-1.5 text-[9px] text-slate-400 font-black uppercase tracking-widest">
                            <span>{new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(new Date(order.createdAt))}</span>
                            <span className="text-slate-200">•</span>
                            <span>{getFriendlySaleType(order.type)}</span>
                            <span className="text-blue-600 font-bold">R$ {order.total.toFixed(2)}</span>
                            {order.nfeStatus === 'EMITTED' && (
                              <span className="px-1.5 py-0.5 bg-emerald-100 text-emerald-700 text-[8px] font-black rounded-md flex items-center gap-1">
                                <Icons.QrCode className="w-2 h-2" />
                                NFC-E
                              </span>
                            )}
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
                            {order.deliveryFee ? `Entrega: R$ ${order.deliveryFee.toFixed(2)}` : ''}
                            {order.type === SaleType.TABLE ? `${order.deliveryFee ? ' | ' : ''}Serviço: R$ ${(order.appliedServiceFee || 0).toFixed(2)}` : ''}
                          </p>
                        </td>
                        <td className="px-8 py-5 text-right">
                          {/* Ocultar os botões de cupom se for mesa em aberto */}
                          {!(order.type === SaleType.TABLE && order.status !== OrderStatus.DELIVERED) && (
                            <div className="flex justify-end gap-2 transition-all">
                              <button onClick={() => {
                                setPrintingOrder(order);
                                setIsNfceVisual(false);
                                setEditingPaymentMethod(false);
                                setNewPaymentMethod(order.paymentMethod || 'DINHEIRO');
                              }} className="p-2.5 text-blue-600 hover:bg-blue-50 rounded-2xl border border-blue-100 shadow-sm transition-all active:scale-95" title="Reemitir Cupom Simples">
                                <Icons.Print className="w-5 h-5" />
                              </button>

                              {order.nfeStatus === 'EMITTED' && (
                                <button onClick={() => {
                                  setPrintingOrder(order);
                                  setIsNfceVisual(true);
                                  setEditingPaymentMethod(false);
                                  setNewPaymentMethod(order.paymentMethod || 'DINHEIRO');
                                }} className="p-2.5 text-emerald-600 hover:bg-emerald-50 rounded-2xl border border-emerald-100 shadow-sm transition-all active:scale-95" title="Reemitir Cupom Fiscal (NFC-e)">
                                  <Icons.Print className="w-5 h-5" />
                                </button>
                              )}
                            </div>
                          )}
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
                  // NFC-e (DANFE) Layout - Redesigned
                  <div className="space-y-4 font-mono text-[10px] leading-tight text-black">
                    <div className="text-center space-y-1">
                      <p className="font-bold">CNPJ - {businessSettings?.cnpj} - {businessSettings?.name?.toUpperCase()}</p>
                      <p className="uppercase">{businessSettings?.address}</p>
                      <p className="uppercase">Loja: 001 PDV: 001 VD: {printingOrder.id.substring(0, 6)} OPERADOR: {currentUser?.name?.toUpperCase() || 'SISTEMA'}</p>
                      <p className="font-bold mt-2">DOCUMENTO AUXILIAR DA NOTA FISCAL DE CONSUMIDOR</p>
                    </div>

                    <div className="border-t border-dashed border-black mt-2 pt-2">
                      <table className="w-full text-left">
                        <thead>
                          <tr className="uppercase font-bold">
                            <th className="w-12">CODIGO</th>
                            <th>DESCRICAO</th>
                            <th className="text-right">QTDE</th>
                            <th className="text-right">UNIT</th>
                            <th className="text-right">TOTAL</th>
                          </tr>
                        </thead>
                        <tbody>
                          {groupedPrintingItems.map(([id, data]) => {
                            const ncmCode = data.product?.ncm || '00000000';
                            const prodName = data.product?.name || `PROD #${id.substring(0, 5)}`;
                            return (
                              <tr key={id} className="uppercase">
                                <td>{ncmCode.substring(0, 6)}</td>
                                <td>{prodName.substring(0, 20)}</td>
                                <td className="text-right">{data.quantity}</td>
                                <td className="text-right">{data.price.toFixed(2)}</td>
                                <td className="text-right">{(data.quantity * data.price).toFixed(2)}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>

                    <div className="space-y-1 pt-2">
                      <div className="flex justify-between font-bold">
                        <span>VALOR A PAGAR R$</span>
                        <span>{printingOrder.total.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between font-bold text-[8px] border-b border-dashed border-black pb-1">
                        <span>FORMA DE PAGAMENTO</span>
                        <span>Valor Pago</span>
                      </div>
                      {renderPaymentEditor()}
                    </div>

                    <div className="text-center space-y-1 border-t border-dashed border-black pt-2">
                      <p className="font-bold">NFCe: {printingOrder.nfeNumber?.split('-')[1] || '000001'} Ser: 001 Emi: {new Date(printingOrder.createdAt).toLocaleDateString('pt-BR')} {new Date(printingOrder.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</p>
                      <p>Consulte pela chave de acesso em</p>
                      <p className="text-[8px] underline">www.nfce.sefaz.ba.gov.br/portal/consultaNFCe.jsp</p>
                      <p className="text-[9px] font-bold break-all">35240212345678000190650010000000011000000012</p>
                    </div>

                    <div className="text-center space-y-1 border-t border-dashed border-black pt-2">
                      <p className="font-bold">{printingOrder.clientName === 'Consumidor' ? 'CONSUMIDOR NAO INFORMADO' : `CLIENTE: ${printingOrder.clientName?.toUpperCase()}`}</p>
                      <p>Protocolo de Autorizacao: {Math.floor(Math.random() * 100000000000000)}</p>
                      <div className="flex justify-between text-[8px]">
                        <span>Tributos Totais Incidentes (Lei Federal 12.741/2012)</span>
                        <span className="font-bold">{(printingOrder.total * 0.1345).toFixed(2)}</span>
                      </div>
                    </div>

                    <div className="flex justify-center py-4">
                      <div className="bg-white p-2">
                        <QRCodeCanvas
                          value={printingOrder.nfeUrl || `https://www.nfce.sefaz.ba.gov.br/portal/consultaNFCe.jsp?p=${printingOrder.id}`}
                          size={120}
                          level={"M"}
                          includeMargin={false}
                        />
                      </div>
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

                      {renderPaymentEditor()}
                    </div>
                    <div className="border-t border-dashed my-3 py-3">
                      {groupedPrintingItems.map(([id, data]) => {
                        const prodName = data.product?.name || `PROD #${id.substring(0, 5)}`;
                        return (
                          <div key={id} className="flex justify-between font-black uppercase py-0.5" >
                            <span>{data.quantity}x {prodName.substring(0, 18)}</span>
                            <span>R$ {(data.quantity * data.price).toFixed(2)}</span>
                          </div>
                        );
                      })}
                    </div>
                    <div className="flex justify-between items-end border-t border-dashed pt-4 mb-1">
                      <span className="font-black text-[9px] uppercase tracking-widest">SUBTOTAL:</span>
                      <span className="text-sm font-black">R$ {(printingOrder.total - (printingOrder.type === SaleType.OWN_DELIVERY ? (printingOrder.deliveryFee || 0) : 0) - (printingOrder.type === SaleType.TABLE ? (printingOrder.appliedServiceFee || 0) : 0)).toFixed(2)}</span>
                    </div>
                    {printingOrder.type === SaleType.OWN_DELIVERY && printingOrder.deliveryFee !== undefined && printingOrder.deliveryFee > 0 && (
                      <div className="flex justify-between items-end mb-1">
                        <span className="font-black text-[9px] uppercase tracking-widest">TAXA ENTREGA:</span>
                        <span className="text-sm font-black">R$ {printingOrder.deliveryFee.toFixed(2)}</span>
                      </div>
                    )}
                    {printingOrder.type === SaleType.TABLE && typeof printingOrder.appliedServiceFee === 'number' && (
                      <div className="flex justify-between items-end mb-1">
                        <span className="font-black text-[9px] uppercase tracking-widest">TAXA SERVIÇO:</span>
                        <span className="text-sm font-black">R$ {(printingOrder.appliedServiceFee || 0).toFixed(2)}</span>
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
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default SalesMonitor;
