
import React, { useState, useEffect, useMemo } from 'react';
import { db, BusinessSettings } from '../services/db';
import { Order, OrderStatus, SaleType, Client, Product, DeliveryDriver } from '../types';
import { Icons } from '../constants';
import CustomAlert from '../components/CustomAlert';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

const Reports: React.FC = () => {
    const [orders, setOrders] = useState<Order[]>([]);
    const [clients, setClients] = useState<Client[]>([]);
    const [drivers, setDrivers] = useState<DeliveryDriver[]>([]);
    const [businessSettings, setBusinessSettings] = useState<BusinessSettings | null>(null);
    const [pdfPreviewUrl, setPdfPreviewUrl] = useState<string | null>(null);

    // Sales Filters
    const [salesStartDate, setSalesStartDate] = useState(new Date().toISOString().split('T')[0]);
    const [salesEndDate, setSalesEndDate] = useState(new Date().toISOString().split('T')[0]);
    const [salesPayment, setSalesPayment] = useState<string>('TODOS');
    const [salesModality, setSalesModality] = useState<string>('TODOS');
    const [salesOrigin, setSalesOrigin] = useState<'TODOS' | 'FISICO' | 'DIGITAL'>('TODOS');

    // Tab State
    const [activeTab, setActiveTab] = useState<'SALES' | 'CLIENTS' | 'DRIVERS'>('SALES');

    // Customer Filters
    const [clientSearch, setClientSearch] = useState('');
    const [selectedClient, setSelectedClient] = useState<Client | null>(null);
    const [showClientDropdown, setShowClientDropdown] = useState(false);
    const [previewType, setPreviewType] = useState<'SALES' | 'CLIENTS' | 'CLIENT_ORDERS' | 'DRIVERS' | null>(null);

    // Driver Filters
    const [driverStartDate, setDriverStartDate] = useState(new Date().toISOString().split('T')[0]);
    const [driverEndDate, setDriverEndDate] = useState(new Date().toISOString().split('T')[0]);
    const [selectedDriverId, setSelectedDriverId] = useState<string>('TODOS');

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        const [o, c, s, d] = await Promise.all([
            db.getOrders(),
            db.getClients(),
            db.getSettings(),
            db.getDrivers()
        ]);
        setOrders(o);
        setClients(c);
        setBusinessSettings(s);
        setDrivers(d);
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

                // If checking for purely DIGITAL origins, it ignores the modality because all digital origins become TABLE sales right now.
                // Otherwise normal modality check
                const inModality = (salesOrigin === 'DIGITAL')
                    ? true
                    : (salesModality === 'TODOS' || o.type === salesModality);

                const inOrigin = salesOrigin === 'TODOS' ? true : (salesOrigin === 'DIGITAL' ? o.isOriginDigitalMenu === true : (o.isOriginDigitalMenu === false || o.isOriginDigitalMenu === undefined));
                return inDate && inPayment && inModality && inOrigin && o.status === OrderStatus.DELIVERED;
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
                setPreviewType('SALES');
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
                setPreviewType('CLIENTS');
                setPdfPreviewUrl(url);
            }
        } catch (error) {
            console.error('Erro ao gerar PDF:', error);
        }
    };

    const generateClientOrdersPDF = async (downloadOnly = false) => {
        if (!selectedClient || !businessSettings) return;

        try {
            const pdfDoc = await PDFDocument.create();
            const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
            const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

            const clientOrders = orders.filter(o => o.clientId === selectedClient.id && o.status === OrderStatus.DELIVERED);
            const totalRevenue = clientOrders.reduce((sum, o) => sum + o.total, 0);
            const orderCount = clientOrders.length;
            const avgTicket = orderCount > 0 ? totalRevenue / orderCount : 0;

            let page = pdfDoc.addPage([595.28, 841.89]);
            const { width, height } = page.getSize();
            let y = height - 50;

            // Header
            page.drawText('RELATÓRIO DE COMPRAS DO CLIENTE', { x: 50, y, size: 18, font: fontBold });
            y -= 25;
            page.drawText(businessSettings.name, { x: 50, y, size: 12, font: fontBold });
            y -= 15;
            page.drawText(`Cliente: ${selectedClient.name}`, { x: 50, y, size: 10, font: fontBold });
            y -= 15;
            page.drawText(`Telefone: ${selectedClient.phone}`, { x: 50, y, size: 10, font });

            y -= 40;
            // KPIs
            page.drawText('RESUMO DO CLIENTE', { x: 50, y, size: 12, font: fontBold });
            y -= 20;
            page.drawText(`Faturamento Total: R$ ${totalRevenue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, { x: 50, y, size: 10, font });
            y -= 15;
            page.drawText(`Volume de Pedidos: ${orderCount}`, { x: 50, y, size: 10, font });
            y -= 15;
            page.drawText(`Ticket Médio: R$ ${avgTicket.toFixed(2)}`, { x: 50, y, size: 10, font });

            y -= 40;
            // Table Header
            page.drawRectangle({ x: 50, y: y - 5, width: width - 100, height: 20, color: rgb(0.95, 0.95, 0.95) });
            page.drawText('DATA e HORA', { x: 55, y, size: 8, font: fontBold });
            page.drawText('MODALIDADE', { x: 180, y, size: 8, font: fontBold });
            page.drawText('STATUS', { x: 300, y, size: 8, font: fontBold });
            page.drawText('TOTAL', { x: 450, y, size: 8, font: fontBold });
            y -= 25;

            for (const o of clientOrders) {
                if (y < 70) {
                    page = pdfDoc.addPage([595.28, 841.89]);
                    y = page.getHeight() - 50;
                }
                const dateObj = new Date(o.createdAt);
                const dateStr = `${dateObj.toLocaleDateString('pt-BR')} ${dateObj.toLocaleTimeString('pt-BR').substring(0, 5)}`;
                page.drawText(dateStr, { x: 55, y, size: 8, font });
                page.drawText(getFriendlySaleType(o.type), { x: 180, y, size: 8, font });
                page.drawText(o.status === OrderStatus.DELIVERED ? 'Finalizada' : o.status, { x: 300, y, size: 8, font });
                page.drawText(`R$ ${o.total.toFixed(2)}`, { x: 450, y, size: 8, font: fontBold });
                y -= 20;
            }

            const pdfBytes = await pdfDoc.save();
            const blob = new Blob([pdfBytes as any], { type: 'application/pdf' });
            const url = URL.createObjectURL(blob);

            if (downloadOnly) {
                const link = document.createElement('a');
                link.href = url;
                link.download = `relatorio_compras_${selectedClient.name.replace(/\s+/g, '_')}_${new Date().getTime()}.pdf`;
                link.click();
                URL.revokeObjectURL(url);
            } else {
                setPreviewType('CLIENT_ORDERS');
                setPdfPreviewUrl(url);
            }
        } catch (error) {
            console.error('Erro ao gerar PDF do cliente:', error);
            alert('Erro ao gerar relatório do cliente.');
        }
    };

    const generateDriversPDF = async (downloadOnly = false) => {
        if (!businessSettings) return;

        try {
            const pdfDoc = await PDFDocument.create();
            const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
            const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

            const filteredOrders = orders.filter(o => {
                const orderDate = o.createdAt.split('T')[0];
                const inDate = orderDate >= driverStartDate && orderDate <= driverEndDate;
                const inDriver = selectedDriverId === 'TODOS' || o.driverId === selectedDriverId;
                return inDate && inDriver && o.type === SaleType.OWN_DELIVERY && o.status === OrderStatus.DELIVERED;
            });

            const totalDeliveries = filteredOrders.length;
            const totalRevenue = filteredOrders.reduce((sum, o) => sum + o.total, 0);

            let page = pdfDoc.addPage([595.28, 841.89]);
            const { width, height } = page.getSize();
            let y = height - 50;

            const driverName = selectedDriverId === 'TODOS' ? 'Todos os Entregadores' : (drivers.find(d => d.id === selectedDriverId)?.name || 'Desconhecido');

            // Header
            page.drawText('RELATÓRIO DE ENTREGADORES', { x: 50, y, size: 18, font: fontBold });
            y -= 25;
            page.drawText(businessSettings.name, { x: 50, y, size: 12, font: fontBold });
            y -= 15;
            page.drawText(`Entregador: ${driverName}`, { x: 50, y, size: 10, font: fontBold });
            y -= 15;
            page.drawText(`Período: ${new Date(driverStartDate + 'T00:00:00').toLocaleDateString('pt-BR')} a ${new Date(driverEndDate + 'T00:00:00').toLocaleDateString('pt-BR')}`, { x: 50, y, size: 10, font });

            y -= 40;
            // KPIs
            page.drawText('RESUMO DE ENTREGAS', { x: 50, y, size: 12, font: fontBold });
            y -= 20;
            page.drawText(`Faturamento Vinculado: R$ ${totalRevenue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, { x: 50, y, size: 10, font });
            y -= 15;
            page.drawText(`Total de Entregas Finalizadas: ${totalDeliveries}`, { x: 50, y, size: 10, font });

            y -= 40;
            // Table Header
            page.drawRectangle({ x: 50, y: y - 5, width: width - 100, height: 20, color: rgb(0.95, 0.95, 0.95) });
            page.drawText('DATA | HORA', { x: 55, y, size: 8, font: fontBold });
            page.drawText('CLIENTE', { x: 180, y, size: 8, font: fontBold });
            page.drawText('ENTREGADOR', { x: 350, y, size: 8, font: fontBold });
            page.drawText('TOTAL', { x: 500, y, size: 8, font: fontBold });
            y -= 25;

            for (const o of filteredOrders) {
                if (y < 70) {
                    page = pdfDoc.addPage([595.28, 841.89]);
                    y = page.getHeight() - 50;
                }
                const dateObj = new Date(o.createdAt);
                const dateStr = `${dateObj.toLocaleDateString('pt-BR')} ${dateObj.toLocaleTimeString('pt-BR').substring(0, 5)}`;
                const dName = drivers.find(d => d.id === o.driverId)?.name || 'N/A';

                page.drawText(dateStr, { x: 55, y, size: 8, font });
                page.drawText(o.clientName.substring(0, 30), { x: 180, y, size: 8, font });
                page.drawText(dName.substring(0, 25), { x: 350, y, size: 8, font });
                page.drawText(`R$ ${o.total.toFixed(2)}`, { x: 500, y, size: 8, font: fontBold });
                y -= 20;
            }

            const pdfBytes = await pdfDoc.save();
            const blob = new Blob([pdfBytes as any], { type: 'application/pdf' });
            const url = URL.createObjectURL(blob);

            if (downloadOnly) {
                const link = document.createElement('a');
                link.href = url;
                link.download = `relatorio_entregadores_${driverStartDate}_${driverEndDate}.pdf`;
                link.click();
                URL.revokeObjectURL(url);
            } else {
                setPreviewType('DRIVERS');
                setPdfPreviewUrl(url);
            }
        } catch (error) {
            console.error('Erro ao gerar PDF de entregadores:', error);
            alert('Erro ao gerar relatório de entregadores.');
        }
    };

    return (
        <div className="flex flex-col h-full gap-8 animate-in fade-in duration-500 overflow-y-auto pb-8">

            {/* TABS HEADER */}
            <div className="flex gap-4 border-b border-slate-200 pb-2 px-2 shrink-0">
                <button onClick={() => setActiveTab('SALES')} className={`pb-4 text-[12px] font-black uppercase tracking-widest transition-all ${activeTab === 'SALES' ? 'text-blue-600 border-b-4 border-blue-600' : 'text-slate-400 hover:text-slate-600'}`}>Relatórios de Vendas</button>
                <button onClick={() => setActiveTab('CLIENTS')} className={`pb-4 text-[12px] font-black uppercase tracking-widest transition-all ${activeTab === 'CLIENTS' ? 'text-blue-600 border-b-4 border-blue-600' : 'text-slate-400 hover:text-slate-600'}`}>Lista de Clientes</button>
                <button onClick={() => setActiveTab('DRIVERS')} className={`pb-4 text-[12px] font-black uppercase tracking-widest transition-all ${activeTab === 'DRIVERS' ? 'text-blue-600 border-b-4 border-blue-600' : 'text-slate-400 hover:text-slate-600'}`}>Rotas de Entregadores</button>
            </div>

            <div className="flex-1">

                {/* CARD RELATÓRIO DE VENDAS */}
                {activeTab === 'SALES' && (
                    <div className="bg-white p-10 rounded-[3rem] shadow-sm border border-slate-100 flex flex-col h-max max-w-4xl animate-in fade-in zoom-in-95">
                        <div className="mb-8">
                            <h3 className="text-2xl font-black text-slate-800 uppercase tracking-tighter flex items-center gap-3">
                                <span className="p-3 bg-blue-50 text-blue-600 rounded-2xl"><Icons.Dashboard /></span>
                                Relatório de Vendas
                            </h3>
                            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-2 ml-14">Análise financeira detalhada por período</p>
                        </div>

                        <div className="space-y-6">
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

                            <div className="grid grid-cols-1 gap-4">
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Origem do Pedido (Cardápio Digital)</label>
                                    <select value={salesOrigin} onChange={e => setSalesOrigin(e.target.value as any)} className="w-full p-4 bg-slate-50 border-none rounded-2xl font-bold text-sm">
                                        <option value="TODOS">TODOS OS PEDIDOS</option>
                                        <option value="FISICO">APENAS ATENDIMENTO FÍSICO/GARÇOM</option>
                                        <option value="DIGITAL">APENAS CARDÁPIO DIGITAL</option>
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
                )}

                {/* CARD LISTA DE CLIENTES */}
                {activeTab === 'CLIENTS' && (
                    <div className="bg-white p-10 rounded-[3rem] shadow-sm border border-slate-100 flex flex-col h-max max-w-4xl animate-in fade-in zoom-in-95">
                        <div className="mb-8">
                            <h3 className="text-2xl font-black text-slate-800 uppercase tracking-tighter flex items-center gap-3">
                                <span className="p-3 bg-blue-50 text-blue-600 rounded-2xl"><Icons.CRM /></span>
                                Lista de Clientes
                            </h3>
                            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-2 ml-14">Fidelidade e contatos registrados</p>
                        </div>

                        <div className="space-y-6">
                            <div className="space-y-2 relative">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Buscar Cliente (Opcional)</label>
                                {selectedClient ? (
                                    <div className="flex items-center justify-between p-4 bg-blue-50 border border-blue-100 rounded-2xl">
                                        <div className="flex flex-col">
                                            <span className="font-bold text-sm text-blue-900">{selectedClient.name}</span>
                                            <span className="text-xs text-blue-600">{selectedClient.phone}</span>
                                        </div>
                                        <button
                                            onClick={() => {
                                                setSelectedClient(null);
                                                setClientSearch('');
                                            }}
                                            className="text-blue-400 hover:text-blue-600 p-2 font-bold"
                                            title="Remover cliente"
                                        >
                                            &times;
                                        </button>
                                    </div>
                                ) : (
                                    <>
                                        <input
                                            type="text"
                                            placeholder="Ex: Nome ou Telefone..."
                                            value={clientSearch}
                                            onChange={e => {
                                                setClientSearch(e.target.value);
                                                setShowClientDropdown(true);
                                            }}
                                            onFocus={() => setShowClientDropdown(true)}
                                            className="w-full p-4 bg-slate-50 border-none rounded-2xl font-bold text-sm"
                                        />
                                        {showClientDropdown && clientSearch && (
                                            <div className="absolute z-10 w-full mt-2 bg-white rounded-2xl shadow-xl border border-slate-100 max-h-48 overflow-y-auto">
                                                {clients.filter(c => c.name.toLowerCase().includes(clientSearch.toLowerCase()) || c.phone.includes(clientSearch)).length > 0 ? (
                                                    clients.filter(c => c.name.toLowerCase().includes(clientSearch.toLowerCase()) || c.phone.includes(clientSearch)).map(client => (
                                                        <div
                                                            key={client.id}
                                                            onClick={() => {
                                                                setSelectedClient(client);
                                                                setShowClientDropdown(false);
                                                                setClientSearch(client.name);
                                                            }}
                                                            className="p-3 hover:bg-slate-50 cursor-pointer border-b border-slate-50 last:border-none flex flex-col"
                                                        >
                                                            <span className="font-bold text-sm text-slate-700">{client.name}</span>
                                                            <span className="text-xs text-slate-400">{client.phone}</span>
                                                        </div>
                                                    ))
                                                ) : (
                                                    <div className="p-4 text-sm text-slate-400 text-center font-bold">Nenhum cliente encontrado</div>
                                                )}
                                            </div>
                                        )}
                                    </>
                                )}
                            </div>
                        </div>

                        <div className="mt-8 flex flex-col gap-3">
                            {selectedClient && (
                                <button
                                    onClick={() => generateClientOrdersPDF(false)}
                                    className="w-full py-4 bg-purple-600 hover:bg-purple-700 text-white rounded-[2rem] font-black uppercase text-xs tracking-widest shadow-xl transition-all flex items-center justify-center gap-3"
                                >
                                    <Icons.Dashboard />
                                    Ver Compras do Cliente
                                </button>
                            )}

                            <button
                                onClick={() => generateClientsPDF(false)}
                                className={`w-full py-4 ${selectedClient ? 'bg-slate-100 hover:bg-slate-200 text-slate-600' : 'bg-blue-600 hover:bg-blue-700 text-white'} rounded-[2rem] font-black uppercase text-xs tracking-widest shadow-xl transition-all flex items-center justify-center gap-3`}
                            >
                                <Icons.Print />
                                {selectedClient ? 'Gerar Lista Geral' : 'Visualizar Lista de Clientes'}
                            </button>
                        </div>
                    </div>
                )}

                {/* CARD RELATÓRIO DE ENTREGADORES */}
                {activeTab === 'DRIVERS' && (
                    <div className="bg-white p-10 rounded-[3rem] shadow-sm border border-slate-100 flex flex-col h-max max-w-4xl animate-in fade-in zoom-in-95">
                        <div className="mb-8">
                            <h3 className="text-2xl font-black text-slate-800 uppercase tracking-tighter flex items-center gap-3">
                                <span className="p-3 bg-blue-50 text-blue-600 rounded-2xl"><Icons.Logistics /></span>
                                Relatório de Entregadores
                            </h3>
                            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-2 ml-14">Histórico de entregas e conferência de rotas</p>
                        </div>

                        <div className="space-y-6">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Início</label>
                                    <input type="date" value={driverStartDate} onChange={e => setDriverStartDate(e.target.value)} className="w-full p-4 bg-slate-50 border-none rounded-2xl font-bold text-sm" />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Fim</label>
                                    <input type="date" value={driverEndDate} onChange={e => setDriverEndDate(e.target.value)} className="w-full p-4 bg-slate-50 border-none rounded-2xl font-bold text-sm" />
                                </div>
                            </div>

                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Entregador</label>
                                <select value={selectedDriverId} onChange={e => setSelectedDriverId(e.target.value)} className="w-full p-4 bg-slate-50 border-none rounded-2xl font-bold text-sm">
                                    <option value="TODOS">TODOS OS ENTREGADORES</option>
                                    {drivers.map(d => (
                                        <option key={d.id} value={d.id}>{d.name} ({d.vehicle.plate})</option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        <button
                            onClick={() => generateDriversPDF(false)}
                            className="mt-8 w-full py-6 bg-slate-900 hover:bg-black text-white rounded-[2rem] font-black uppercase text-xs tracking-widest shadow-xl transition-all flex items-center justify-center gap-3"
                        >
                            <Icons.Print />
                            Visualizar Relatório de Rotas
                        </button>
                    </div>
                )}

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
                                        if (previewType === 'SALES') generateSalesPDF(true);
                                        else if (previewType === 'CLIENTS') generateClientsPDF(true);
                                        else if (previewType === 'CLIENT_ORDERS') generateClientOrdersPDF(true);
                                        else if (previewType === 'DRIVERS') generateDriversPDF(true);
                                    }}
                                    className="bg-slate-900 text-white px-8 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-black transition-all flex items-center gap-2"
                                >
                                    Download PDF
                                </button>
                                <button
                                    onClick={() => {
                                        URL.revokeObjectURL(pdfPreviewUrl);
                                        setPdfPreviewUrl(null);
                                        setPreviewType(null);
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
