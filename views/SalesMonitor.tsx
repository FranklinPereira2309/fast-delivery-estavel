
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Order, OrderStatus, OrderStatusLabels, SaleType, Product } from '../types';
import { db, BusinessSettings } from '../services/db';
import { Icons } from '../constants';
import CustomAlert from '../components/CustomAlert';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

const SalesMonitor: React.FC = () => {
  const [orders, setOrders] = useState<Order[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [businessSettings, setBusinessSettings] = useState<BusinessSettings | null>(null);
  const [printingOrder, setPrintingOrder] = useState<Order | null>(null);
  const [changedOrderIds, setChangedOrderIds] = useState<Set<string>>(new Set());

  // Filtros do Relatório
  const [isReportOpen, setIsReportOpen] = useState(false);
  const [filterStartDate, setFilterStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [filterEndDate, setFilterEndDate] = useState(new Date().toISOString().split('T')[0]);
  const [filterPayment, setFilterPayment] = useState<string>('TODOS');
  const [filterModality, setFilterModality] = useState<string>('TODOS');
  const [reportStep, setReportStep] = useState<'FILTERS' | 'VIEW'>('FILTERS');
  const [currentPage, setCurrentPage] = useState(1);
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState<string | null>(null);
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
    const sortedOrders = o.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

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

  const generatePDFReport = async (downloadOnly = false) => {
    if (!businessSettings) return;

    try {
      const pdfDoc = await PDFDocument.create();
      const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
      const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

      const filteredOrders = orders.filter(o => {
        const orderDate = o.createdAt.split('T')[0];
        const inDate = orderDate >= filterStartDate && orderDate <= filterEndDate;
        const inPayment = filterPayment === 'TODOS' || o.paymentMethod === filterPayment;
        const inModality = filterModality === 'TODOS' || o.type === filterModality;
        return inDate && inPayment && inModality && o.status === OrderStatus.DELIVERED;
      });

      const totalRevenue = filteredOrders.reduce((sum, o) => sum + o.total, 0);
      const orderCount = filteredOrders.length;
      const avgTicket = orderCount > 0 ? totalRevenue / orderCount : 0;

      let page = pdfDoc.addPage([595.28, 841.89]); // A4
      const { width, height } = page.getSize();
      let y = height - 50;

      // Header
      page.drawText('RELATÓRIO GERENCIAL DE VENDAS', { x: 50, y, size: 18, font: fontBold });
      y -= 25;
      page.drawText(businessSettings.name, { x: 50, y, size: 12, font: fontBold });
      y -= 15;
      page.drawText(`CNPJ: ${businessSettings.cnpj}`, { x: 50, y, size: 10, font });
      y -= 15;
      page.drawText(`Período: ${new Date(filterStartDate + 'T00:00:00').toLocaleDateString('pt-BR')} a ${new Date(filterEndDate + 'T00:00:00').toLocaleDateString('pt-BR')}`, { x: 50, y, size: 10, font });

      y -= 40;
      // KPIs
      page.drawText('RESUMO FINANCEIRO', { x: 50, y, size: 12, font: fontBold });
      y -= 20;
      page.drawText(`Faturamento Total: R$ ${totalRevenue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, { x: 50, y, size: 10, font });
      y -= 15;
      page.drawText(`Volume de Vendas: ${orderCount}`, { x: 50, y, size: 10, font });
      y -= 15;
      page.drawText(`Ticket Médio: R$ ${avgTicket.toFixed(2)}`, { x: 50, y, size: 10, font });

      y -= 40;
      // Table Header
      page.drawRectangle({ x: 50, y: y - 5, width: width - 100, height: 20, color: rgb(0.95, 0.95, 0.95) });
      page.drawText('DATA', { x: 55, y, size: 8, font: fontBold });
      page.drawText('CLIENTE / MESA', { x: 120, y, size: 8, font: fontBold });
      page.drawText('ITENS', { x: 280, y, size: 8, font: fontBold });
      page.drawText('MOD.', { x: 450, y, size: 8, font: fontBold });
      page.drawText('TOTAL', { x: 520, y, size: 8, font: fontBold });
      y -= 25;

      // Table Rows
      for (const o of filteredOrders) {
        if (y < 70) {
          page = pdfDoc.addPage([595.28, 841.89]);
          y = page.getHeight() - 50;
          // Re-draw table header on new page
          page.drawRectangle({ x: 50, y: y - 5, width: width - 100, height: 20, color: rgb(0.95, 0.95, 0.95) });
          page.drawText('DATA', { x: 55, y, size: 8, font: fontBold });
          page.drawText('CLIENTE / MESA', { x: 120, y, size: 8, font: fontBold });
          page.drawText('ITENS', { x: 280, y, size: 8, font: fontBold });
          page.drawText('MOD.', { x: 450, y, size: 8, font: fontBold });
          page.drawText('TOTAL', { x: 520, y, size: 8, font: fontBold });
          y -= 25;
        }

        const dateStr = new Date(o.createdAt).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
        const itemsStr = o.items.map(it => {
          const p = products.find(prod => prod.id === it.productId);
          return `${it.quantity}x ${p?.name || '...'}`;
        }).join(', ').substring(0, 45);

        page.drawText(dateStr, { x: 55, y, size: 7, font });
        page.drawText(`${o.clientName} ${o.tableNumber ? `(M ${o.tableNumber})` : ''}`.substring(0, 30), { x: 120, y, size: 7, font });
        page.drawText(itemsStr, { x: 280, y, size: 7, font });
        page.drawText(o.type === SaleType.TABLE ? 'Mesa' : o.type === SaleType.COUNTER ? 'Balcão' : 'Deliv.', { x: 450, y, size: 7, font });
        page.drawText(`R$ ${o.total.toFixed(2)}`, { x: 520, y, size: 7, font: fontBold });

        y -= 15;
      }

      const pdfBytes = await pdfDoc.save();
      const blob = new Blob([pdfBytes as any], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);

      if (downloadOnly) {
        const link = document.createElement('a');
        link.href = url;
        link.download = `relatorio_vendas_${filterStartDate}_${filterEndDate}.pdf`;
        link.click();
        URL.revokeObjectURL(url);
      } else {
        setPdfPreviewUrl(url);
      }
    } catch (error) {
      console.error('Erro ao gerar PDF:', error);
      alert('Erro ao gerar o relatório PDF. Verifique o console.');
    }
  };

  return (
    <div className="flex flex-col h-full gap-6 animate-in fade-in duration-500">
      <div className="flex-1 bg-white rounded-[3rem] shadow-sm border border-slate-100 overflow-hidden flex flex-col">
        <div className="p-8 border-b border-slate-50 bg-slate-50 flex justify-between items-center">
          <div>
            <h3 className="font-black text-slate-800 uppercase tracking-tighter text-xl">Monitor de Vendas e Fluxo</h3>
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Acompanhamento de status e finalizações em tempo real</p>
          </div>
          <button
            onClick={() => {
              setReportStep('FILTERS');
              setCurrentPage(1);
              setIsReportOpen(true);
            }}
            className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-4 rounded-2xl text-[11px] font-black uppercase tracking-widest shadow-xl shadow-blue-100 transition-all flex items-center gap-3"
          >
            <Icons.Dashboard />
            Relatório Gerencial
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b text-slate-400 text-[10px] uppercase font-black tracking-widest bg-slate-50/50">
                <th className="px-8 py-6">Status Atual</th>
                <th className="px-8 py-6">Identificação / Mesa</th>
                <th className="px-8 py-6">Itens</th>
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
                      <p className="text-[10px] text-slate-500 font-bold uppercase truncate max-w-[200px]">
                        {/* Exibição rápida no monitor: agrupar por nome de produto para não poluir a tabela */}
                        {/* Fixed: Explicitly typed reduce accumulator and cast Object.values result to avoid unknown property errors */}
                        {Object.values(order.items.reduce((acc: Record<string, { name: string, q: number }>, it) => {
                          const p = products.find(prod => prod.id === it.productId);
                          const name = p?.name || '...';
                          if (!acc[name]) acc[name] = { name, q: 0 };
                          acc[name].q += it.quantity;
                          return acc;
                        }, {})).map((group: any) => `${group.q}x ${group.name}`).join(', ')}
                      </p>
                    </td>
                    <td className="px-8 py-5 text-right">
                      <div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-all">
                        <button onClick={() => setPrintingOrder(order)} className="p-2 text-slate-300 hover:text-emerald-500" title="Reemitir Cupom"><Icons.Print /></button>
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
              <button onClick={() => window.print()} className="flex-1 bg-slate-900 text-white py-4 rounded-2xl font-black uppercase text-[10px] tracking-widest shadow-xl">Imprimir</button>
              <button onClick={() => setPrintingOrder(null)} className="flex-1 bg-slate-100 text-slate-600 py-4 rounded-2xl font-black uppercase text-[10px] tracking-widest">Fechar</button>
            </div>
          </div>
        </div>
      )}
      {/* RELATÓRIO GERENCIAL */}
      {isReportOpen && businessSettings && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-slate-900/70 backdrop-blur-md overflow-hidden print:overflow-visible print:static print:bg-white">
          <div className="bg-white rounded-[3.5rem] shadow-[0_35px_60px_-15px_rgba(0,0,0,0.3)] w-full max-w-6xl max-h-[92vh] overflow-hidden animate-in zoom-in duration-300 flex flex-col my-4 print:max-h-none print:shadow-none print:rounded-none">

            {reportStep === 'FILTERS' ? (
              /* PASSO 1: CONFIGURAÇÃO DE FILTROS */
              <div className="p-16 flex flex-col gap-10">
                <div className="flex justify-between items-start">
                  <div className="space-y-2">
                    <h3 className="text-4xl font-black text-slate-900 uppercase tracking-tighter">Configurar Relatório</h3>
                    <p className="text-sm text-slate-400 font-bold uppercase tracking-widest">Selecione o período e critérios para análise</p>
                  </div>
                  <button onClick={() => setIsReportOpen(false)} className="p-4 text-slate-300 hover:text-slate-900 hover:bg-slate-100 rounded-3xl transition-all">
                    <Icons.Delete />
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-8">
                  <div className="space-y-3">
                    <label className="text-[11px] font-black text-slate-500 uppercase tracking-widest ml-1 flex items-center gap-2">
                      <div className="w-1.5 h-1.5 bg-blue-600 rounded-full"></div>
                      Data de Início
                    </label>
                    <input type="date" value={filterStartDate} onChange={e => setFilterStartDate(e.target.value)} className="w-full p-6 bg-slate-50 border-2 border-transparent focus:border-blue-100 focus:bg-white rounded-3xl font-black text-lg outline-none transition-all" />
                  </div>
                  <div className="space-y-3">
                    <label className="text-[11px] font-black text-slate-500 uppercase tracking-widest ml-1 flex items-center gap-2">
                      <div className="w-1.5 h-1.5 bg-blue-600 rounded-full"></div>
                      Data de Término
                    </label>
                    <input type="date" value={filterEndDate} onChange={e => setFilterEndDate(e.target.value)} className="w-full p-6 bg-slate-50 border-2 border-transparent focus:border-blue-100 focus:bg-white rounded-3xl font-black text-lg outline-none transition-all" />
                  </div>
                  <div className="space-y-3">
                    <label className="text-[11px] font-black text-slate-500 uppercase tracking-widest ml-1 flex items-center gap-2">
                      <div className="w-1.5 h-1.5 bg-emerald-600 rounded-full"></div>
                      Método de Pagamento
                    </label>
                    <select value={filterPayment} onChange={e => setFilterPayment(e.target.value)} className="w-full p-6 bg-slate-50 border-2 border-transparent focus:border-blue-100 focus:bg-white rounded-3xl font-black text-lg outline-none transition-all appearance-none">
                      <option value="TODOS">Todos os Métodos</option>
                      <option value="DINHEIRO">Dinheiro</option>
                      <option value="PIX">Pix</option>
                      <option value="CRÉDITO">Cartão de Crédito</option>
                      <option value="DÉBITO">Cartão de Débito</option>
                    </select>
                  </div>
                  <div className="space-y-3">
                    <label className="text-[11px] font-black text-slate-500 uppercase tracking-widest ml-1 flex items-center gap-2">
                      <div className="w-1.5 h-1.5 bg-purple-600 rounded-full"></div>
                      Modalidade de Venda
                    </label>
                    <select value={filterModality} onChange={e => setFilterModality(e.target.value)} className="w-full p-6 bg-slate-50 border-2 border-transparent focus:border-blue-100 focus:bg-white rounded-3xl font-black text-lg outline-none transition-all appearance-none">
                      <option value="TODOS">Todas as Modalidades</option>
                      <option value={SaleType.TABLE}>Mesa (Salão)</option>
                      <option value={SaleType.COUNTER}>Balcão (Retirada)</option>
                      <option value={SaleType.OWN_DELIVERY}>Delivery (Entrega)</option>
                    </select>
                  </div>
                </div>

                <button
                  onClick={() => setReportStep('VIEW')}
                  className="w-full py-8 bg-slate-900 hover:bg-black text-white rounded-[2rem] font-black uppercase text-sm tracking-[0.2em] shadow-2xl transition-all active:scale-95 flex items-center justify-center gap-3"
                >
                  Gerar Relatório Gerencial
                  <Icons.View />
                </button>
              </div>
            ) : (
              /* PASSO 2: VISUALIZAÇÃO DO RELATÓRIO Paginado e com Maior Escala */
              <div className="flex flex-col h-full bg-white">
                <div className="p-8 border-b border-slate-100 bg-slate-50/50 no-print flex justify-between items-center group">
                  <div className="flex items-center gap-4">
                    <button onClick={() => setReportStep('FILTERS')} className="p-4 bg-white text-slate-400 hover:text-slate-900 rounded-2xl border border-slate-100 shadow-sm transition-all flex items-center gap-2 text-[10px] font-black uppercase">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M15 19l-7-7 7-7" /></svg>
                      Voltar aos Filtros
                    </button>
                    <span className="text-slate-200">|</span>
                    <h4 className="font-black text-slate-800 uppercase text-xs tracking-widest">Visualizando Relatório: {filterStartDate} - {filterEndDate}</h4>
                  </div>
                  <div className="flex gap-3">
                    <button onClick={() => generatePDFReport(false)} className="bg-slate-900 text-white px-8 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-black transition-all shadow-xl">Visualizar PDF A4</button>
                    <button onClick={() => setIsReportOpen(false)} className="bg-white text-slate-400 px-8 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest border border-slate-200 hover:bg-slate-50 transition-all">Fechar</button>
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto p-16 print:p-0 print:overflow-visible">
                  <div id="report-printable-area" className="max-w-[210mm] mx-auto space-y-16 print-container">
                    {/* Cabeçalho Formal Re-escalado */}
                    <div className="flex justify-between items-start border-b-[8px] border-slate-900 pb-12">
                      <div className="space-y-3">
                        <h1 className="text-5xl font-black text-slate-900 uppercase tracking-tighter leading-none">{businessSettings.name}</h1>
                        <p className="text-[11px] font-black text-slate-400 uppercase tracking-[0.3em]">CNPJ: {businessSettings.cnpj}</p>
                        <p className="text-xs font-bold text-slate-500 uppercase tracking-widest max-w-md leading-relaxed">{businessSettings.address}</p>
                      </div>
                      <div className="text-right">
                        <div className="text-[11px] font-black text-white bg-slate-900 px-6 py-3 rounded-xl uppercase tracking-widest inline-block mb-4">Relatório de Gestão</div>
                        <p className="text-sm font-black text-slate-800 uppercase tracking-tighter">Período Selecionado</p>
                        <p className="text-xs font-bold text-slate-500 uppercase">{new Date(filterStartDate + 'T00:00:00').toLocaleDateString('pt-BR')} — {new Date(filterEndDate + 'T00:00:00').toLocaleDateString('pt-BR')}</p>
                      </div>
                    </div>

                    {(() => {
                      const filteredOrders = orders.filter(o => {
                        const orderDate = o.createdAt.split('T')[0];
                        const inDate = orderDate >= filterStartDate && orderDate <= filterEndDate;
                        const inPayment = filterPayment === 'TODOS' || o.paymentMethod === filterPayment;
                        const inModality = filterModality === 'TODOS' || o.type === filterModality;
                        return inDate && inPayment && inModality && o.status === OrderStatus.DELIVERED;
                      });

                      const totalRevenue = filteredOrders.reduce((sum, o) => sum + o.total, 0);
                      const orderCount = filteredOrders.length;
                      const avgTicket = orderCount > 0 ? totalRevenue / orderCount : 0;

                      const revenueByModality = filteredOrders.reduce((acc: any, o) => {
                        const key = getFriendlySaleType(o.type);
                        acc[key] = (acc[key] || 0) + o.total;
                        return acc;
                      }, {});

                      const revenueByPayment = filteredOrders.reduce((acc: any, o) => {
                        const key = o.paymentMethod || 'DINHEIRO';
                        acc[key] = (acc[key] || 0) + o.total;
                        return acc;
                      }, {});

                      // Paginação Local
                      const totalPages = Math.ceil(filteredOrders.length / itemsPerPage);
                      const paginatedOrders = filteredOrders.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

                      return (
                        <div className="space-y-16">
                          {/* Cards de KPIs Re-escalados */}
                          <div className="grid grid-cols-3 gap-10">
                            <div className="bg-slate-900 p-8 rounded-[2rem] text-white shadow-xl shadow-slate-200">
                              <p className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-400 mb-2">Faturamento Bruto</p>
                              <h4 className="text-2xl font-black">R$ {totalRevenue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</h4>
                            </div>
                            <div className="bg-slate-50 p-8 rounded-[2rem] border border-slate-100 flex flex-col justify-between">
                              <p className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-400 mb-2">Volume de Vendas</p>
                              <h4 className="text-2xl font-black text-slate-800">{orderCount} <span className="text-[10px] text-slate-400 font-bold tracking-widest uppercase ml-1">vendas</span></h4>
                            </div>
                            <div className="bg-slate-50 p-8 rounded-[2rem] border border-slate-100 flex flex-col justify-between">
                              <p className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-400 mb-2">Ticket Médio</p>
                              <h4 className="text-2xl font-black text-slate-800">R$ {avgTicket.toFixed(2)}</h4>
                            </div>
                          </div>

                          {/* Seções de Gráficos/Tabelas Escalonadas */}
                          <div className="grid grid-cols-2 gap-16">
                            <div className="space-y-8">
                              <h5 className="text-sm font-black text-slate-900 border-l-[6px] border-blue-600 pl-4 uppercase tracking-[0.2em]">Receita por Modalidade</h5>
                              <div className="space-y-4">
                                {Object.entries(revenueByModality).map(([mod, val]) => (
                                  <div key={mod} className="flex justify-between items-center p-6 bg-slate-50 rounded-3xl border border-slate-100 group hover:border-blue-200 transition-all">
                                    <span className="text-xs font-black text-slate-500 uppercase tracking-widest">{mod}</span>
                                    <span className="font-black text-slate-900 text-lg">R$ {(val as number).toFixed(2)}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                            <div className="space-y-8">
                              <h5 className="text-sm font-black text-slate-900 border-l-[6px] border-emerald-600 pl-4 uppercase tracking-[0.2em]">Fluxo por Pagamento</h5>
                              <div className="space-y-4">
                                {Object.entries(revenueByPayment).map(([pay, val]) => (
                                  <div key={pay} className="flex justify-between items-center p-6 bg-slate-50 rounded-3xl border border-slate-100 group hover:border-emerald-200 transition-all">
                                    <span className="text-xs font-black text-slate-500 uppercase tracking-widest">{pay}</span>
                                    <span className="font-black text-slate-900 text-lg">R$ {(val as number).toFixed(2)}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </div>

                          {/* Tabela de Detalhes com Paginação (VISÍVEL APENAS NA TELA) */}
                          <div className="space-y-8 no-print">
                            <div className="flex justify-between items-end border-b-[3px] border-slate-900 pb-4">
                              <h5 className="text-sm font-black text-slate-900 uppercase tracking-[0.2em]">Histórico Detalhado</h5>
                              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Exibindo {paginatedOrders.length} de {filteredOrders.length} registros</p>
                            </div>
                            <table className="w-full text-left report-table">
                              <thead>
                                <tr className="text-[10px] font-black uppercase text-slate-500">
                                  <th className="py-5 px-4 bg-slate-50 rounded-tl-xl">Data/Hora</th>
                                  <th className="py-5 px-4 bg-slate-50">Identificação</th>
                                  <th className="py-5 px-4 bg-slate-50">Modalidade</th>
                                  <th className="py-5 px-4 bg-slate-50">Pagamento</th>
                                  <th className="py-5 px-4 bg-slate-50 text-right rounded-tr-xl">Total Bruto</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100 italic">
                                {paginatedOrders.map(o => (
                                  <tr key={o.id} className="text-[12px] font-bold text-slate-700 hover:bg-slate-50 transition-colors">
                                    <td className="py-5 px-4 whitespace-nowrap">{new Date(o.createdAt).toLocaleString('pt-BR')}</td>
                                    <td className="py-5 px-4 uppercase font-black text-slate-900">{o.clientName} {o.tableNumber ? `(Mesa ${o.tableNumber})` : ''}</td>
                                    <td className="py-5 px-4 uppercase tracking-widest text-[9px]">{getFriendlySaleType(o.type)}</td>
                                    <td className="py-5 px-4 uppercase text-[10px]">{o.paymentMethod || 'DINHEIRO'}</td>
                                    <td className="py-5 px-4 text-right font-black text-slate-900">R$ {o.total.toFixed(2)}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>

                            {/* Controles de Paginação (Ocultos na impressão) */}
                            {totalPages > 1 && (
                              <div className="flex justify-center items-center gap-4 pt-8">
                                <button
                                  disabled={currentPage === 1}
                                  onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                                  className="p-4 bg-slate-100 hover:bg-blue-600 hover:text-white rounded-2xl disabled:opacity-30 disabled:hover:bg-slate-100 disabled:hover:text-slate-400 transition-all font-black text-[10px] uppercase tracking-widest flex items-center gap-2"
                                >
                                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M15 19l-7-7 7-7" /></svg>
                                  Anterior
                                </button>
                                <div className="px-6 py-4 bg-slate-50 rounded-2xl border border-slate-100">
                                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Página</span>
                                  <span className="mx-3 font-black text-slate-900">{currentPage} de {totalPages}</span>
                                </div>
                                <button
                                  disabled={currentPage === totalPages}
                                  onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                                  className="p-4 bg-slate-100 hover:bg-blue-600 hover:text-white rounded-2xl disabled:opacity-30 disabled:hover:bg-slate-100 disabled:hover:text-slate-400 transition-all font-black text-[10px] uppercase tracking-widest flex items-center gap-2"
                                >
                                  Próxima
                                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M9 5l7 7-7 7" /></svg>
                                </button>
                              </div>
                            )}
                          </div>

                          {/* Fim do Histórico */}

                          <div className="pt-16 border-t-2 border-slate-100 text-center">
                            <p className="text-[10px] font-black text-slate-300 uppercase tracking-[0.4em]">Relatório Gerencial • {businessSettings.name} • Autenticado via Sistema</p>
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* MODAL DE PREVIEW DO PDF */}
      {pdfPreviewUrl && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-12 bg-slate-900/90 backdrop-blur-xl animate-in fade-in duration-300">
          <div className="bg-white rounded-[4rem] shadow-2xl w-full max-w-5xl h-full flex flex-col overflow-hidden">
            <div className="p-8 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <div>
                <h3 className="text-xl font-black text-slate-900 uppercase tracking-tighter">Visualização do Relatório PDF</h3>
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Documento gerado localmente em alta resolução</p>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => generatePDFReport(true)}
                  className="bg-slate-900 text-white px-8 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-black transition-all flex items-center gap-2"
                >
                  Download PDF
                </button>
                <button
                  onClick={() => {
                    URL.revokeObjectURL(pdfPreviewUrl);
                    setPdfPreviewUrl(null);
                  }}
                  className="bg-white text-slate-400 px-8 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest border border-slate-200 hover:bg-slate-50 transition-all"
                >
                  Fechar Visualização
                </button>
              </div>
            </div>
            <div className="flex-1 bg-slate-200 p-8 flex justify-center items-center">
              <iframe
                src={pdfPreviewUrl}
                className="w-full h-full rounded-2xl shadow-xl bg-white"
                title="PDF Preview"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SalesMonitor;
