
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Order, OrderStatus, OrderStatusLabels, SaleType, Product, User, BusinessSettings } from '../types';
import { QRCodeCanvas } from 'qrcode.react';
import { db } from '../services/db';
import { Icons } from '../constants';
import CustomAlert from '../components/CustomAlert';
import { useToast } from '../hooks/useToast';

import { usePrinter } from '../hooks/usePrinter';

const SalesMonitor: React.FC = () => {
  const { printElement } = usePrinter();
  const { addToast } = useToast();
  const [orders, setOrders] = useState<Order[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [businessSettings, setBusinessSettings] = useState<BusinessSettings | null>(null);
  const [printingOrder, setPrintingOrder] = useState<Order | null>(null);
  const [isNfceVisual, setIsNfceVisual] = useState(false);
  const currentUser = db.getCurrentSession()?.user;
  const [editingPaymentMethod, setEditingPaymentMethod] = useState(false);
  const [newPaymentMethod, setNewPaymentMethod] = useState('');
  const [isSavingPayment, setIsSavingPayment] = useState(false);
  const [editingServiceFee, setEditingServiceFee] = useState(false);
  const [newServiceFeeValue, setNewServiceFeeValue] = useState('0');
  const [isSavingServiceFee, setIsSavingServiceFee] = useState(false);
  const [changedOrderIds, setChangedOrderIds] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(false);

  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 15;

  const paymentLabels: { [key: string]: string } = {
    'pix': 'PIX',
    'PIX': 'PIX',
    'cartao_credito': 'Cartão de Crédito',
    'CREDIT': 'Cartão de Crédito',
    'CRÉDITO': 'Cartão de Crédito',
    'cartao_debito': 'Cartão de Débito',
    'DEBIT': 'Cartão de Débito',
    'DÉBITO': 'Cartão de Débito',
    'dinheiro': 'Dinheiro',
    'CASH': 'Dinheiro',
    'DINHEIRO': 'Dinheiro'
  };

  const prevOrdersRef = useRef<Record<string, OrderStatus>>({});

  useEffect(() => {
    refreshData();
    const interval = setInterval(refreshData, 10000); // Aumentado para 10s p/ o plano Render Free
    return () => clearInterval(interval);
  }, []);

  const refreshData = async () => {
    setIsLoading(true);
    try {
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
    } catch (error) {
      console.error("Error refreshing Sales Monitor data:", error);
    } finally {
      setIsLoading(false);
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
      <div className="flex justify-between items-center bg-slate-50 dark:bg-slate-800 p-2 rounded-lg border border-slate-100 dark:border-slate-700">
        {editingPaymentMethod ? (
          <div className="flex gap-2 w-full">
            <select
              value={newPaymentMethod}
              onChange={(e) => setNewPaymentMethod(e.target.value)}
              className="flex-1 text-[9px] font-black uppercase p-1 rounded border dark:border-slate-700 bg-white dark:bg-slate-900 dark:text-white outline-none cursor-pointer"
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
              ].includes((paymentLabels[(printingOrder.paymentMethod || '').toUpperCase()] || printingOrder.paymentMethod).toUpperCase()) && (
                  <option value={printingOrder.paymentMethod}>{(paymentLabels[(printingOrder.paymentMethod || '').toUpperCase()] || printingOrder.paymentMethod).toUpperCase()}</option>
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
              className="bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 px-2 py-1 rounded text-[8px] font-black uppercase"
            >
              X
            </button>
          </div>
        ) : (
          <>
            <p className="font-black text-[10px] dark:text-white">PAGTO: {(paymentLabels[(printingOrder?.paymentMethod || '').toUpperCase()] || printingOrder?.paymentMethod || 'PENDENTE').toUpperCase()}</p>
            <button
              onClick={() => {
                const rawMethod = printingOrder?.paymentMethod || 'DINHEIRO';
                const mappedMethod = (paymentLabels[rawMethod.toUpperCase()] || rawMethod).toUpperCase();
                setNewPaymentMethod(mappedMethod);
                setEditingPaymentMethod(true);
              }}
              className="text-[9px] text-blue-600 font-bold underline px-2"
            >
              Editar
            </button>
          </>
        )}
      </div>
      <p className="font-black hidden print:block pt-1 text-[10px] dark:text-white">PAGTO: {(paymentLabels[(printingOrder?.paymentMethod || '').toUpperCase()] || printingOrder?.paymentMethod || 'PENDENTE').toUpperCase()}</p>
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
    <div className="flex flex-col h-full gap-6 animate-in fade-in duration-500 relative">
      <div className="flex-1 bg-white dark:bg-slate-900 rounded-[3rem] shadow-sm border border-slate-100 dark:border-slate-800 overflow-hidden flex flex-col">
        <div className="p-8 border-b border-slate-50 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 flex justify-between items-center">
          <div>
            <h3 className="font-black text-slate-800 dark:text-white uppercase tracking-tighter text-xl">Monitor de Vendas e Fluxo</h3>
            <p className="text-[10px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-widest">Acompanhamento de status e finalizações em tempo real</p>
          </div>
        </div>
        <div className="flex-1 overflow-auto p-4 sm:p-8 bg-slate-50/30 dark:bg-slate-900/50">
          <div className="bg-white dark:bg-slate-900 rounded-[2.5rem] shadow-sm border border-slate-100 dark:border-slate-800 flex flex-col h-full overflow-hidden animate-in fade-in duration-500 relative">
            {isLoading && (
              <div className="absolute top-0 left-0 w-full h-1 bg-indigo-100 dark:bg-indigo-900/40 overflow-hidden z-50">
                <div className="h-full bg-indigo-600 dark:bg-indigo-500 animate-[loading_2s_infinite]"></div>
              </div>
            )}
            <style>{`
                @keyframes loading {
                    0% { transform: translateX(-100%); }
                    100% { transform: translateX(100%); }
                }
            `}</style>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse min-w-[700px] sm:min-w-0">
                <thead>
                  <tr className="bg-slate-50/50 dark:bg-slate-800/30 border-b border-slate-100 dark:border-slate-800">
                    <th className="px-8 py-5 text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">Status</th>
                    <th className="px-8 py-5 text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">Cliente / Mesa</th>
                    <th className="px-8 py-5 text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">Itens</th>
                    <th className="px-8 py-5 text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest text-right">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
                  {orders.map(order => {
                    const isRecentlyChanged = changedOrderIds.has(order.id);
                    const blinkClass = isRecentlyChanged ? 'animate-notify-turquoise' : '';

                    return (
                      <tr key={order.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 group transition-colors">
                        <td className="px-8 py-5">
                          <div className="flex justify-start">
                            <span className={`text-[8px] sm:text-[9px] font-black px-2 sm:px-4 py-1.5 sm:py-2 rounded-xl text-white uppercase shadow-md transition-all duration-300 ${blinkClass} ${order.status === OrderStatus.DELIVERED ? 'bg-indigo-600 dark:bg-indigo-500 ring-2 ring-indigo-400/20' :
                              order.status === OrderStatus.READY ? 'bg-emerald-500' :
                                order.status === OrderStatus.PARTIALLY_READY ? 'bg-orange-500' :
                                  order.status === OrderStatus.PREPARING ? 'bg-blue-500' :
                                    order.status === OrderStatus.REOPENED ? 'bg-amber-500' : 'bg-slate-400 dark:bg-slate-600'
                              }`}>
                              {OrderStatusLabels[order.status]}
                            </span>
                          </div>
                        </td>
                        <td className="px-8 py-5">
                          <p className="font-black text-slate-800 dark:text-white text-[11px] uppercase tracking-tighter">{order.clientName} {order.tableNumber ? `(Mesa ${order.tableNumber})` : ''}</p>
                          <div className="flex flex-wrap items-center gap-2 mt-1.5 text-[9px] text-slate-400 dark:text-slate-500 font-black uppercase tracking-widest">
                            <span>{new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(new Date(order.createdAt))}</span>
                            <span className="text-slate-200 dark:text-slate-800">•</span>
                            <span>{getFriendlySaleType(order.type)}</span>
                            <span className="text-blue-600 dark:text-blue-400 font-bold">R$ {order.total.toFixed(2)}</span>
                            {order.nfeStatus === 'EMITTED' && businessSettings?.enableNfcEmission && (
                              <span className="px-1.5 py-0.5 bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400 text-[8px] font-black rounded-md flex items-center gap-1">
                                <Icons.QrCode className="w-2 h-2" />
                                NFC-E
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-8 py-5">
                          <div className="text-[10px] text-slate-500 dark:text-slate-400 font-bold uppercase truncate max-w-[200px]">
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
                          <p className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">
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
                                setEditingServiceFee(false);
                                setNewServiceFeeValue((order.appliedServiceFee || 0).toString());
                              }} className="p-2.5 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/40 rounded-2xl border border-blue-100 dark:border-blue-900/30 shadow-sm transition-all active:scale-95" title="Reemitir Cupom Simples">
                                <Icons.Print className="w-5 h-5" />
                              </button>

                              {order.nfeStatus === 'EMITTED' && businessSettings?.enableNfcEmission && (
                                <button onClick={() => {
                                  setPrintingOrder(order);
                                  setIsNfceVisual(true);
                                  setEditingPaymentMethod(false);
                                  setNewPaymentMethod(order.paymentMethod || 'DINHEIRO');
                                  setEditingServiceFee(false);
                                  setNewServiceFeeValue((order.appliedServiceFee || 0).toString());
                                }} className="p-2.5 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/40 rounded-2xl border border-emerald-100 dark:border-emerald-900/30 shadow-sm transition-all active:scale-95" title="Reemitir Cupom Fiscal (NFC-e)">
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
            <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/80 dark:bg-slate-950/90 backdrop-blur-md">
            <div id="thermal-receipt" className="relative w-full max-w-[48mm] bg-white dark:bg-slate-900 p-2 border border-dashed dark:border-slate-800 shadow-2xl font-receipt text-[14px] text-black dark:text-white is-receipt animate-in zoom-in duration-200">
                {isNfceVisual ? (
                  <div className="space-y-4 font-mono text-[10px] leading-tight text-black dark:text-white">
                    <div className="text-center space-y-1">
                      <p className="font-bold">CNPJ - {businessSettings?.cnpj} - {businessSettings?.name?.toUpperCase()}</p>
                      <p className="uppercase">{businessSettings?.address}</p>
                      <p className="uppercase">Loja: 001 PDV: 001 VD: {printingOrder.id.substring(0, 6)} OPERADOR: {currentUser?.name?.toUpperCase() || 'SISTEMA'}</p>
                      <p className="font-bold mt-2">DOCUMENTO AUXILIAR DA NOTA FISCAL DE CONSUMIDOR</p>
                    </div>

                    <div className="border-t border-dashed border-black dark:border-slate-700 mt-2 pt-2">
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
                      <div className="flex justify-between font-bold text-[8px] border-b border-dashed border-black dark:border-slate-700 pb-1">
                        <span>FORMA DE PAGAMENTO</span>
                        <span>Valor Pago</span>
                      </div>
                      {renderPaymentEditor()}
                    </div>

                    <div className="text-center space-y-1 border-t border-dashed border-black dark:border-slate-700 pt-2">
                      <p className="font-bold">NFCe: {printingOrder.nfeNumber?.split('-')[1] || '000001'} Ser: 001 Emi: {new Date(printingOrder.createdAt).toLocaleDateString('pt-BR')} {new Date(printingOrder.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</p>
                      <p>Consulte pela chave de acesso em</p>
                      <p className="text-[8px] underline">www.nfce.sefaz.ba.gov.br/portal/consultaNFCe.jsp</p>
                      <p className="text-[13px] font-bold break-all leading-none">35240212345678000190650010000000011000000012</p>
                    </div>

                    <div className="text-center space-y-1 border-t border-dashed border-black dark:border-slate-700 pt-2">
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
                  <>
                    <div className="text-center mb-2">
                      <h2 className="font-bold text-xs uppercase tracking-tighter mb-0">{businessSettings.name}</h2>
                      <p className="text-[8px] font-bold uppercase">CNPJ: {businessSettings.cnpj}</p>
                      <div className="section-divider"></div>
                      <p className="text-[10px] font-bold uppercase tracking-widest">COMPROVANTE</p>
                    </div>

                    <div className="section-divider"></div>

                    <div className="space-y-0.5 mb-2 text-[8px]">
                      <div className="flex justify-between">
                        <span>DATA: {new Date(printingOrder.createdAt).toLocaleDateString('pt-BR')}</span>
                        <span>{new Date(printingOrder.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
                      </div>
                      <p>CLIENTE: {printingOrder.clientName?.toUpperCase()}</p>
                      {printingOrder.clientPhone && <p>FONE: {printingOrder.clientPhone}</p>}
                      {printingOrder.type === SaleType.OWN_DELIVERY && printingOrder.clientAddress && (
                        <p className="font-bold border-t border-black mt-1 pt-0.5 uppercase">ENTREGA: {printingOrder.clientAddress}</p>
                      )}
                      {printingOrder.tableNumber && <p className="font-bold">MESA: {printingOrder.tableNumber}</p>}
                      <p>STATUS: {OrderStatusLabels[printingOrder.status].toUpperCase()}</p>

                      {renderPaymentEditor()}
                    </div>

                    <div className="section-divider"></div>

                    <div className="mb-2">
                      {groupedPrintingItems.map(([id, data]) => {
                        const prodName = data.product?.name || `PROD #${id.substring(0, 5)}`;
                        return (
                          <div key={id} className="flex justify-between font-bold uppercase py-0.5 text-[9px]">
                            <span>{data.quantity}x {prodName.substring(0, 15)}</span>
                            <span>R$ {(data.quantity * data.price).toFixed(2)}</span>
                          </div>
                        );
                      })}
                    </div>

                    <div className="section-divider"></div>

                    <div className="space-y-0.5">
                      <div className="flex justify-between items-center text-[8px] font-bold uppercase">
                        <span>SUBTOTAL:</span>
                        <span>R$ {(printingOrder.total - (printingOrder.type === SaleType.OWN_DELIVERY ? (printingOrder.deliveryFee || 0) : 0) - (printingOrder.type === SaleType.TABLE ? (printingOrder.appliedServiceFee || 0) : 0)).toFixed(2)}</span>
                      </div>
                      {printingOrder.type === SaleType.OWN_DELIVERY && printingOrder.deliveryFee !== undefined && printingOrder.deliveryFee > 0 && (
                        <div className="flex justify-between items-center text-[8px] font-bold uppercase">
                          <span>TAXA ENTREGA:</span>
                          <span>R$ {printingOrder.deliveryFee.toFixed(2)}</span>
                        </div>
                      )}
                      {printingOrder.type === SaleType.TABLE && typeof printingOrder.appliedServiceFee === 'number' && (
                        <div className="flex justify-between items-center text-[8px] font-bold uppercase">
                          <span>TAXA SERVICO:</span>
                          <span>R$ {printingOrder.appliedServiceFee.toFixed(2)}</span>
                        </div>
                      )}
                      <div className="flex justify-between items-end pt-1">
                        <span className="font-bold text-[10px] uppercase">TOTAL:</span>
                        <span className="text-sm font-bold">R$ {printingOrder.total.toFixed(2)}</span>
                      </div>
                    </div>
                  </>
                )}

                <div className="grid grid-cols-2 gap-4 no-print mt-6">
                  <button
                    onClick={async () => {
                      if (!businessSettings || !printingOrder) return;
                      await printElement('thermal-receipt');
                      setPrintingOrder(null);
                    }}
                    className="bg-slate-900 text-white py-4 rounded-[22px] font-receipt font-black uppercase text-[11px] shadow-xl hover:bg-black active:scale-95 transition-all flex items-center justify-center"
                  >
                    IMPRIMIR
                  </button>
                  <button
                    onClick={() => setPrintingOrder(null)}
                    className="bg-slate-50 dark:bg-slate-800 text-slate-400 dark:text-slate-500 py-4 rounded-[22px] font-receipt font-black uppercase text-[11px] hover:bg-slate-100 dark:hover:bg-slate-700 active:scale-95 transition-all flex items-center justify-center"
                  >
                    FECHAR
                  </button>
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
