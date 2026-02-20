
import React, { useState, useEffect, useMemo } from 'react';
import { db, BusinessSettings } from '../services/db';
import { Order, OrderStatus, SaleType, Client, Product } from '../types';
import { Icons } from '../constants';
import CustomAlert from '../components/CustomAlert';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

const Reports: React.FC = () => {
    const [orders, setOrders] = useState<Order[]>([]);
    const [clients, setClients] = useState<Client[]>([]);
    const [businessSettings, setBusinessSettings] = useState<BusinessSettings | null>(null);
    const [pdfPreviewUrl, setPdfPreviewUrl] = useState<string | null>(null);

    // Sales Filters
    const [salesStartDate, setSalesStartDate] = useState(new Date().toISOString().split('T')[0]);
    const [salesEndDate, setSalesEndDate] = useState(new Date().toISOString().split('T')[0]);
    const [salesPayment, setSalesPayment] = useState<string>('TODOS');
    const [salesModality, setSalesModality] = useState<string>('TODOS');

    // Customer Filters
    const [clientSearch, setClientSearch] = useState('');

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        const [o, c, s] = await Promise.all([
            db.getOrders(),
            db.getClients(),
            db.getSettings()
        ]);
        setOrders(o);
        setClients(c);
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

    const generateSalesPDF = async (downloadOnly = false) => {
        if (!businessSettings) return;

        try {
            const pdfDoc = await PDFDocument.create();
            const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
            const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

            const filteredOrders = orders.filter(o => {
                const orderDate = o.createdAt.split('T')[0];
                const inDate = orderDate >= salesStartDate && orderDate <= salesEndDate;
                const inPayment = salesPayment === 'TODOS' || o.paymentMethod === salesPayment;
                const inModality = salesModality === 'TODOS' || o.type === salesModality;
                return inDate && inPayment && inModality && o.status === OrderStatus.DELIVERED;
            });

            const totalRevenue = filteredOrders.reduce((sum, o) => sum + o.total, 0);
            const orderCount = filteredOrders.length;
            const avgTicket = orderCount > 0 ? totalRevenue / orderCount : 0;

            let page = pdfDoc.addPage([595.28, 841.89]);
            const { width, height } = page.getSize();
            let y = height - 50;

            // Header
            page.drawText('RELATÓRIO GERENCIAL DE VENDAS', { x: 50, y, size: 18, font: fontBold });
            y -= 25;
            page.drawText(businessSettings.name, { x: 50, y, size: 12, font: fontBold });
            y -= 15;
            page.drawText(`CNPJ: ${businessSettings.cnpj}`, { x: 50, y, size: 10, font });
            y -= 15;
            page.drawText(`Período: ${new Date(salesStartDate + 'T00:00:00').toLocaleDateString('pt-BR')} a ${new Date(salesEndDate + 'T00:00:00').toLocaleDateString('pt-BR')}`, { x: 50, y, size: 10, font });

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
            page.drawText('MOD.', { x: 450, y, size: 8, font: fontBold });
            page.drawText('TOTAL', { x: 520, y, size: 8, font: fontBold });
            y -= 25;

            for (const o of filteredOrders) {
                if (y < 70) {
                    page = pdfDoc.addPage([595.28, 841.89]);
                    y = page.getHeight() - 50;
                }
                const dateStr = new Date(o.createdAt).toLocaleDateString('pt-BR');
                page.drawText(dateStr, { x: 55, y, size: 8, font });
                page.drawText(o.clientName.substring(0, 40), { x: 120, y, size: 8, font });
                page.drawText(getFriendlySaleType(o.type), { x: 450, y, size: 8, font });
                page.drawText(`R$ ${o.total.toFixed(2)}`, { x: 520, y, size: 8, font: fontBold });
                y -= 20;
            }

            const pdfBytes = await pdfDoc.save();
            const blob = new Blob([pdfBytes as any], { type: 'application/pdf' });
            const url = URL.createObjectURL(blob);

            if (downloadOnly) {
                const link = document.createElement('a');
                link.href = url;
                link.download = `relatorio_vendas_${salesStartDate}_${salesEndDate}.pdf`;
                link.click();
                URL.revokeObjectURL(url);
            } else {
                setPdfPreviewUrl(url);
            }
        } catch (error) {
            console.error('Erro ao gerar PDF:', error);
            alert('Erro ao gerar relatório.');
        }
    };

    const generateClientsPDF = async (downloadOnly = false) => {
        try {
            const pdfDoc = await PDFDocument.create();
            const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
            const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

            let page = pdfDoc.addPage([595.28, 841.89]);
            const { width, height } = page.getSize();
            let y = height - 50;

            const filtered = clients.filter(c =>
                c.name.toLowerCase().includes(clientSearch.toLowerCase()) ||
                c.phone.includes(clientSearch)
            );

            // Header
            page.drawText('LISTA DE CLIENTES E FIDELIDADE', { x: 50, y, size: 18, font: fontBold });
            y -= 25;
            page.drawText('Relatório gerado via CRM Delivery Fast', { x: 50, y, size: 10, font });
            y -= 15;
            page.drawText(`Data de Emissão: ${new Date().toLocaleDateString('pt-BR')} ${new Date().toLocaleTimeString('pt-BR')}`, { x: 50, y, size: 10, font });

            y -= 40;
            // Table Header
            page.drawRectangle({ x: 50, y: y - 5, width: width - 100, height: 20, color: rgb(0.95, 0.95, 0.95) });
            page.drawText('NOME DO CLIENTE', { x: 55, y, size: 9, font: fontBold });
            page.drawText('TELEFONE', { x: 300, y, size: 9, font: fontBold });
            page.drawText('PEDIDOS', { x: 450, y, size: 9, font: fontBold });
            y -= 25;

            for (const client of filtered) {
                if (y < 70) {
                    page = pdfDoc.addPage([595.28, 841.89]);
                    y = page.getHeight() - 50;
                }

                page.drawText(client.name.substring(0, 45), { x: 55, y, size: 9, font });
                page.drawText(client.phone, { x: 300, y, size: 9, font });
                page.drawText(client.totalOrders.toString(), { x: 450, y, size: 9, font: fontBold });
                y -= 18;
            }

            const pdfBytes = await pdfDoc.save();
            const blob = new Blob([pdfBytes as any], { type: 'application/pdf' });
            const url = URL.createObjectURL(blob);

            if (downloadOnly) {
                const link = document.createElement('a');
                link.href = url;
                link.download = `lista_clientes_${new Date().getTime()}.pdf`;
                link.click();
                URL.revokeObjectURL(url);
            } else {
                setPdfPreviewUrl(url);
            }
        } catch (error) {
            console.error('Erro ao gerar PDF:', error);
        }
    };

    return (
        <div className="flex flex-col h-full gap-8 animate-in fade-in duration-500 overflow-hidden">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">

                {/* CARD RELATÓRIO DE VENDAS */}
                <div className="bg-white p-10 rounded-[3rem] shadow-sm border border-slate-100 flex flex-col">
                    <div className="mb-8">
                        <h3 className="text-2xl font-black text-slate-800 uppercase tracking-tighter flex items-center gap-3">
                            <span className="p-3 bg-blue-50 text-blue-600 rounded-2xl"><Icons.Dashboard /></span>
                            Relatório de Vendas
                        </h3>
                        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-2 ml-14">Análise financeira detalhada por período</p>
                    </div>

                    <div className="space-y-6 flex-1">
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Início</label>
                                <input type="date" value={salesStartDate} onChange={e => setSalesStartDate(e.target.value)} className="w-full p-4 bg-slate-50 border-none rounded-2xl font-bold text-sm" />
                            </div>
                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Fim</label>
                                <input type="date" value={salesEndDate} onChange={e => setSalesEndDate(e.target.value)} className="w-full p-4 bg-slate-50 border-none rounded-2xl font-bold text-sm" />
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Pagamento</label>
                                <select value={salesPayment} onChange={e => setSalesPayment(e.target.value)} className="w-full p-4 bg-slate-50 border-none rounded-2xl font-bold text-sm">
                                    <option value="TODOS">TODOS</option>
                                    <option value="DINHEIRO">DINHEIRO</option>
                                    <option value="CARTÃO">CARTÃO</option>
                                    <option value="PIX">PIX</option>
                                </select>
                            </div>
                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Modalidade</label>
                                <select value={salesModality} onChange={e => setSalesModality(e.target.value)} className="w-full p-4 bg-slate-50 border-none rounded-2xl font-bold text-sm">
                                    <option value="TODOS">TODOS</option>
                                    <option value={SaleType.COUNTER}>BALCÃO</option>
                                    <option value={SaleType.TABLE}>MESA</option>
                                    <option value={SaleType.OWN_DELIVERY}>DELIVERY</option>
                                </select>
                            </div>
                        </div>
                    </div>

                    <button
                        onClick={() => generateSalesPDF(false)}
                        className="mt-8 w-full py-6 bg-slate-900 hover:bg-black text-white rounded-[2rem] font-black uppercase text-xs tracking-widest shadow-xl transition-all flex items-center justify-center gap-3"
                    >
                        <Icons.Print />
                        Visualizar Relatório de Vendas
                    </button>
                </div>

                {/* CARD LISTA DE CLIENTES */}
                <div className="bg-white p-10 rounded-[3rem] shadow-sm border border-slate-100 flex flex-col">
                    <div className="mb-8">
                        <h3 className="text-2xl font-black text-slate-800 uppercase tracking-tighter flex items-center gap-3">
                            <span className="p-3 bg-blue-50 text-blue-600 rounded-2xl"><Icons.CRM /></span>
                            Lista de Clientes
                        </h3>
                        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-2 ml-14">Fidelidade e contatos registrados</p>
                    </div>

                    <div className="space-y-6 flex-1">
                        <div className="space-y-2">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Buscar Cliente (Opcional)</label>
                            <input
                                type="text"
                                placeholder="Ex: Nome ou Telefone..."
                                value={clientSearch}
                                onChange={e => setClientSearch(e.target.value)}
                                className="w-full p-4 bg-slate-50 border-none rounded-2xl font-bold text-sm"
                            />
                        </div>
                    </div>

                    <button
                        onClick={() => generateClientsPDF(false)}
                        className="mt-8 w-full py-6 bg-blue-600 hover:bg-blue-700 text-white rounded-[2rem] font-black uppercase text-xs tracking-widest shadow-xl transition-all flex items-center justify-center gap-3"
                    >
                        <Icons.Print />
                        Visualizar Lista de Clientes
                    </button>
                </div>

            </div>

            {/* MODAL DE PREVIEW DO PDF */}
            {pdfPreviewUrl && (
                <div className="fixed inset-0 z-[120] flex items-center justify-center p-12 bg-slate-900/90 backdrop-blur-xl animate-in fade-in duration-300">
                    <div className="bg-white rounded-[4rem] shadow-2xl w-full max-w-5xl h-full flex flex-col overflow-hidden">
                        <div className="p-8 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                            <div>
                                <h3 className="text-xl font-black text-slate-900 uppercase tracking-tighter">Visualização do Relatório</h3>
                                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Documento gerado localmente em alta resolução</p>
                            </div>
                            <div className="flex gap-3">
                                <button
                                    onClick={() => {
                                        const isClientReport = pdfPreviewUrl.includes('lista_clientes') || clientSearch !== '' || !pdfPreviewUrl.includes('vendas'); // Simplistic check
                                        // We should probably store which report is active but for simplicity since we have separate buttons:
                                        // Actually, let's just use the current state.
                                        if (pdfPreviewUrl.includes('vendas')) generateSalesPDF(true);
                                        else generateClientsPDF(true);
                                    }}
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
                                    Fechar
                                </button>
                            </div>
                        </div>
                        <div className="flex-1 bg-slate-200 p-8 flex justify-center items-center">
                            <iframe
                                src={pdfPreviewUrl}
                                className="w-full h-full rounded-2xl shadow-xl bg-white"
                                title="Report Preview"
                            />
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Reports;
