
import React, { useState, useEffect, useMemo } from 'react';
import { db, BusinessSettings } from '../services/db';
import { Order, OrderStatus, SaleType, Client, Product, DeliveryDriver, InventoryMovement, OrderRejection, CashSession, User } from '../types';
import { Icons } from '../constants';
import CustomAlert from '../components/CustomAlert';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { getLocalIsoDate } from '../services/dateUtils';

interface ReportsProps {
    currentUser: User | null;
}

const Reports: React.FC<ReportsProps> = ({ currentUser }) => {
    const [orders, setOrders] = useState<Order[]>([]);
    const [clients, setClients] = useState<Client[]>([]);
    const [drivers, setDrivers] = useState<DeliveryDriver[]>([]);
    const [businessSettings, setBusinessSettings] = useState<BusinessSettings | null>(null);
    const [pdfPreviewUrl, setPdfPreviewUrl] = useState<string | null>(null);
    const [rejections, setRejections] = useState<OrderRejection[]>([]);

    // Sales Filters
    const [salesStartDate, setSalesStartDate] = useState(getLocalIsoDate());
    const [salesEndDate, setSalesEndDate] = useState(getLocalIsoDate());
    const [salesPayment, setSalesPayment] = useState<string>('TODOS');
    const [salesModality, setSalesModality] = useState<string>('TODOS');
    const [salesOrigin, setSalesOrigin] = useState<'TODOS' | 'FISICO' | 'DIGITAL'>('TODOS');

    // Tab State
    const [activeTab, setActiveTab] = useState<'SALES' | 'CLIENTS' | 'DRIVERS' | 'INVENTORY' | 'CASH'>('SALES');

    // Cash Filters
    const [cashStartDate, setCashStartDate] = useState(getLocalIsoDate());
    const [cashEndDate, setCashEndDate] = useState(getLocalIsoDate());
    const [cashSessions, setCashSessions] = useState<CashSession[]>([]);

    // Inventory Filters
    const [inventoryStartDate, setInventoryStartDate] = useState(getLocalIsoDate());
    const [inventoryEndDate, setInventoryEndDate] = useState(getLocalIsoDate());

    // Customer Filters
    const [clientSearch, setClientSearch] = useState('');
    const [selectedClient, setSelectedClient] = useState<Client | null>(null);
    const [showClientDropdown, setShowClientDropdown] = useState(false);
    const [previewType, setPreviewType] = useState<'SALES' | 'CLIENTS' | 'CLIENT_ORDERS' | 'DRIVERS' | 'INVENTORY' | 'CASH' | null>(null);

    // Editing Cash Reports
    const [isEditReportModalOpen, setIsEditReportModalOpen] = useState(false);
    const [editingSession, setEditingSession] = useState<CashSession | null>(null);
    const [adminPassword, setAdminPassword] = useState('');
    const [alert, setAlert] = useState<{ title: string; message: string; type: 'SUCCESS' | 'DANGER' | 'WARNING' } | null>(null);

    // Driver Filters
    const [driverStartDate, setDriverStartDate] = useState(getLocalIsoDate());
    const [driverEndDate, setDriverEndDate] = useState(getLocalIsoDate());
    const [selectedDriverId, setSelectedDriverId] = useState<string>('TODOS');

    const uniquePaymentMethods = useMemo(() => {
        const methods = new Set<string>(['TODOS', 'DINHEIRO', 'CARTÃO', 'PIX', 'CRÉDITO', 'DÉBITO']);
        orders.forEach(o => {
            if (o.paymentMethod) {
                methods.add(o.paymentMethod.toUpperCase());
            }
        });
        methods.delete('TODOS');
        const sortedMethods = Array.from(methods).sort();
        return ['TODOS', ...sortedMethods];
    }, [orders]);

    useEffect(() => {
        fetchData();
    }, []);

    const fetchCashSessions = async () => {
        const cs = await db.getCashSessions(cashStartDate, cashEndDate);
        setCashSessions(cs);
    };

    useEffect(() => {
        if (activeTab === 'CASH') {
            fetchCashSessions();
        }
    }, [cashStartDate, cashEndDate, activeTab]);

    const showAlert = (title: string, message: string, type: 'SUCCESS' | 'DANGER' | 'WARNING') => {
        setAlert({ title, message, type });
        setTimeout(() => setAlert(null), 3000);
    };

    const handleEditReport = (session: CashSession) => {
        setEditingSession({ ...session });
        setIsEditReportModalOpen(true);
    };

    const handleSaveEdit = async () => {
        if (!editingSession || !currentUser) return;

        if (adminPassword !== currentUser.password) {
            return showAlert("Senha Incorreta", "Informe a senha do Admin Master para autorizar a alteração.", "DANGER");
        }

        try {
            await db.updateCashSession({
                id: editingSession.id,
                cash: editingSession.reportedCash || 0,
                pix: editingSession.reportedPix || 0,
                credit: editingSession.reportedCredit || 0,
                debit: editingSession.reportedDebit || 0,
                observations: editingSession.observations || '',
                user: currentUser
            });
            showAlert("Sucesso", "Relatório de caixa atualizado com sucesso!", "SUCCESS");
            setIsEditReportModalOpen(false);
            setEditingSession(null);
            setAdminPassword('');
            fetchCashSessions();
        } catch (error) {
            showAlert("Erro", "Não foi possível atualizar o relatório.", "DANGER");
        }
    };

    const fetchData = async () => {
        const [o, c, s, d, r] = await Promise.all([
            db.getOrders(),
            db.getClients(),
            db.getSettings(),
            db.getDrivers(),
            db.getRejections()
        ]);
        setOrders(o);
        setClients(c);
        setBusinessSettings(s);
        setDrivers(d);
        setRejections(r);

        // Fetch cash sessions for current period
        fetchCashSessions();
    };

    const handleReopen = async (sessionId: string) => {
        if (!currentUser || currentUser.role !== 'ADMIN') {
            alert("Apenas administradores podem reabrir caixa.");
            return;
        }
        if (!window.confirm("Deseja realmente reabrir este caixa? O fechamento atual será perdido.")) return;

        try {
            await db.reopenCashSession(sessionId, currentUser);
            alert("Caixa reaberto com sucesso!");
            fetchData();
        } catch (error) {
            alert("Erro ao reabrir caixa.");
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

    const generateSalesPDF = async (downloadOnly = false) => {
        if (!businessSettings) return;

        try {
            const pdfDoc = await PDFDocument.create();
            const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
            const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

            const filteredOrders = orders.filter(o => {
                const orderDateObj = new Date(o.createdAt);
                const orderDate = getLocalIsoDate(orderDateObj);
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

            const filteredCashSessions = await db.getCashSessions(salesStartDate, salesEndDate);
            const totalInitialCash = filteredCashSessions.reduce((sum, cs) => sum + cs.initialBalance, 0);
            const totalReportedCash = filteredCashSessions.reduce((sum, cs) => sum + (cs.reportedCash || 0), 0);
            const totalDiff = filteredCashSessions.reduce((sum, cs) => sum + (cs.difference || 0), 0);

            let totalDinheiro = 0;
            let totalCredito = 0;
            let totalDebito = 0;
            let totalPix = 0;
            let totalOutros = 0;

            filteredOrders.forEach(o => {
                const method = (o.paymentMethod || '').toUpperCase();
                const total = o.total || 0;
                const split1 = o.splitAmount1 || 0;
                const split2 = total - split1;

                if (method.includes('+')) {
                    const parts = method.split('+').map(p => p.trim());
                    // Part 1
                    if (parts[0].includes('DINHEIRO')) totalDinheiro += split1;
                    else if (parts[0].includes('CRÉDITO')) totalCredito += split1;
                    else if (parts[0].includes('DÉBITO')) totalDebito += split1;
                    else if (parts[0].includes('PIX')) totalPix += split1;
                    else totalOutros += split1;
                    // Part 2
                    if (parts[1].includes('DINHEIRO')) totalDinheiro += split2;
                    else if (parts[1].includes('CRÉDITO')) totalCredito += split2;
                    else if (parts[1].includes('DÉBITO')) totalDebito += split2;
                    else if (parts[1].includes('PIX')) totalPix += split2;
                    else totalOutros += split2;
                } else {
                    if (method.includes('DINHEIRO')) totalDinheiro += total;
                    else if (method.includes('CRÉDITO')) totalCredito += total;
                    else if (method.includes('DÉBITO')) totalDebito += total;
                    else if (method.includes('PIX')) totalPix += total;
                    else totalOutros += total;
                }
            });

            // Adjust starting Y position for the extra lines
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

            y -= 30;
            // KPIs
            page.drawText('RESUMO FINANCEIRO (VENDAS)', { x: 50, y, size: 12, font: fontBold });
            y -= 20;
            page.drawText(`Faturamento Total: R$ ${totalRevenue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, { x: 50, y, size: 10, font: fontBold, color: rgb(0, 0.4, 0) });
            y -= 15;
            page.drawText(`Volume de Vendas: ${orderCount}`, { x: 50, y, size: 10, font });
            y -= 15;
            page.drawText(`Ticket Médio: R$ ${avgTicket.toFixed(2)}`, { x: 50, y, size: 10, font });

            y -= 30;
            page.drawText('VENDAS POR FORMA DE PAGAMENTO', { x: 50, y, size: 12, font: fontBold });
            y -= 20;
            page.drawText(`Dinheiro: R$ ${totalDinheiro.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, { x: 50, y, size: 10, font });
            y -= 15;
            page.drawText(`Cartão de Crédito: R$ ${totalCredito.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, { x: 50, y, size: 10, font });
            y -= 15;
            page.drawText(`Cartão de Débito: R$ ${totalDebito.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, { x: 50, y, size: 10, font });
            y -= 15;
            page.drawText(`PIX: R$ ${totalPix.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, { x: 50, y, size: 10, font });
            if (totalOutros > 0) {
                y -= 15;
                page.drawText(`Outros: R$ ${totalOutros.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, { x: 50, y, size: 10, font });
            }

            y -= 30;
            page.drawText('RESUMO DE CAIXA', { x: 50, y, size: 12, font: fontBold });
            y -= 20;
            page.drawText(`Dinheiro das Vendas (Período): R$ ${totalDinheiro.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, { x: 50, y, size: 10, font });
            y -= 15;
            page.drawText(`Fundo de Troco (Aberturas de Caixa): R$ ${totalInitialCash.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, { x: 50, y, size: 10, font });
            y -= 15;
            page.drawText(`Total de Dinheiro Físico Esperado (Vendas + Troco): R$ ${(totalDinheiro + totalInitialCash).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, { x: 50, y, size: 10, font: fontBold });
            y -= 15;
            page.drawText(`Total de Dinheiro Físico Declarado (Fechamentos de Caixa): R$ ${totalReportedCash.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, { x: 50, y, size: 10, font });
            y -= 15;
            page.drawText(`Lucro Líquido Declarado em Dinheiro (Sobra após retirar o Troco): R$ ${(totalReportedCash - totalInitialCash).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, { x: 50, y, size: 10, font: fontBold, color: rgb(0, 0.4, 0) });
            y -= 15;
            page.drawText(`Falta/Sobra de Caixa (Diferenças): R$ ${totalDiff.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, { x: 50, y, size: 10, font });

            y -= 40;
            // Table Header
            page.drawRectangle({ x: 50, y: y - 5, width: width - 100, height: 20, color: rgb(0.95, 0.95, 0.95) });
            page.drawText('DATA', { x: 55, y, size: 7, font: fontBold });
            page.drawText('HORA', { x: 100, y, size: 7, font: fontBold });
            page.drawText('CLIENTE / MESA', { x: 140, y, size: 7, font: fontBold });
            page.drawText('FORMA PGTO', { x: 360, y, size: 7, font: fontBold });
            page.drawText('MOD.', { x: 465, y, size: 7, font: fontBold });
            page.drawText('TOTAL', { x: 520, y, size: 7, font: fontBold });
            y -= 25;

            for (const o of filteredOrders) {
                if (y < 70) {
                    page = pdfDoc.addPage([595.28, 841.89]);
                    y = page.getHeight() - 50;
                }
                const dateObj = new Date(o.createdAt);
                const dateStr = dateObj.toLocaleDateString('pt-BR');
                const timeStr = dateObj.toLocaleTimeString('pt-BR').substring(0, 5);

                page.drawText(dateStr, { x: 55, y, size: 7, font });
                page.drawText(timeStr, { x: 100, y, size: 7, font });
                page.drawText(o.clientName.substring(0, 38), { x: 140, y, size: 7, font });
                page.drawText((o.paymentMethod || 'DINHEIRO').substring(0, 20), { x: 360, y, size: 7, font });
                page.drawText(getFriendlySaleType(o.type), { x: 465, y, size: 7, font });
                page.drawText(`R$ ${o.total.toFixed(2)}`, { x: 520, y, size: 7, font: fontBold });
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
                const orderDateObj = new Date(o.createdAt);
                const orderDate = getLocalIsoDate(orderDateObj);
                const inDate = orderDate >= driverStartDate && orderDate <= driverEndDate;
                const inDriver = selectedDriverId === 'TODOS' || o.driverId === selectedDriverId;
                return inDate && inDriver && o.type === SaleType.OWN_DELIVERY && o.status === OrderStatus.DELIVERED;
            });

            const totalDeliveries = filteredOrders.length;
            const totalRevenue = filteredOrders.reduce((sum, o) => sum + o.total, 0);
            const totalDeliveryFees = filteredOrders.reduce((sum, o) => sum + (o.deliveryFee || 0), 0);
            const totalProductsValue = totalRevenue - totalDeliveryFees;

            const filteredRejections = rejections.filter(r => {
                const rejDateObj = new Date(r.timestamp);
                const rejDate = getLocalIsoDate(rejDateObj);
                const inDate = rejDate >= driverStartDate && rejDate <= driverEndDate;
                const inDriver = selectedDriverId === 'TODOS' || r.driverId === selectedDriverId;
                return inDate && inDriver;
            });

            const autoRejectionsCount = filteredRejections.filter(r => r.type === 'AUTO').length;
            const manualRejectionsCount = filteredRejections.filter(r => r.type === 'MANUAL').length;

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
            page.drawText(`Valor em Produtos: R$ ${totalProductsValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, { x: 50, y, size: 10, font });
            y -= 15;
            page.drawText(`Total de Taxas de Entrega: R$ ${totalDeliveryFees.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, { x: 50, y, size: 10, font });
            y -= 15;
            page.drawText(`Total de Entregas Finalizadas: ${totalDeliveries}`, { x: 50, y, size: 10, font });
            y -= 15;
            page.drawText(`Rejeições: ${filteredRejections.length} (Auto: ${autoRejectionsCount}, Manual: ${manualRejectionsCount})`, { x: 50, y, size: 10, font: fontBold, color: rgb(0.8, 0, 0) });

            y -= 40;
            // Table Header
            page.drawRectangle({ x: 50, y: y - 5, width: width - 100, height: 20, color: rgb(0.95, 0.95, 0.95) });
            page.drawText('DATA | HORA', { x: 55, y, size: 7, font: fontBold });
            page.drawText('CLIENTE', { x: 160, y, size: 7, font: fontBold });
            page.drawText('ENTREGADOR', { x: 280, y, size: 7, font: fontBold });
            page.drawText('TAXA', { x: 380, y, size: 7, font: fontBold });
            page.drawText('PROD.', { x: 440, y, size: 7, font: fontBold });
            page.drawText('TOTAL', { x: 500, y, size: 7, font: fontBold });
            y -= 25;

            for (const o of filteredOrders) {
                if (y < 70) {
                    page = pdfDoc.addPage([595.28, 841.89]);
                    y = page.getHeight() - 50;
                }
                const dateObj = new Date(o.createdAt);
                const dateStr = `${dateObj.toLocaleDateString('pt-BR')} ${dateObj.toLocaleTimeString('pt-BR').substring(0, 5)}`;
                const dName = drivers.find(d => d.id === o.driverId)?.name || 'N/A';

                page.drawText(dateStr, { x: 55, y, size: 7, font });
                page.drawText(o.clientName.substring(0, 25), { x: 160, y, size: 7, font });
                page.drawText(dName.substring(0, 20), { x: 280, y, size: 7, font });
                page.drawText(`R$ ${(o.deliveryFee || 0).toFixed(2)}`, { x: 380, y, size: 7, font });
                page.drawText(`R$ ${(o.total - (o.deliveryFee || 0)).toFixed(2)}`, { x: 440, y, size: 7, font });
                page.drawText(`R$ ${o.total.toFixed(2)}`, { x: 500, y, size: 7, font: fontBold });
                y -= 20;
            }

            if (filteredRejections.length > 0) {
                if (y < 120) {
                    page = pdfDoc.addPage([595.28, 841.89]);
                    y = page.getHeight() - 50;
                }
                y -= 20;
                page.drawText('DETALHAMENTO de REJEIÇÕES', { x: 50, y, size: 10, font: fontBold, color: rgb(0.8, 0, 0) });
                y -= 15;
                page.drawRectangle({ x: 50, y: y - 5, width: width - 100, height: 15, color: rgb(0.98, 0.9, 0.9) });
                page.drawText('DATA | HORA', { x: 55, y, size: 7, font: fontBold });
                page.drawText('ENTREGADOR', { x: 180, y, size: 7, font: fontBold });
                page.drawText('TIPO', { x: 350, y, size: 7, font: fontBold });
                page.drawText('MOTIVO', { x: 420, y, size: 7, font: fontBold });
                y -= 15;

                for (const r of filteredRejections) {
                    if (y < 40) {
                        page = pdfDoc.addPage([595.28, 841.89]);
                        y = page.getHeight() - 50;
                    }
                    const dateObj = new Date(r.timestamp);
                    const dateStr = `${dateObj.toLocaleDateString('pt-BR')} ${dateObj.toLocaleTimeString('pt-BR').substring(0, 5)}`;
                    const dName = drivers.find(d => d.id === r.driverId)?.name || 'N/A';

                    page.drawText(dateStr, { x: 55, y, size: 7, font });
                    page.drawText(dName.substring(0, 30), { x: 180, y, size: 7, font });
                    page.drawText(r.type, { x: 350, y, size: 7, font });
                    page.drawText((r.reason || '').substring(0, 40), { x: 420, y, size: 7, font });
                    y -= 12;
                }
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

    const generateCashPDF = async (downloadOnly = false) => {
        if (!businessSettings) return;

        try {
            const pdfDoc = await PDFDocument.create();
            const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
            const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

            const filtered = await db.getCashSessions(cashStartDate, cashEndDate);

            if (filtered.length === 0) {
                alert('Nenhuma movimentação de caixa encontrada para este período.');
                return;
            }

            let page = pdfDoc.addPage([595.28, 841.89]);
            const { width, height } = page.getSize();
            let y = height - 50;

            // Header
            page.drawText('RELATÓRIO DE MOVIMENTAÇÃO DE CAIXA', { x: 50, y, size: 18, font: fontBold });
            y -= 25;
            page.drawText(businessSettings.name, { x: 50, y, size: 12, font: fontBold });
            y -= 15;
            page.drawText(`Período: ${new Date(cashStartDate + 'T00:00:00').toLocaleDateString('pt-BR')} a ${new Date(cashEndDate + 'T00:00:00').toLocaleDateString('pt-BR')}`, { x: 50, y, size: 10, font });

            y -= 40;
            // Table Header
            page.drawRectangle({ x: 50, y: y - 5, width: width - 100, height: 20, color: rgb(0.95, 0.95, 0.95) });
            page.drawText('ABERTURA', { x: 55, y, size: 8, font: fontBold });
            page.drawText('FECHAMENTO', { x: 150, y, size: 8, font: fontBold });
            page.drawText('S. INICIAL', { x: 250, y, size: 8, font: fontBold });
            page.drawText('VENDAS', { x: 320, y, size: 8, font: fontBold });
            page.drawText('DIF.', { x: 400, y, size: 8, font: fontBold });
            page.drawText('STATUS', { x: 480, y, size: 8, font: fontBold });
            y -= 25;

            for (const s of filtered) {
                if (y < 70) {
                    page = pdfDoc.addPage([595.28, 841.89]);
                    y = page.getHeight() - 50;
                }

                const dtOpened = new Date(s.openedAt);
                const openedAt = `${dtOpened.toLocaleDateString('pt-BR')} ${dtOpened.toLocaleTimeString('pt-BR').substring(0, 5)}`;
                let closedAt = 'ABERTO';
                if (s.closedAt) {
                    const dtClosed = new Date(s.closedAt);
                    closedAt = `${dtClosed.toLocaleDateString('pt-BR')} ${dtClosed.toLocaleTimeString('pt-BR').substring(0, 5)}`;
                }

                page.drawText(openedAt, { x: 55, y, size: 7, font });
                page.drawText(closedAt, { x: 150, y, size: 7, font });
                page.drawText(`R$ ${s.initialBalance.toFixed(2)}`, { x: 250, y, size: 7, font });
                page.drawText(`R$ ${(s.totalSales || 0).toFixed(2)}`, { x: 320, y, size: 7, font });

                const diff = s.difference || 0;
                page.drawText(`R$ ${diff.toFixed(2)}`, {
                    x: 400, y, size: 7, font,
                    color: diff < 0 ? rgb(0.8, 0, 0) : (diff > 0 ? rgb(0, 0.5, 0) : rgb(0, 0, 0))
                });

                page.drawText(s.status === 'OPEN' ? 'ABERTO' : 'FECHADO', { x: 480, y, size: 7, font: fontBold });

                y -= 20;

                // Little detail block if closed
                if (s.status === 'CLOSED') {
                    y -= 5;
                    page.drawRectangle({ x: 60, y: y - 25, width: 480, height: 25, color: rgb(0.98, 0.98, 0.98) });
                    page.drawText(`Relatado: Dinheiro: R$ ${(s.reportedCash || 0).toFixed(2)} | Pix: R$ ${(s.reportedPix || 0).toFixed(2)} | Crédito: R$ ${(s.reportedCredit || 0).toFixed(2)} | Débito: R$ ${(s.reportedDebit || 0).toFixed(2)}`, { x: 70, y: y - 10, size: 6, font });
                    page.drawText(`Sistema: Dinheiro: R$ ${(s.systemCash || 0).toFixed(2)} | Pix: R$ ${(s.systemPix || 0).toFixed(2)} | Crédito: R$ ${(s.systemCredit || 0).toFixed(2)} | Débito: R$ ${(s.systemDebit || 0).toFixed(2)}`, { x: 70, y: y - 20, size: 6, font });
                    y -= 35;
                }
            }

            const pdfBytes = await pdfDoc.save();
            const blob = new Blob([pdfBytes as any], { type: 'application/pdf' });
            const url = URL.createObjectURL(blob);

            if (downloadOnly) {
                const link = document.createElement('a');
                link.href = url;
                link.download = `relatorio_caixa_${cashStartDate}_${cashEndDate}.pdf`;
                link.click();
                URL.revokeObjectURL(url);
            } else {
                setPreviewType('CASH');
                setPdfPreviewUrl(url);
            }
        } catch (error) {
            console.error('Erro ao gerar PDF de caixa:', error);
            alert('Erro ao gerar relatório.');
        }
    };

    const generateInventoryPDF = async (downloadOnly = false) => {
        if (!businessSettings) return;

        try {
            const pdfDoc = await PDFDocument.create();
            const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
            const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

            const movements = await db.getInventoryMovements(inventoryStartDate, inventoryEndDate);

            let page = pdfDoc.addPage([595.28, 841.89]);
            const { width, height } = page.getSize();
            let y = height - 50;

            // Header
            page.drawText('RELATÓRIO DE MOVIMENTAÇÃO DE ESTOQUE', { x: 50, y, size: 18, font: fontBold });
            y -= 25;
            page.drawText(businessSettings.name, { x: 50, y, size: 12, font: fontBold });
            y -= 15;
            page.drawText(`Período: ${new Date(inventoryStartDate + 'T00:00:00').toLocaleDateString('pt-BR')} a ${new Date(inventoryEndDate + 'T00:00:00').toLocaleDateString('pt-BR')}`, { x: 50, y, size: 10, font });

            y -= 40;
            // Table Header
            page.drawRectangle({ x: 50, y: y - 5, width: width - 100, height: 20, color: rgb(0.95, 0.95, 0.95) });
            page.drawText('DATA | HORA', { x: 55, y, size: 8, font: fontBold });
            page.drawText('INSUMO', { x: 150, y, size: 8, font: fontBold });
            page.drawText('TIPO', { x: 300, y, size: 8, font: fontBold });
            page.drawText('QTD', { x: 350, y, size: 8, font: fontBold });
            page.drawText('MOTIVO', { x: 400, y, size: 8, font: fontBold });
            y -= 25;

            for (const m of movements) {
                if (y < 70) {
                    page = pdfDoc.addPage([595.28, 841.89]);
                    y = page.getHeight() - 50;
                }
                const dateObj = new Date(m.timestamp);
                const dateStr = `${dateObj.toLocaleDateString('pt-BR')} ${dateObj.toLocaleTimeString('pt-BR').substring(0, 5)}`;

                page.drawText(dateStr, { x: 55, y, size: 7, font });
                page.drawText(m.inventoryItem?.name.substring(0, 30) || 'N/A', { x: 150, y, size: 7, font });

                const isInput = m.type === 'INPUT';
                page.drawText(isInput ? 'ENTRADA' : 'SAÍDA', {
                    x: 300, y, size: 7, font: fontBold,
                    color: isInput ? rgb(0.1, 0.5, 0.1) : rgb(0.7, 0.1, 0.1)
                });

                page.drawText(m.quantity.toString(), { x: 350, y, size: 7, font });
                page.drawText(m.reason.substring(0, 35), { x: 400, y, size: 7, font });
                y -= 15;
            }

            const pdfBytes = await pdfDoc.save();
            const blob = new Blob([pdfBytes as any], { type: 'application/pdf' });
            const url = URL.createObjectURL(blob);

            if (downloadOnly) {
                const link = document.createElement('a');
                link.href = url;
                link.download = `movimentacao_estoque_${inventoryStartDate}_${inventoryEndDate}.pdf`;
                link.click();
                URL.revokeObjectURL(url);
            } else {
                setPreviewType('INVENTORY');
                setPdfPreviewUrl(url);
            }
        } catch (error) {
            console.error('Erro ao gerar PDF de estoque:', error);
            alert('Erro ao gerar relatório de estoque.');
        }
    };

    return (
        <div className="flex flex-col h-full gap-8 animate-in fade-in duration-500 overflow-y-auto pb-8">
            {alert && (
                <div className="fixed top-8 right-8 z-[200]">
                    <CustomAlert
                        title={alert.title}
                        message={alert.message}
                        type={alert.type}
                        onClose={() => setAlert(null)}
                    />
                </div>
            )}

            {/* TABS HEADER */}
            <div className="flex gap-4 border-b border-slate-200 pb-2 px-2 shrink-0">
                <button onClick={() => setActiveTab('SALES')} className={`pb-4 text-[12px] font-black uppercase tracking-widest transition-all ${activeTab === 'SALES' ? 'text-blue-600 border-b-4 border-blue-600' : 'text-slate-400 hover:text-slate-600'}`}>Relatórios de Vendas</button>
                <button onClick={() => setActiveTab('CLIENTS')} className={`pb-4 text-[12px] font-black uppercase tracking-widest transition-all ${activeTab === 'CLIENTS' ? 'text-blue-600 border-b-4 border-blue-600' : 'text-slate-400 hover:text-slate-600'}`}>Lista de Clientes</button>
                <button onClick={() => setActiveTab('DRIVERS')} className={`pb-4 text-[12px] font-black uppercase tracking-widest transition-all ${activeTab === 'DRIVERS' ? 'text-blue-600 border-b-4 border-blue-600' : 'text-slate-400 hover:text-slate-600'}`}>Rotas de Entregadores</button>
                <button onClick={() => setActiveTab('INVENTORY')} className={`pb-4 text-[12px] font-black uppercase tracking-widest transition-all ${activeTab === 'INVENTORY' ? 'text-blue-600 border-b-4 border-blue-600' : 'text-slate-400 hover:text-slate-600'}`}>Movimentação de Insumos</button>
                <button onClick={() => setActiveTab('CASH')} className={`pb-4 text-[12px] font-black uppercase tracking-widest transition-all ${activeTab === 'CASH' ? 'text-blue-600 border-b-4 border-blue-600' : 'text-slate-400 hover:text-slate-600'}`}>Caixa</button>
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
                                        {uniquePaymentMethods.map(pm => (
                                            <option key={pm} value={pm}>{pm}</option>
                                        ))}
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

                {/* CARD RELATÓRIO DE MOVIMENTAÇÃO DE INSUMOS */}
                {activeTab === 'INVENTORY' && (
                    <div className="bg-white p-10 rounded-[3rem] shadow-sm border border-slate-100 flex flex-col h-max max-w-4xl animate-in fade-in zoom-in-95">
                        <div className="mb-8">
                            <h3 className="text-2xl font-black text-slate-800 uppercase tracking-tighter flex items-center gap-3">
                                <span className="p-3 bg-blue-50 text-blue-600 rounded-2xl"><Icons.Inventory /></span>
                                Movimentação de Insumos
                            </h3>
                            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-2 ml-14">Rastreabilidade completa de estoque (entradas e saídas)</p>
                        </div>

                        <div className="space-y-6">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Início</label>
                                    <input type="date" value={inventoryStartDate} onChange={e => setInventoryStartDate(e.target.value)} className="w-full p-4 bg-slate-50 border-none rounded-2xl font-bold text-sm" />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Fim</label>
                                    <input type="date" value={inventoryEndDate} onChange={e => setInventoryEndDate(e.target.value)} className="w-full p-4 bg-slate-50 border-none rounded-2xl font-bold text-sm" />
                                </div>
                            </div>
                        </div>

                        <button
                            onClick={() => generateInventoryPDF(false)}
                            className="mt-8 w-full py-6 bg-slate-900 hover:bg-black text-white rounded-[2rem] font-black uppercase text-xs tracking-widest shadow-xl transition-all flex items-center justify-center gap-3"
                        >
                            <Icons.Print />
                            Visualizar Relatório de Movimentação
                        </button>
                    </div>
                )}

                {/* CARD RELATÓRIO DE MOVIMENTAÇÃO DE CAIXA */}
                {activeTab === 'CASH' && (
                    <div className="bg-white p-10 rounded-[3rem] shadow-sm border border-slate-100 flex flex-col h-max max-w-4xl animate-in fade-in zoom-in-95">
                        <div className="mb-8">
                            <h3 className="text-2xl font-black text-slate-800 uppercase tracking-tighter flex items-center gap-3">
                                <span className="p-3 bg-blue-50 text-blue-600 rounded-2xl"><Icons.Dashboard /></span>
                                Movimentação de Caixa
                            </h3>
                            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-2 ml-14">Histórico de aberturas, fechamentos e conciliação</p>
                        </div>

                        <div className="space-y-6">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Início</label>
                                    <input type="date" value={cashStartDate} onChange={e => setCashStartDate(e.target.value)} className="w-full p-4 bg-slate-50 border-none rounded-2xl font-bold text-sm" />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Fim</label>
                                    <input type="date" value={cashEndDate} onChange={e => setCashEndDate(e.target.value)} className="w-full p-4 bg-slate-50 border-none rounded-2xl font-bold text-sm" />
                                </div>
                            </div>
                        </div>

                        {cashSessions.length > 0 && (
                            <div className="mt-8 overflow-x-auto border border-slate-100 rounded-3xl">
                                <table className="w-full text-left">
                                    <thead className="bg-slate-50 text-[10px] font-black text-slate-400 p-4 border-b border-slate-100">
                                        <tr>
                                            <th className="p-4 uppercase tracking-widest">Abertura</th>
                                            <th className="p-4 uppercase tracking-widest">Fechamento</th>
                                            <th className="p-4 uppercase tracking-widest">Vendas</th>
                                            <th className="p-4 uppercase tracking-widest">Status</th>
                                            <th className="p-4 uppercase tracking-widest text-right">Ações</th>
                                        </tr>
                                    </thead>
                                    <tbody className="text-[11px] font-bold text-slate-600 divide-y divide-slate-50">
                                        {cashSessions.map(s => (
                                            <tr key={s.id} className="hover:bg-slate-50/50 transition-colors">
                                                <td className="p-4">{new Date(s.openedAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</td>
                                                <td className="p-4">{s.closedAt ? new Date(s.closedAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : 'Em Aberto'}</td>
                                                <td className="p-4">R$ {s.totalSales?.toFixed(2) || (s.status === 'OPEN' ? 'Processando...' : '0,00')}</td>
                                                <td className="p-4">
                                                    <span className={`px-3 py-1 rounded-full text-[8px] uppercase tracking-widest font-black ${s.status === 'OPEN' ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-100 text-slate-400'}`}>
                                                        {s.status === 'OPEN' ? 'Aberto' : 'Fechado'}
                                                    </span>
                                                </td>
                                                <td className="p-4 text-right flex justify-end gap-2">
                                                    {s.status === 'CLOSED' && currentUser?.role === 'ADMIN' && (
                                                        <>
                                                            <button
                                                                onClick={() => handleEditReport(s)}
                                                                className="p-2 bg-amber-50 text-amber-600 rounded-lg hover:bg-amber-600 hover:text-white transition-all text-[8px] uppercase font-black flex items-center gap-1"
                                                            >
                                                                <Icons.Edit />
                                                                Editar
                                                            </button>
                                                            <button
                                                                onClick={() => handleReopen(s.id)}
                                                                className="p-2 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-600 hover:text-white transition-all text-[8px] uppercase font-black"
                                                            >
                                                                Reabrir
                                                            </button>
                                                        </>
                                                    )}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}

                        <button
                            onClick={() => generateCashPDF(false)}
                            className="mt-8 w-full py-6 bg-slate-900 hover:bg-black text-white rounded-[2rem] font-black uppercase text-xs tracking-widest shadow-xl transition-all flex items-center justify-center gap-3"
                        >
                            <Icons.Print />
                            Visualizar Histórico de Caixa
                        </button>
                        {/* MODAL DE EDIÇÃO DO RELATÓRIO DE CAIXA */}
                        {isEditReportModalOpen && editingSession && (
                            <div className="fixed inset-0 z-[130] flex items-center justify-center p-12 bg-slate-900/90 backdrop-blur-xl animate-in fade-in duration-300">
                                <div className="bg-white rounded-[4rem] shadow-2xl w-full max-w-2xl flex flex-col overflow-hidden">
                                    <div className="p-10 border-b border-slate-100 bg-slate-50">
                                        <h3 className="text-2xl font-black text-slate-900 uppercase tracking-tighter flex items-center gap-3">
                                            <span className="p-3 bg-amber-50 text-amber-600 rounded-2xl"><Icons.Edit /></span>
                                            Corrigir Relatório de Caixa
                                        </h3>
                                        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-2 ml-14">Apenas Admin Master pode realizar alterações</p>
                                    </div>

                                    <div className="p-10 space-y-8">
                                        <div className="grid grid-cols-2 gap-6">
                                            <div className="space-y-2">
                                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Dinheiro (R$)</label>
                                                <input
                                                    type="text"
                                                    value={editingSession.reportedCash || 0}
                                                    onChange={e => setEditingSession({ ...editingSession, reportedCash: parseFloat(e.target.value.replace(',', '.')) || 0 })}
                                                    className="w-full p-5 bg-slate-50 border-none rounded-[1.5rem] font-bold text-lg"
                                                />
                                            </div>
                                            <div className="space-y-2">
                                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Pix (R$)</label>
                                                <input
                                                    type="text"
                                                    value={editingSession.reportedPix || 0}
                                                    onChange={e => setEditingSession({ ...editingSession, reportedPix: parseFloat(e.target.value.replace(',', '.')) || 0 })}
                                                    className="w-full p-5 bg-slate-50 border-none rounded-[1.5rem] font-bold text-lg"
                                                />
                                            </div>
                                            <div className="space-y-2">
                                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Crédito (R$)</label>
                                                <input
                                                    type="text"
                                                    value={editingSession.reportedCredit || 0}
                                                    onChange={e => setEditingSession({ ...editingSession, reportedCredit: parseFloat(e.target.value.replace(',', '.')) || 0 })}
                                                    className="w-full p-5 bg-slate-50 border-none rounded-[1.5rem] font-bold text-lg"
                                                />
                                            </div>
                                            <div className="space-y-2">
                                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Débito (R$)</label>
                                                <input
                                                    type="text"
                                                    value={editingSession.reportedDebit || 0}
                                                    onChange={e => setEditingSession({ ...editingSession, reportedDebit: parseFloat(e.target.value.replace(',', '.')) || 0 })}
                                                    className="w-full p-5 bg-slate-50 border-none rounded-[1.5rem] font-bold text-lg"
                                                />
                                            </div>
                                        </div>

                                        <div className="space-y-2">
                                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Observações do Admin</label>
                                            <textarea
                                                value={editingSession.observations || ''}
                                                onChange={e => setEditingSession({ ...editingSession, observations: e.target.value })}
                                                placeholder="Motivo da correção..."
                                                className="w-full p-5 bg-slate-50 border-none rounded-[1.5rem] font-bold text-sm min-h-[100px]"
                                            />
                                        </div>

                                        <div className="space-y-2 pt-4 border-t border-slate-100">
                                            <label className="text-[10px] font-black text-red-400 uppercase tracking-widest ml-1 underline">Senha do Admin Master</label>
                                            <input
                                                type="password"
                                                placeholder="Digite a senha para autorizar"
                                                value={adminPassword}
                                                onChange={e => setAdminPassword(e.target.value)}
                                                className="w-full p-5 bg-red-50 text-red-900 border-none rounded-[1.5rem] font-black placeholder:text-red-200"
                                            />
                                        </div>
                                    </div>

                                    <div className="p-10 border-t border-slate-100 bg-slate-50 flex gap-4">
                                        <button
                                            onClick={() => {
                                                setIsEditReportModalOpen(false);
                                                setEditingSession(null);
                                                setAdminPassword('');
                                            }}
                                            className="flex-1 py-5 bg-white text-slate-400 rounded-3xl font-black uppercase text-xs tracking-widest border border-slate-200 hover:bg-slate-100 transition-all"
                                        >
                                            Cancelar
                                        </button>
                                        <button
                                            onClick={handleSaveEdit}
                                            className="flex-[2] py-5 bg-slate-900 text-white rounded-3xl font-black uppercase text-xs tracking-widest hover:bg-black transition-all shadow-xl shadow-slate-900/20"
                                        >
                                            Salvar Alterações
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}
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
                                        else if (previewType === 'INVENTORY') generateInventoryPDF(true);
                                        else if (previewType === 'CASH') generateCashPDF(true);
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
