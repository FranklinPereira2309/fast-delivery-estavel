
import React, { useState, useEffect, useMemo } from 'react';
import { Product, OrderItem, SaleType, Order, OrderStatus, OrderStatusLabels, User, Client, DeliveryDriver, TableSession, CashSession, Receivable } from '../types';
import { db, BusinessSettings } from '../services/db';
import { socket, feedbackUnreadManager } from '../services/socket';
import { Icons, PLACEHOLDER_FOOD_IMAGE, formatImageUrl } from '../constants';
import CustomAlert from '../components/CustomAlert';
import { validateEmail, validateCPF, validateCNPJ, maskPhone, maskDocument, toTitleCase } from '../services/validationUtils';
import { formatAddress } from '../services/formatUtils';
import { QRCodeCanvas } from 'qrcode.react';

const API_URL = (import.meta as any).env.VITE_API_URL || 'http://localhost:3000/api';

interface POSProps {
  currentUser: User;
}

const POS: React.FC<POSProps> = ({ currentUser }) => {
  const [products, setProducts] = useState<Product[]>([]);
  const [cart, setCart] = useState<OrderItem[]>([]);
  const [saleType, setSaleType] = useState<SaleType>(SaleType.COUNTER);
  const [activeCategory, setActiveCategory] = useState<string>('Todos');
  const [paymentMethod, setPaymentMethod] = useState<string>('DINHEIRO');
  const [orders, setOrders] = useState<Order[]>([]);
  const [businessSettings, setBusinessSettings] = useState<BusinessSettings | null>(null);

  const [clients, setClients] = useState<Client[]>([]);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [clientSearch, setClientSearch] = useState('');
  const [showClientList, setShowClientList] = useState(false);

  const [isAvulso, setIsAvulso] = useState(false);
  const [avulsoData, setAvulsoData] = useState({
    phone: '',
    name: '',
    email: '',
    document: '',
    cep: '',
    street: '',
    addressNumber: '',
    neighborhood: '',
    city: '',
    state: '',
    complement: ''
  });
  const [isLoadingCep, setIsLoadingCep] = useState(false);

  const [tableNumberInput, setTableNumberInput] = useState('');
  const [tableNumber, setTableNumber] = useState<number | ''>('');
  const [printingOrder, setPrintingOrder] = useState<Order | null>(null);
  const [editingOrderId, setEditingOrderId] = useState<string | null>(null);
  const [selectedProductForCart, setSelectedProductForCart] = useState<Product | null>(null);
  const [cartObservation, setCartObservation] = useState('');

  const [pendingTables, setPendingTables] = useState<TableSession[]>([]);
  const [pendingCounterOrders, setPendingCounterOrders] = useState<Order[]>([]);
  const [pendingReceivables, setPendingReceivables] = useState<(Receivable & { client: Client, order: Order })[]>([]);
  const [isReceivingFiado, setIsReceivingFiado] = useState<string | null>(null);
  const [isLoadingOrder, setIsLoadingOrder] = useState(false);
  const [manualDeliveryFee, setManualDeliveryFee] = useState<number | null>(null);
  const [currentOrderStatus, setCurrentOrderStatus] = useState<OrderStatus | null>(null);

  const [isClientModalOpen, setIsClientModalOpen] = useState(false);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [payments, setPayments] = useState<Array<{ method: string, amount: number, receivedAmount?: number }>>([]);
  const [currentPaymentAmount, setCurrentPaymentAmount] = useState<string>('');

  const [feedbacks, setFeedbacks] = useState<any[]>([]);
  const [showFeedbacks, setShowFeedbacks] = useState(false);
  const [hasNewFeedback, setHasNewFeedback] = useState(false);
  const [paymentData, setPaymentData] = useState({
    receivedAmount: '', // Used for change calculation in DINHEIRO (current selection)
  });
  const [emitNfce, setEmitNfce] = useState<boolean>(false);
  const [isNfceFeedbackOpen, setIsNfceFeedbackOpen] = useState(false);
  const [isNfceVisual, setIsNfceVisual] = useState(false);
  const [isServiceFeeAccepted, setIsServiceFeeAccepted] = useState(true);

  const [alertConfig, setAlertConfig] = useState<{ isOpen: boolean, title: string, message: string, onConfirm: () => void, type: 'INFO' | 'DANGER' | 'SUCCESS' }>({
    isOpen: false, title: '', message: '', onConfirm: () => { }, type: 'INFO'
  });

  const [errors, setErrors] = useState<Record<string, boolean>>({});

  const [activeCashSession, setActiveCashSession] = useState<CashSession | null>(null);
  const [isOpeningModalOpen, setIsOpeningModalOpen] = useState(false);
  const [isClosingModalOpen, setIsClosingModalOpen] = useState(false);
  const [isReviewModalOpen, setIsReviewModalOpen] = useState(false);
  const [isAdjustModalOpen, setIsAdjustModalOpen] = useState(false);
  const [reviewSession, setReviewSession] = useState<CashSession | null>(null);
  const [closingMode, setClosingMode] = useState<'MANUAL' | 'SYSTEM'>('MANUAL');
  const [adminPassword, setAdminPassword] = useState('');
  const [userPassword, setUserPassword] = useState('');
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [authModalAction, setAuthModalAction] = useState<'OPEN_CASH' | 'CLOSE_CASH' | null>(null);
  const [initialBalanceInput, setInitialBalanceInput] = useState('0.00');
  const [closingReport, setClosingReport] = useState({
    cash: '',
    pix: '',
    credit: '',
    debit: '',
    others: '',
    observations: ''
  });
  const [systemPreview, setSystemPreview] = useState<{
    cash: number;
    pix: number;
    credit: number;
    debit: number;
    others: number;
    fiado: number;
    orphanSales: number;
  } | null>(null);

  const showAlert = (title: string, message: string, type: 'INFO' | 'DANGER' | 'SUCCESS' = 'INFO') => {
    setAlertConfig({ isOpen: true, title, message, onConfirm: () => setAlertConfig(prev => ({ ...prev, isOpen: false })), type });
  };

  useEffect(() => {
    refreshAllData();
    const interval = setInterval(() => refreshAllData(), 3000);

    const handleRealtimeUpdate = () => {
      console.log('Realtime update received in POS, refreshing data...');
      refreshAllData();
    };

    socket.on('newOrder', handleRealtimeUpdate);
    socket.on('tableStatusChanged', handleRealtimeUpdate);
    socket.on('orderStatusChanged', handleRealtimeUpdate);

    const unsubscribeFeedbacks = feedbackUnreadManager.subscribe((hasUnread) => {
      setHasNewFeedback(hasUnread);
    });

    // Initialize state
    setHasNewFeedback(feedbackUnreadManager.getHasUnread());

    return () => {
      clearInterval(interval);
      socket.off('newOrder', handleRealtimeUpdate);
      socket.off('tableStatusChanged', handleRealtimeUpdate);
      socket.off('orderStatusChanged', handleRealtimeUpdate);
      unsubscribeFeedbacks();
    };
  }, []);



  const refreshAllData = async () => {
    const [p, o, s, c, ts, cs, recs] = await Promise.all([
      db.getProducts(),
      db.getOrders(),
      db.getSettings(),
      db.getClients(),
      db.getTableSessions(),
      db.getActiveCashSession(),
      db.getReceivables()
    ]);
    setProducts(p);
    setOrders(o);
    setBusinessSettings(s);
    setClients(c);
    setPendingTables(ts.filter(t => t.status === 'billing'));
    setPendingCounterOrders(o.filter(order => order.type === SaleType.COUNTER && order.status === OrderStatus.READY));
    setPendingReceivables(recs?.filter((r: any) => r.status === 'PROCESSING') || []);
    setActiveCashSession(cs);

    try {
      const fb = await db.getFeedbacks();
      setFeedbacks(fb);
    } catch (e) {
      console.error('Error fetching feedbacks in POS', e);
    }
  };

  const confirmAddToCart = () => {
    if (!selectedProductForCart) return;
    const product = selectedProductForCart;

    if (editingOrderId) {
      setSelectedProductForCart(null);
      return showAlert("Ação Bloqueada", "Não é possível adicionar itens a um pedido pronto que está sendo recebido.", "DANGER");
    }

    if (isReceivingFiado) {
      setSelectedProductForCart(null);
      return showAlert("Ação Bloqueada", "Não é permitido adicionar ou excluir itens em um título de recebimento (Fiado). Utilize o módulo Recebimentos para ajustes.", "DANGER");
    }

    if (saleType === SaleType.TABLE && tableNumberInput) {
      const isBilling = pendingTables.some(t => t.tableNumber === parseInt(tableNumberInput));
      if (isBilling) {
        setSelectedProductForCart(null);
        return showAlert("Modo Leitura", "Esta mesa está em modo somente leitura (Faturando). Para adicionar produtos, você deve Reabrir a mesa.", "DANGER");
      }
    }

    setCart(prev => [...prev, {
      uid: `item-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      productId: product.id,
      quantity: 1,
      price: product.price,
      isReady: false,
      observations: cartObservation || ''
    }]);

    setSelectedProductForCart(null);
    setCartObservation('');
  };

  const loadTableSession = async (sess: TableSession) => {
    setIsLoadingOrder(true);
    setCart(sess.items);
    setSaleType(SaleType.TABLE);
    setTableNumber(sess.tableNumber);
    setTableNumberInput(sess.tableNumber.toString());
    setEditingOrderId(null);

    const tableOrder = orders.find(o => o.id === `TABLE-${sess.tableNumber}`);
    setCurrentOrderStatus(tableOrder?.status || OrderStatus.PENDING);

    if (sess.clientId) {
      const cl = clients.find(c => c.id === sess.clientId);
      if (cl) setSelectedClient(cl);
    } else if (sess.clientName) {
      const cl = clients.find(c => c.name === sess.clientName);
      if (cl) setSelectedClient(cl);
    }

    setTimeout(() => setIsLoadingOrder(false), 500);
  };

  const loadCounterOrder = async (order: Order) => {
    setIsLoadingOrder(true);
    setCart(order.items);
    setSaleType(SaleType.COUNTER);
    setEditingOrderId(order.id);
    setCurrentOrderStatus(order.status);
    setTableNumber('');
    setTableNumberInput('');

    if (order.clientId && order.clientId !== 'ANONYMOUS' && order.clientId !== 'AVULSO') {
      const cl = clients.find(c => c.id === order.clientId);
      if (cl) {
        setSelectedClient(cl);
        setClientSearch(cl.name);
        setIsAvulso(false);
      }
    } else if (order.clientId === 'ANONYMOUS' && order.clientName !== 'Consumidor Padrão') {
      setIsAvulso(true);
      setAvulsoData({
        name: order.clientName,
        phone: order.clientPhone || '',
        address: order.clientAddress || '',
        cep: '',
        email: order.clientEmail || '',
        document: order.clientDocument || ''
      });
    }

    if (order.deliveryFee !== undefined) {
      setManualDeliveryFee(order.deliveryFee);
    }

    setTimeout(() => setIsLoadingOrder(false), 500);
  };

  const handleReturnReceivable = async (id: string) => {
    try {
      await db.updateReceivable(id, { status: 'PENDING' });
      if (isReceivingFiado === id) {
        clearState();
      }
      await refreshAllData();
      showAlert("Sucesso", "Débito devolvido para a lista de Recebimentos.", "SUCCESS");
    } catch (err: any) {
      showAlert("Erro", err.message || "Erro ao devolver débito.", "DANGER");
    }
  };

  const loadReceivable = async (receivable: Receivable & { client: Client, order: Order }) => {
    setIsLoadingOrder(true);
    setCart(receivable.order.items || []);
    setSaleType(receivable.order.type);
    setIsReceivingFiado(receivable.id);
    setEditingOrderId(receivable.orderId);
    setSelectedClient(receivable.client);
    setTableNumber(receivable.order.tableNumber || '');
    setTableNumberInput(receivable.order.tableNumber?.toString() || '');

    if (receivable.order.deliveryFee) {
      setManualDeliveryFee(receivable.order.deliveryFee);
    }

    setTimeout(() => setIsLoadingOrder(false), 500);
  };

  const handleManualTableLoad = async () => {
    const num = parseInt(tableNumberInput);
    if (isNaN(num)) return showAlert("Erro", "Digite um número de mesa válido.", "DANGER");

    const allSess = await db.getTableSessions();
    const sess = allSess.find(t => t.tableNumber === num);

    if (sess) {
      loadTableSession(sess);
    } else {
      showAlert("Mesa Vazia", "Mesa não encontrada ou não possui consumo ativo.", "INFO");
    }
  };

  const handleReopenTable = async () => {
    const num = parseInt(tableNumberInput);
    if (isNaN(num)) return;

    const allSess = await db.getTableSessions();
    const sess = allSess.find(s => s.tableNumber === num);
    if (sess) {
      // Retorna mesa para 'occupied'
      await db.saveTableSession({ ...sess, status: 'occupied' });

      // Retorna pedido da cozinha para 'REOPENED'
      const tableOrder = orders.find(o => o.id === `TABLE-${num}`);
      if (tableOrder) {
        // If order is more than 4 hours old, reset its createdAt to now
        const orderDate = new Date(tableOrder.createdAt);
        const now = new Date();
        const diffHours = (now.getTime() - orderDate.getTime()) / (1000 * 60 * 60);

        const updatedOrder = { ...tableOrder, status: OrderStatus.REOPENED };
        if (diffHours > 4 || orderDate.toDateString() !== now.toDateString()) {
          console.log('Resetting stale order timestamp on reopen');
          updatedOrder.createdAt = now.toISOString();
        }

        await db.saveOrder(updatedOrder, currentUser!);
        // UPDATE LOCAL ORDERS STATE
        setOrders(prev => prev.map(o => o.id === tableOrder.id ? updatedOrder : o));
      }

      // REMOÇÃO IMEDIATA DA LISTA LOCAL
      setPendingTables(prev => prev.filter(t => t.tableNumber !== num));
      setCurrentOrderStatus(OrderStatus.REOPENED);

      showAlert("Sucesso", `Mesa ${num} reaberta para novos lançamentos nas Mesas.`, "INFO");
      clearState();
      await refreshAllData();
    }
  };

  const handleLaunchToTable = async () => {
    if (!activeCashSession) return showAlert("Caixa Fechado", "Você precisa abrir o caixa antes de fazer lançamentos.", "DANGER");
    const num = parseInt(tableNumberInput);
    if (isNaN(num)) return showAlert("Erro", "Selecione ou digite uma mesa válida.", "DANGER");
    if (cart.length === 0) return showAlert("Carrinho Vazio", "Adicione produtos antes de lançar.", "INFO");

    const allSess = await db.getTableSessions();
    const existingSess = allSess.find(t => t.tableNumber === num);

    if (!existingSess) {
      return showAlert("Mesa Inativa", "Esta mesa não possui uma sessão ativa iniciada por um garçom.", "DANGER");
    }

    if (existingSess.status === 'billing') {
      return showAlert("Mesa Bloqueada", "Esta mesa está em pré-fechamento (Faturando). Reabra a mesa para adicionar itens.", "DANGER");
    }

    const mergedItems = [...existingSess.items, ...cart];

    const updatedSess: TableSession = {
      ...existingSess,
      items: mergedItems,
    };

    await db.saveTableSession(updatedSess);
    await db.logAction(currentUser, 'TABLE_ADD_ITEM', `Lançamento PDV na Mesa ${num}.`);

    showAlert("Sucesso", `Produtos lançados com sucesso na Mesa ${num}.`);

    setCart([]);
    setTableNumber('');
    setTableNumberInput('');
    setCurrentOrderStatus(null);
    setEditingOrderId(null);
    await refreshAllData();
  };

  const processPaymentAndFinalize = async () => {
    if (!activeCashSession) return showAlert("Caixa Fechado", "Você precisa abrir o caixa antes de fazer lançamentos e recebimentos.", "DANGER");

    const total = cartTotal;
    const totalPaid = payments.reduce((acc, p) => acc + p.amount, 0);

    if (Math.abs(totalPaid - total) > 0.01 && totalPaid < total) {
      return showAlert("Valor Insuficiente", "O valor total informado nos pagamentos é menor que o total da compra. Adicione mais pagamentos para prosseguir.", "DANGER");
    }

    if (isReceivingFiado) {
      try {
        const method = payments.map(p => p.method).join(' + ');
        let nfeData: any = undefined;
        let currentOrderData = null;

        const rec = pendingReceivables.find(r => r.id === isReceivingFiado);
        if (rec) {
          currentOrderData = { ...rec.order, paymentMethod: method };
        }

        if (emitNfce && businessSettings?.enableNfcEmission) {
          nfeData = {
            nfeStatus: 'EMITTED',
            nfeNumber: `NFC-${Date.now()}`,
            nfeUrl: `https://sefaz.gov.br/nfce/qrcode?p=${Date.now()}`
          };
          if (currentOrderData) {
            currentOrderData = { ...currentOrderData, ...nfeData };
          }
        }

        await db.receivePayment(isReceivingFiado, method, currentUser, nfeData);
        showAlert("Sucesso", "Recebimento concluído.", "SUCCESS");

        const shouldEmit = emitNfce;
        setIsReceivingFiado(null);
        await clearState(true, true);
        await refreshAllData();

        if (currentOrderData) {
          setIsNfceVisual(shouldEmit);
          setPrintingOrder(currentOrderData as any);
          if (shouldEmit) {
            setIsNfceFeedbackOpen(true);
            setTimeout(() => setIsNfceFeedbackOpen(false), 5000);
          }
        }

        setIsPaymentModalOpen(false);
      } catch (err: any) {
        showAlert("Erro", err.message || "Erro ao processar recebimento.", "DANGER");
      }
      return;
    }

    await commitOrder();

    if (emitNfce) {
      setIsNfceFeedbackOpen(true);
      setTimeout(() => setIsNfceFeedbackOpen(false), 5000);
    }
    setIsPaymentModalOpen(false);
  };

  const handleFinalize = async () => {
    if (!activeCashSession) return showAlert("Caixa Fechado", "Você precisa abrir o caixa para finalizar o pedido.", "DANGER");
    if (cart.length === 0) {
      return showAlert("Carrinho Vazio", "Adicione produtos antes de finalizar.", "INFO");
    }

    const isTableSale = saleType === SaleType.TABLE;
    const isCounterSale = saleType === SaleType.COUNTER;
    const isDelivery = saleType === SaleType.OWN_DELIVERY;
    const finalTableNum = isTableSale ? parseInt(tableNumberInput) : null;

    if (isTableSale) {
      if (isNaN(finalTableNum!)) return showAlert("Erro", "Por favor, informe o número da mesa.", "DANGER");
      const tableOrder = orders.find(o => o.id === `TABLE-${finalTableNum}`);
      if (tableOrder && (tableOrder.status === OrderStatus.PREPARING || tableOrder.status === OrderStatus.PARTIALLY_READY)) {
        return showAlert("Produção Ativa", "ATENÇÃO: Checkout bloqueado. Esta mesa ainda possui itens EM PREPARO na cozinha.", "DANGER");
      }
    }

    // Rule: Delivery and Counter MUST have a client to send to kitchen or finalize.
    if ((isDelivery || isCounterSale) && !selectedClient && !avulsoData.name) {
      setIsClientModalOpen(true);
      const modeLabel = isDelivery ? 'Delivery' : 'Balcão';
      return showAlert('Identificar Cliente', `A modalidade ${modeLabel} exige um cliente selecionado para prosseguir. Identifique o cliente.`, 'DANGER');
    }

    // New Business Rule: For NEW Balcão or Delivery orders, payment is optional when sending to production.
    // Balcão identifies the client now but payment happens after returns from kitchen.
    // Delivery is often handled by the driver.
    if ((isCounterSale && !editingOrderId) || (isDelivery && !isReceivingFiado)) {
      return commitOrder();
    }

    // Set initial payment state
    setPayments([]);
    setCurrentPaymentAmount(cartTotal.toFixed(2));
    setPaymentMethod('DINHEIRO');
    setPaymentData({ receivedAmount: '' });
    setEmitNfce(false);

    setIsPaymentModalOpen(true);
  };



  const commitOrder = async () => {
    const isTableSale = saleType === SaleType.TABLE;
    const isCounterSale = saleType === SaleType.COUNTER;
    const isDelivery = saleType === SaleType.OWN_DELIVERY;
    const finalTableNum = isTableSale ? parseInt(tableNumberInput) : null;

    let freshTableSession = isTableSale ? ((await db.getTableSessions()).find(t => t.tableNumber === finalTableNum)) : null;
    let tableSessionToClose = isTableSale ? (freshTableSession || pendingTables.find(t => t.tableNumber === finalTableNum)) : null;

    let finalClientId = isTableSale ? (tableSessionToClose?.clientId || 'ANONYMOUS') : (selectedClient?.id || 'ANONYMOUS');
    let finalClientName = isTableSale
      ? (tableSessionToClose?.clientName || `Mesa ${finalTableNum}`)
      : (isAvulso ? toTitleCase(avulsoData.name) : (selectedClient?.name || 'Consumidor Padrão'));

    if (!isTableSale && (isAvulso || selectedClient) && (avulsoData.name || selectedClient?.name)) {
      try {
        const phoneToSearch = isAvulso ? avulsoData.phone : selectedClient?.phone;
        if (phoneToSearch) {
          const formattedPhone = phoneToSearch.replace(/\D/g, '');
          const existingClient = clients.find(c => c.phone.replace(/\D/g, '') === formattedPhone);

          if (existingClient) {
            finalClientId = existingClient.id;
            finalClientName = existingClient.name;
          } else if (isAvulso && avulsoData.name && avulsoData.phone) {
            const newClient: Client = {
              id: editingClient?.id || `CLIENT-${Date.now()}`,
              name: toTitleCase(avulsoData.name),
              phone: avulsoData.phone.replace(/\D/g, ''),
              email: avulsoData.email || undefined,
              document: avulsoData.document || undefined,
              cep: avulsoData.cep || undefined,
              street: toTitleCase(avulsoData.street),
              addressNumber: avulsoData.addressNumber || undefined,
              neighborhood: toTitleCase(avulsoData.neighborhood),
              city: toTitleCase(avulsoData.city),
              state: avulsoData.state?.toUpperCase() || undefined,
              complement: avulsoData.complement || undefined,
              addresses: [formatAddress({ ...avulsoData })],
              totalOrders: 0
            };
            await db.saveClient(newClient);
            finalClientId = newClient.id;
            setClients(prev => [...prev, newClient]);
          }
        }
      } catch (err) {
        console.error('Error auto-registering client', err);
      }
    }

    if (!finalClientId) finalClientId = 'ANONYMOUS';

    const finalAddress = isTableSale
      ? (pendingTables.find(t => t.tableNumber === finalTableNum)?.clientAddress || undefined)
      : (isAvulso ? formatAddress({ ...avulsoData }) : (selectedClient ? formatAddress(selectedClient) : undefined));

    const finalPhone = isTableSale
      ? (pendingTables.find(t => t.tableNumber === finalTableNum)?.clientPhone || undefined)
      : (isAvulso ? avulsoData.phone : (selectedClient?.phone || undefined));

    const finalEmail = isTableSale
      ? (pendingTables.find(t => t.tableNumber === finalTableNum)?.clientEmail || undefined)
      : (isAvulso ? avulsoData.email : (selectedClient?.email || undefined));

    const finalDocument = isTableSale
      ? (pendingTables.find(t => t.tableNumber === finalTableNum)?.clientDocument || undefined)
      : (isAvulso ? avulsoData.document : (selectedClient?.document || undefined));

    const existingTableOrderId = isTableSale ? `TABLE-${finalTableNum}` : null;
    const existingOrderId = existingTableOrderId || editingOrderId;
    const existingOrder = existingOrderId ? orders.find(o => o.id === existingOrderId) : null;

    const orderData: Order = {
      id: existingOrderId || `PED-${Date.now()}`,
      clientId: finalClientId,
      clientName: finalClientName,
      clientAddress: finalAddress,
      clientPhone: finalPhone,
      clientEmail: finalEmail,
      clientDocument: finalDocument,
      items: [...cart],
      total: cartTotal,
      status: (isCounterSale && !editingOrderId) || isDelivery ? OrderStatus.PREPARING : OrderStatus.DELIVERED,
      type: saleType,
      createdAt: existingOrderId ? orders.find(o => o.id === existingOrderId)?.createdAt || new Date().toISOString() : new Date().toISOString(),
      paymentMethod: payments.map(p => p.method).join(' + '),
      driverId: existingOrder?.driverId,
      deliveryFee: (saleType === SaleType.OWN_DELIVERY) ? deliveryFeeValue : undefined,
      tableNumber: isTableSale ? finalTableNum! : undefined,
      waiterId: isTableSale ? orders.find(o => o.id === existingTableOrderId)?.waiterId : undefined,
      isOriginDigitalMenu: isTableSale ? (tableSessionToClose?.isOriginDigitalMenu || false) : false,
      nfeStatus: (emitNfce && businessSettings?.enableNfcEmission) ? 'EMITTED' : undefined,
      nfeNumber: (emitNfce && businessSettings?.enableNfcEmission) ? `NFC-${Date.now()}` : undefined,
      nfeUrl: (emitNfce && businessSettings?.enableNfcEmission) ? `https://sefaz.gov.br/nfce/qrcode?p=${Date.now()}` : undefined,
      splitAmount1: payments.length > 1 ? payments[0].amount : undefined,
      appliedServiceFee: (saleType === SaleType.TABLE && businessSettings?.serviceFeeStatus && isServiceFeeAccepted) ? (cart.reduce((acc, item) => acc + (item.price * item.quantity), 0) * (businessSettings.serviceFeePercentage || 10) / 100) : 0
    };

    console.log('Salvando pedido com metadados fiscais:', orderData);
    await db.saveOrder(orderData, currentUser);

    if (isTableSale) {
      await db.deleteTableSession(finalTableNum!);
      setPendingTables(prev => prev.filter(t => t.tableNumber !== finalTableNum));
    } else if (editingOrderId) {
      setPendingCounterOrders(prev => prev.filter(o => o.id !== editingOrderId));
    }

    if (orderData.status === OrderStatus.PREPARING) {
      showAlert("Sucesso", "Pedido enviado para a cozinha.", "INFO");
    } else {
      setIsNfceVisual(emitNfce);
      setPrintingOrder(orderData);
      showAlert("Sucesso", "Venda finalizada com sucesso.", "SUCCESS");
    }

    clearState(false, !orderData.status || orderData.status !== OrderStatus.PREPARING);
    await refreshAllData();
  };

  const clearState = async (skipRevertFiado: boolean = false, keepPrinting: boolean = false) => {
    if (isReceivingFiado && !skipRevertFiado) {
      try {
        await db.updateReceivable(isReceivingFiado, { status: 'PENDING' });
        await refreshAllData();
      } catch (err) {
        console.error("Error reverting receivable status", err);
      }
    }
    setCart([]);
    setSelectedClient(null);
    setClientSearch('');
    setTableNumber('');
    setTableNumberInput('');
    setCurrentOrderStatus(null);
    setEditingOrderId(null);
    if (!keepPrinting) setPrintingOrder(null);
    setIsAvulso(false);
    setAvulsoData({ name: '', phone: '', address: '', cep: '', email: '', document: '' });
    setManualDeliveryFee(null);
    setPayments([]);
    setCurrentPaymentAmount('');
    setPaymentMethod('DINHEIRO');
    setPaymentData({ receivedAmount: '' });
    setEmitNfce(false);
    setSystemPreview(null);
  };

  const handleOpenCash = async () => {
    try {
      const balance = parseFloat(initialBalanceInput.replace(',', '.'));
      const session = await db.openCashSession(balance, currentUser);
      setActiveCashSession(session);
      setIsOpeningModalOpen(false);
      showAlert("Sucesso", "Caixa aberto com sucesso!", "INFO");
    } catch (e: any) {
      showAlert("Erro", e.message || "Erro ao abrir o caixa", "DANGER");
    }
  };

  const handleSystemPreview = async () => {
    if (!currentUser.permissions.includes('admin') && !currentUser.permissions.includes('settings')) {
      return showAlert("Acesso Negado", "Apenas administradores podem realizar o fechamento pelo sistema.", "DANGER");
    }

    if (!adminPassword) {
      return showAlert("Senha Necessária", "Informe a senha para autorizar o preenchimento.", "DANGER");
    }

    const isValid = await db.verifyAdminPassword(adminPassword);
    if (!isValid) {
      return showAlert("Senha Incorreta", "A senha informada não é válida para um Administrador Master.", "DANGER");
    }

    try {
      const preview = await db.getClosurePreview();
      setSystemPreview({
        cash: preview.systemCash,
        pix: preview.systemPix,
        credit: preview.systemCredit,
        debit: preview.systemDebit,
        others: preview.systemOthers,
        fiado: preview.systemFiado,
        orphanSales: preview.orphanSales
      });

      // Auto-preencher os campos do relatório de fechamento
      setClosingReport({
        cash: preview.systemCash.toFixed(2),
        pix: preview.systemPix.toFixed(2),
        credit: preview.systemCredit.toFixed(2),
        debit: preview.systemDebit.toFixed(2),
        others: preview.systemOthers.toFixed(2),
        observations: closingReport.observations // Manter observações se já houver
      });

      showAlert("Relatório Gerado", "Os valores calculados pelo sistema foram importados para conferência.", "SUCCESS");
    } catch (e: any) {
      showAlert("Erro", e.message || "Erro ao carregar prévia do sistema.", "DANGER");
    }
  };

  const handleCloseCash = async () => {
    if (!activeCashSession) return;

    if (closingMode === 'SYSTEM') {
      const isValidAdmin = await db.verifyAdminPassword(adminPassword);
      if (!isValidAdmin) {
        return showAlert("Autorização Negada", "O fechamento pelo sistema exige uma senha válida de Admin Master.", "DANGER");
      }
    }

    // Validar preenchimento
    if (closingReport.cash === '' || closingReport.pix === '' || closingReport.credit === '' || closingReport.debit === '' || closingReport.others === '') {
      showAlert("Atenção", "Por favor, preencha todos os campos de valores para o fechamento.", "DANGER");
      return;
    }

    try {
      const reports = {
        cash: parseFloat(closingReport.cash.toString().replace(',', '.')),
        pix: parseFloat(closingReport.pix.toString().replace(',', '.')),
        credit: parseFloat(closingReport.credit.toString().replace(',', '.')),
        debit: parseFloat(closingReport.debit.toString().replace(',', '.')),
        others: parseFloat(closingReport.others.toString().replace(',', '.')),
        observations: closingReport.observations
      };

      const session = await db.closeCashSession(activeCashSession.id, reports, currentUser);
      setActiveCashSession(null);
      setIsClosingModalOpen(false);

      // Abrir modal de revisão (que permite visualizar e imprimir o fechamento)
      setReviewSession(session);
      setIsReviewModalOpen(true);
      setAdminPassword('');

      showAlert("Caixa Fechado", "O caixa foi encerrado com sucesso.");
      refreshAllData();
    } catch (e: any) {
      showAlert("Erro", e.message || "Erro ao fechar o caixa", "DANGER");
    }
  };

  const handleSaveReview = async () => {
    if (!reviewSession) return;

    const isValidAdmin = await db.verifyAdminPassword(adminPassword);
    if (!isValidAdmin) {
      return showAlert("Acesso Negado", "Senha fornecida não pertence a um Admin Master válido.", "DANGER");
    }

    try {
      const reports = {
        id: reviewSession.id,
        cash: parseFloat(closingReport.cash.toString().replace(',', '.')),
        pix: parseFloat(closingReport.pix.toString().replace(',', '.')),
        credit: parseFloat(closingReport.credit.toString().replace(',', '.')),
        debit: parseFloat(closingReport.debit.toString().replace(',', '.')),
        others: parseFloat(closingReport.others.toString().replace(',', '.')),
        observations: closingReport.observations,
        user: currentUser
      };

      const updated = await db.updateCashSession(reports);
      setReviewSession(updated);
      setIsAdjustModalOpen(false);
      setAdminPassword('');
      showAlert("Sucesso", "Lançamentos corrigidos com sucesso!", "INFO");
    } catch (e: any) {
      showAlert("Erro", e.message || "Erro ao salvar correções.", "DANGER");
    }
  };

  const handleReopenCash = async (sessionId: string) => {
    if (!currentUser || !currentUser.permissions.includes('settings')) {
      return showAlert("Acesso Negado", "Apenas administradores podem reabrir o caixa.", "DANGER");
    }
    try {
      await db.reopenCashSession(sessionId, currentUser);
      showAlert("Sucesso", "Caixa reaberto com sucesso.", "INFO");
      refreshAllData();
    } catch (e: any) {
      showAlert("Erro", e.message || "Erro ao reabrir o caixa", "DANGER");
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

  const groupedCart = useMemo(() => {
    const grouped: Record<string, { product: Product | undefined, quantity: number, price: number }> = {};
    if (Array.isArray(cart)) {
      cart.forEach(item => {
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
  }, [cart, products]);

  const deliveryFeeValue = useMemo(() => {
    if (manualDeliveryFee !== null) return manualDeliveryFee;
    if (!businessSettings?.deliveryFee) return 0;
    const clean = businessSettings.deliveryFee.replace('R$', '').replace(',', '.').trim();
    return parseFloat(clean) || 0;
  }, [businessSettings, manualDeliveryFee]);

  const cartTotal = useMemo(() => {
    const itemsTotal = cart.reduce((acc, item) => acc + (item.price * item.quantity), 0);

    let total = itemsTotal;
    if (saleType === SaleType.OWN_DELIVERY) {
      total += deliveryFeeValue;
    }

    if (saleType === SaleType.TABLE && businessSettings?.serviceFeeStatus && isServiceFeeAccepted) {
      const feePercentage = businessSettings.serviceFeePercentage || 10;
      total += (itemsTotal * feePercentage) / 100;
    }

    return total;
  }, [cart, saleType, deliveryFeeValue, businessSettings, isServiceFeeAccepted]);

  // Effect to handle cumulative payment logic (Dynamic)
  useEffect(() => {
    if (isPaymentModalOpen) {
      const total = cartTotal;
      const alreadyPaid = payments.reduce((acc, p) => acc + p.amount, 0);
      const remaining = Math.max(0, total - alreadyPaid);

      if (remaining > 0) {
        setCurrentPaymentAmount(remaining.toFixed(2));
      } else {
        setCurrentPaymentAmount('0.00');
      }
    } else {
      setPayments([]);
      setCurrentPaymentAmount('');
      setPaymentMethod('DINHEIRO');
      setPaymentData({ receivedAmount: '' });
    }
  }, [isPaymentModalOpen, payments, cartTotal]);

  const addPaymentToList = () => {
    const amount = parseFloat(currentPaymentAmount.replace(',', '.')) || 0;
    if (amount <= 0) return showAlert("Valor Inválido", "Informe um valor maior que zero.", "DANGER");

    // Check for duplicate method
    if (payments.find(p => p.method === paymentMethod)) {
      return showAlert("Método Duplicado", "Este método de pagamento já foi adicionado. Remova-o para ajustar o valor ou escolha outro.", "DANGER");
    }

    // Validation for DINHEIRO
    let received: number | undefined = undefined;
    if (paymentMethod === 'DINHEIRO') {
      received = parseFloat(paymentData.receivedAmount.replace(',', '.')) || 0;
      if (received <= 0) {
        return showAlert("Valor Recebido", "Para pagamentos em Dinheiro, é obrigatório informar o valor recebido pelo cliente.", "DANGER");
      }

      // If received is less than the suggested amount, we record the actual received amount
      // and the remaining balance will be recalculated for the next method.
      if (received < amount) {
        // No block here. We adjust segment amount to match received value.
        // The user will then select another method for the rest.
      } else {
        const change = received - amount;
        const maxChange = businessSettings?.maxChange || 10.00;
        if (change > maxChange) {
          return showAlert(
            "Troco Excedido",
            `O valor do troco (R$ ${change.toFixed(2)}) ultrapassa o limite permitido de R$ ${maxChange.toFixed(2)}. Por favor, informe um valor recebido menor.`,
            "DANGER"
          );
        }
      }
    }

    const finalAmount = (paymentMethod === 'DINHEIRO' && received && received < amount) ? received : amount;

    setPayments(prev => [...prev, {
      method: paymentMethod,
      amount: finalAmount,
      receivedAmount: received
    }]);

    // Reset current selection
    setPaymentData({ receivedAmount: '' });
  };

  const removePayment = (method: string) => {
    setPayments(prev => prev.filter(p => p.method !== method));
  };

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
    <div className="flex flex-col h-full gap-2 lg:gap-4 xl:gap-6">
      <CustomAlert {...alertConfig} onConfirm={alertConfig.onConfirm} />

      {/* Payment Selection Modal */}
      {isPaymentModalOpen && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-900/60 backdrop-blur-md animate-in fade-in duration-300">
          <div className="bg-white w-[600px] max-w-[95vw] rounded-[3rem] shadow-2xl overflow-hidden border border-slate-100 flex flex-col max-h-[90vh]">
            <div className="p-4 lg:p-6 border-b border-slate-50 shrink-0 relative bg-slate-50/50">
              <button
                onClick={() => setIsPaymentModalOpen(false)}
                className="absolute right-4 top-4 w-9 h-9 flex items-center justify-center bg-white rounded-full text-slate-400 hover:bg-red-50 hover:text-red-500 transition-all font-black text-xl z-20 shadow-sm"
              >
                ×
              </button>

              <div className="text-center mb-4">
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-0.5 block">Total da Compra</span>
                <span className="text-3xl font-black text-blue-600 tracking-tighter">R$ {cartTotal.toFixed(2)}</span>
              </div>

              <div className="space-y-4 overflow-y-auto max-h-[55vh] pr-2 custom-scrollbar">
                {/* PAYMENT METHOD SELECTION */}
                <div className="space-y-2 p-3 bg-white rounded-3xl border border-slate-100 shadow-sm relative">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="w-5 h-5 rounded-full bg-blue-100 text-blue-600 font-black flex items-center justify-center text-[9px]">1</span>
                    <h3 className="text-[10px] font-black text-slate-800 uppercase tracking-widest">Selecionar Pagamento</h3>
                  </div>

                  <div className="grid grid-cols-3 md:grid-cols-5 gap-1.5">
                    {[
                      { id: 'DINHEIRO', label: 'Dinheiro', icon: Icons.Dashboard },
                      { id: 'PIX', label: 'PIX', icon: Icons.QrCode },
                      { id: 'CRÉDITO', label: 'Crédito', icon: Icons.CreditCard },
                      { id: 'DÉBITO', label: 'Débito', icon: Icons.CreditCard },
                      { id: 'FIADO', label: 'Fiado', icon: Icons.User }
                    ].map(method => (
                      <button
                        key={method.id}
                        disabled={method.id === 'FIADO' && !!isReceivingFiado}
                        onClick={() => setPaymentMethod(method.id)}
                        className={`flex flex-col items-center gap-1 py-2.5 rounded-2xl transition-all ${paymentMethod === method.id ? 'bg-blue-600 text-white shadow-lg' : 'bg-slate-50 text-slate-400 hover:bg-slate-100'} ${(method.id === 'FIADO' && isReceivingFiado) ? 'opacity-30 cursor-not-allowed' : ''}`}
                      >
                        <method.icon className="w-4 h-4" />
                        <span className="text-[7px] font-black uppercase tracking-widest">{method.label}</span>
                      </button>
                    ))}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
                    <div>
                      <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest ml-1">Valor do Pagamento (R$)</label>
                      <input
                        type="number"
                        step="0.01"
                        className="w-full mt-0.5 p-3 bg-slate-50 border-2 border-slate-100 rounded-2xl text-lg font-black outline-none focus:border-blue-500 transition-all text-blue-700"
                        value={currentPaymentAmount}
                        onChange={e => setCurrentPaymentAmount(e.target.value)}
                      />
                    </div>

                    {paymentMethod === 'DINHEIRO' && (
                      <div className="animate-in fade-in duration-300">
                        <label className="text-[8px] font-black text-emerald-800 uppercase tracking-widest ml-1">Valor Recebido (R$)</label>
                        <input
                          type="number"
                          step="0.01"
                          placeholder="0,00"
                          className="w-full mt-0.5 p-3 bg-emerald-50 border-2 border-emerald-100 rounded-2xl text-lg font-black outline-none focus:border-emerald-500 transition-all text-emerald-700"
                          value={paymentData.receivedAmount}
                          onChange={e => setPaymentData({ ...paymentData, receivedAmount: e.target.value })}
                        />
                      </div>
                    )}
                  </div>

                  {/* Troco Estimado removed as per user request */}

                  <button
                    onClick={addPaymentToList}
                    className="w-full mt-2 py-3 bg-slate-800 hover:bg-slate-900 text-white rounded-2xl font-black uppercase text-[10px] tracking-widest transition-all shadow-md active:scale-95"
                  >
                    Confirmar Valor ✓
                  </button>
                </div>

                {/* PAYMENTS SUMMARY LIST */}
                {payments.length > 0 && (
                  <div className="space-y-2 p-3 bg-blue-50/50 rounded-3xl border border-blue-100 shadow-sm animate-in slide-in-from-top-4 duration-500">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="w-5 h-5 rounded-full bg-blue-600 text-white font-black flex items-center justify-center text-[9px]">2</span>
                      <h3 className="text-[10px] font-black text-blue-800 uppercase tracking-widest">Resumo de Pagamentos</h3>
                    </div>

                    <div className="space-y-1.5">
                      {payments.map((p, idx) => (
                        <div key={idx} className="flex items-center justify-between p-2.5 bg-white border border-blue-100 rounded-2xl shadow-sm">
                          <div className="flex items-center gap-2">
                            <div className="w-7 h-7 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center">
                              {p.method === 'DINHEIRO' ? <Icons.Dashboard className="w-3.5 h-3.5" /> : <Icons.CreditCard className="w-3.5 h-3.5" />}
                            </div>
                            <div>
                              <p className="text-[9px] font-black text-slate-800 uppercase tracking-tight">{p.method}</p>
                              {p.receivedAmount !== undefined && (
                                <div className="flex items-center gap-2">
                                  <p className="text-[9px] text-slate-400 font-medium uppercase">Recebido: R$ {p.receivedAmount.toFixed(2)}</p>
                                  {p.receivedAmount > p.amount && (
                                    <span className="text-[9px] bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full font-medium uppercase border border-emerald-100">Troco: R$ {(p.receivedAmount - p.amount).toFixed(2)}</span>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="text-xs font-black text-blue-700">R$ {p.amount.toFixed(2)}</span>
                            <button
                              onClick={() => removePayment(p.method)}
                              className="text-red-400 hover:text-red-600 p-1.5 rounded-xl hover:bg-red-50 transition-all active:scale-90"
                              title="Remover pagamento"
                            >
                              <Icons.Delete className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="pt-1.5 border-t border-blue-200 mt-1 flex justify-between items-center px-1">
                      <span className="text-[9px] font-black text-blue-400 uppercase tracking-widest">Total Informado</span>
                      <span className="text-base font-black text-blue-600">
                        R$ {payments.reduce((acc, p) => acc + p.amount, 0).toFixed(2)}
                      </span>
                    </div>
                  </div>
                )}

                {/* Insufficient payment alert */}
                {(() => {
                  const paid = payments.reduce((acc, p) => acc + p.amount, 0);
                  if (paid < cartTotal - 0.01 && payments.length > 0) {
                    return (
                      <div className="p-4 bg-red-50 border-2 border-red-100 rounded-3xl animate-pulse">
                        <p className="text-[9px] font-black text-red-600 uppercase tracking-widest text-center flex items-center justify-center gap-2">
                          <Icons.View className="w-3 h-3" />
                          Falta R$ {(cartTotal - paid).toFixed(2)} para completar o total
                        </p>
                      </div>
                    );
                  }
                  return null;
                })()}
              </div>
            </div>

            <div className={`p-4 bg-white border-t border-slate-100 shrink-0 flex flex-col gap-3`}>
              {businessSettings?.enableNfcEmission && (
                <div className="flex items-center justify-between px-5 py-2.5 bg-slate-50 rounded-2xl border border-slate-100">
                  <div className="flex items-center gap-2">
                    <Icons.View className="w-4 h-4 text-blue-600" />
                    <div>
                      <p className="text-[9px] font-black uppercase tracking-tight">Emitir NFC-e Fiscal?</p>
                    </div>
                  </div>
                  <button
                    onClick={() => setEmitNfce(!emitNfce)}
                    className={`w-10 h-5 rounded-full transition-all relative ${emitNfce ? 'bg-emerald-600 ring-4 ring-emerald-500/20' : 'bg-slate-200'}`}
                  >
                    <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${emitNfce ? 'left-5.5' : 'left-0.5'}`}></div>
                  </button>
                </div>
              )}

              <button
                onClick={processPaymentAndFinalize}
                disabled={payments.reduce((acc, p) => acc + p.amount, 0) < cartTotal - 0.01}
                className={`w-full py-4 rounded-[1.5rem] font-black uppercase text-base tracking-widest transition-all flex items-center justify-center gap-3 group active:scale-95 shadow-2xl ${payments.reduce((acc, p) => acc + p.amount, 0) >= cartTotal - 0.01
                  ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-blue-200'
                  : 'bg-slate-200 text-slate-400 cursor-not-allowed shadow-none'
                  }`}
              >
                <span>Finalizar e Confirmar ✓</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Client Selection Modal */}
      {isClientModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 backdrop-blur-md animate-in fade-in duration-300">
          <div className="bg-white w-[500px] max-w-[95vw] rounded-[2.5rem] shadow-2xl overflow-hidden border border-slate-100 flex flex-col max-h-[90vh]">
            <div className="p-6 md:p-8 pb-4 border-b border-slate-50 shrink-0">
              <div className="flex justify-between items-center mb-4">
                <div>
                  <h2 className="text-xl font-black text-slate-800 uppercase tracking-tighter">Identificar Cliente</h2>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Venda: {getFriendlySaleType(saleType)}</p>
                </div>
                <div className="flex items-center gap-2">
                  {isAvulso && (
                    <button
                      onClick={() => {
                        const newErrors: Record<string, boolean> = {};
                        if (!avulsoData.name) newErrors.avulsoName = true;

                        const cleanPhone = avulsoData.phone.replace(/\D/g, '');
                        if ((saleType === SaleType.OWN_DELIVERY || saleType === SaleType.COUNTER) && cleanPhone.length < 11) {
                          newErrors.avulsoPhone = true;
                        } else if (cleanPhone.length > 0 && cleanPhone.length < 11) {
                          newErrors.avulsoPhone = true;
                        }

                        if (avulsoData.email && !validateEmail(avulsoData.email)) newErrors.avulsoEmail = true;

                        if (avulsoData.document) {
                          const cleanDoc = avulsoData.document.replace(/\D/g, '');
                          if (cleanDoc.length === 11) {
                            if (!validateCPF(cleanDoc)) newErrors.avulsoDocument = true;
                          } else if (cleanDoc.length === 14) {
                            if (!validateCNPJ(cleanDoc)) newErrors.avulsoDocument = true;
                          } else {
                            newErrors.avulsoDocument = true;
                          }
                        }

                        if (Object.keys(newErrors).length > 0) {
                          setErrors(newErrors);
                          return showAlert("Dados Inválidos", "Verifique os campos destacados em vermelho.", "DANGER");
                        }

                        setIsClientModalOpen(false);
                        setErrors({});
                      }}
                      className="w-10 h-10 flex items-center justify-center bg-emerald-100 text-emerald-600 rounded-full hover:bg-emerald-600 hover:text-white transition-all shadow-lg shadow-emerald-100/50"
                      title="Salvar Observações"
                    >
                      <Icons.Check className="w-5 h-5" />
                    </button>
                  )}
                  <button
                    onClick={() => setIsClientModalOpen(false)}
                    className="w-10 h-10 flex items-center justify-center bg-slate-100 rounded-full text-slate-400 hover:bg-red-50 hover:text-red-500 transition-all font-black text-lg"
                  >
                    ×
                  </button>
                </div>
              </div>

              <div className="flex gap-2 bg-slate-100 p-1.5 rounded-2xl">
                <button
                  onClick={() => {
                    setIsAvulso(false);
                    setSelectedClient(null);
                    setClientSearch('');
                  }}
                  className={`flex-1 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${!isAvulso ? 'bg-white text-blue-600 shadow-md' : 'text-slate-400'}`}
                >
                  Buscar Cliente
                </button>
                <button
                  onClick={() => {
                    setIsAvulso(true);
                    setSelectedClient(null);
                    setClientSearch('');
                  }}
                  className={`flex-1 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${isAvulso ? 'bg-white text-blue-600 shadow-md' : 'text-slate-400'}`}
                >
                  Novo / Avulso
                </button>
              </div>
            </div>

            <div className="flex-1 p-8 pt-6 overflow-y-auto">
              {!isAvulso ? (
                <div className="space-y-4">
                  <div className="relative">
                    <input
                      type="text"
                      className="w-full p-5 bg-slate-50 border-2 border-slate-100 rounded-2xl text-xs font-black outline-none focus:border-blue-500 transition-all"
                      placeholder="Buscar por Nome ou Telefone..."
                      value={clientSearch}
                      onChange={(e) => { setClientSearch(e.target.value); setShowClientList(true); }}
                      autoFocus
                    />
                    <div className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-300">
                      <Icons.Search />
                    </div>
                  </div>

                  <div className="space-y-2 mt-4">
                    {clientSearch ? (
                      clients.filter(c =>
                        c.name.toLowerCase().includes(clientSearch.toLowerCase()) ||
                        c.phone.includes(clientSearch)
                      ).slice(0, 5).map(c => (
                        <button
                          key={c.id}
                          onClick={() => {
                            setSelectedClient(c);
                            setClientSearch(c.name);
                            setShowClientList(false);
                            setIsClientModalOpen(false);
                          }}
                          className="w-full text-left p-4 bg-slate-50 hover:bg-blue-50 border border-slate-100 hover:border-blue-200 rounded-2xl transition-all group"
                        >
                          <div className="flex justify-between items-center">
                            <p className="text-sm font-black text-slate-800 uppercase group-hover:text-blue-700">{c.name}</p>
                            <span className="text-[10px] font-bold text-blue-500 bg-blue-100 px-2 py-0.5 rounded-full">{c.phone}</span>
                          </div>
                          <p className="text-[10px] text-slate-400 font-medium mt-1 uppercase truncate">{c.addresses[0] || 'Sem endereço cadastrado'}</p>
                        </button>
                      ))
                    ) : (
                      <div className="text-center py-10 opacity-40">
                        <p className="text-[10px] text-slate-400 font-bold uppercase italic tracking-widest">Digite para buscar</p>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex gap-2">
                    <div className="flex-1 space-y-1.5">
                      <label className={`text-[9px] font-black uppercase tracking-widest ml-1 ${errors.avulsoName ? 'text-red-500' : 'text-slate-400'}`}>Nome Completo *</label>
                      <input
                        type="text"
                        className={`w-full p-4 bg-slate-50 border-2 rounded-2xl text-xs font-black outline-none focus:border-blue-500 transition-all ${errors.avulsoName ? 'border-red-500 animate-shake' : 'border-slate-100'}`}
                        placeholder="Nome do Cliente"
                        value={avulsoData.name}
                        onChange={(e) => {
                          setAvulsoData({ ...avulsoData, name: e.target.value });
                          if (errors.avulsoName) setErrors(prev => ({ ...prev, avulsoName: false }));
                        }}
                      />
                    </div>
                    <div className="w-1/3 space-y-1.5">
                      <label className={`text-[9px] font-black uppercase tracking-widest ml-1 ${errors.avulsoPhone ? 'text-red-500' : 'text-slate-400'}`}>Telefone {(saleType === SaleType.OWN_DELIVERY || saleType === SaleType.COUNTER) ? '*' : ''}</label>
                      <input
                        type="text"
                        className={`w-full p-4 bg-slate-50 border-2 rounded-2xl text-xs font-black outline-none focus:border-blue-500 transition-all ${errors.avulsoPhone ? 'border-red-500 animate-shake' : 'border-slate-100'}`}
                        placeholder="(00) 9 0000-0000"
                        value={avulsoData.phone}
                        onChange={(e) => {
                          const val = maskPhone(e.target.value);
                          setAvulsoData({ ...avulsoData, phone: val });
                          if (errors.avulsoPhone) setErrors(prev => ({ ...prev, avulsoPhone: false }));
                          const match = clients.find(c => c.phone === val);
                          if (match) {
                            setSelectedClient(match);
                            setClientSearch(match.name);
                            setIsAvulso(false);
                          }
                        }}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className={`text-[9px] font-black uppercase tracking-widest ml-1 ${errors.avulsoEmail ? 'text-red-500' : 'text-slate-400'}`}>E-mail</label>
                      <input
                        type="email"
                        className={`w-full p-4 bg-slate-50 border-2 rounded-2xl text-xs font-black outline-none focus:border-blue-500 transition-all ${errors.avulsoEmail ? 'border-red-500 animate-shake' : 'border-slate-100'}`}
                        placeholder="exemplo@email.com"
                        value={avulsoData.email}
                        onChange={(e) => {
                          setAvulsoData({ ...avulsoData, email: e.target.value });
                          if (errors.avulsoEmail) setErrors(prev => ({ ...prev, avulsoEmail: false }));
                        }}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className={`text-[9px] font-black uppercase tracking-widest ml-1 ${errors.avulsoDocument ? 'text-red-500' : 'text-slate-400'}`}>CPF / CNPJ</label>
                      <input
                        type="text"
                        className={`w-full p-4 bg-slate-50 border-2 rounded-2xl text-xs font-black outline-none focus:border-blue-500 transition-all ${errors.avulsoDocument ? 'border-red-500 animate-shake' : 'border-slate-100'}`}
                        placeholder="000.000.000-00"
                        value={avulsoData.document}
                        onChange={(e) => {
                          setAvulsoData({ ...avulsoData, document: maskDocument(e.target.value) });
                          if (errors.avulsoDocument) setErrors(prev => ({ ...prev, avulsoDocument: false }));
                        }}
                      />
                    </div>
                  </div>

                  {(saleType === SaleType.OWN_DELIVERY || saleType === SaleType.THIRD_PARTY || saleType === SaleType.COUNTER) && (
                    <div className="space-y-4">
                      <div className="flex gap-2">
                        <div className="w-32 shrink-0 relative">
                          <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">CEP</label>
                          <input
                            type="text"
                            placeholder="00000000"
                            maxLength={8}
                            value={avulsoData.cep}
                            onChange={async e => {
                              const cep = e.target.value.replace(/\D/g, '').slice(0, 8);
                              setAvulsoData(prev => ({ ...prev, cep }));
                              if (cep.length === 8) {
                                setIsLoadingCep(true);
                                try {
                                  const res = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
                                  const data = await res.json();
                                  if (!data.erro) {
                                    setAvulsoData(prev => ({
                                      ...prev,
                                      street: data.logradouro || '',
                                      neighborhood: data.bairro || '',
                                      city: data.localidade || '',
                                      state: data.uf || ''
                                    }));
                                  }
                                } catch (err) {
                                  console.error('ViaCep error:', err);
                                } finally {
                                  setIsLoadingCep(false);
                                }
                              }
                            }}
                            className={`w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl text-xs font-black outline-none focus:border-blue-500 transition-all ${isLoadingCep ? 'opacity-50' : ''}`}
                          />
                        </div>
                        <div className="flex-1">
                          <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Logradouro</label>
                          <input
                            type="text"
                            placeholder="Rua / Avenida"
                            value={avulsoData.street}
                            onChange={e => setAvulsoData({ ...avulsoData, street: e.target.value })}
                            className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl text-xs font-black outline-none focus:border-blue-500 transition-all"
                          />
                        </div>
                      </div>

                      <div className="flex gap-2">
                        <div className="w-24 shrink-0">
                          <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Número</label>
                          <input
                            type="text"
                            placeholder="123"
                            value={avulsoData.addressNumber}
                            onChange={e => setAvulsoData({ ...avulsoData, addressNumber: e.target.value })}
                            className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl text-xs font-black outline-none focus:border-blue-500 transition-all"
                          />
                        </div>
                        <div className="flex-1">
                          <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Bairro</label>
                          <input
                            type="text"
                            placeholder="Bairro"
                            value={avulsoData.neighborhood}
                            onChange={e => setAvulsoData({ ...avulsoData, neighborhood: e.target.value })}
                            className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl text-xs font-black outline-none focus:border-blue-500 transition-all"
                          />
                        </div>
                      </div>

                      <div className="flex gap-2">
                        <div className="flex-1">
                          <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Cidade</label>
                          <input
                            type="text"
                            placeholder="Cidade"
                            value={avulsoData.city}
                            onChange={e => setAvulsoData({ ...avulsoData, city: e.target.value })}
                            className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl text-xs font-black outline-none focus:border-blue-500 transition-all"
                          />
                        </div>
                        <div className="w-16 shrink-0">
                          <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">UF</label>
                          <input
                            type="text"
                            placeholder="SP"
                            maxLength={2}
                            value={avulsoData.state}
                            onChange={e => setAvulsoData({ ...avulsoData, state: e.target.value.toUpperCase() })}
                            className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl text-xs font-black outline-none focus:border-blue-500 transition-all"
                          />
                        </div>
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Complemento / Referência</label>
                        <input
                          type="text"
                          placeholder="Ex: Apto 101, Próximo ao mercado..."
                          value={avulsoData.complement}
                          onChange={e => setAvulsoData({ ...avulsoData, complement: e.target.value })}
                          className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl text-xs font-black outline-none focus:border-blue-500 transition-all"
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="flex gap-2 lg:gap-4 xl:gap-6 flex-1 min-h-0">
        <div className="w-64 lg:w-72 flex flex-col gap-2 lg:gap-4 shrink-0">
          <div className="bg-orange-50 p-4 lg:p-6 rounded-[2rem] border border-orange-100 flex-1 flex flex-col overflow-hidden">
            <h3 className="text-[10px] font-black text-orange-600 uppercase tracking-widest mb-2 lg:mb-4 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-orange-500 rounded-full animate-pulse"></div>
                Aguardando Recebimento
              </div>
              <button
                onClick={() => {
                  setShowFeedbacks(true);
                  feedbackUnreadManager.setUnread(false);
                }}
                className={`p-2 rounded-xl transition-all relative ${hasNewFeedback ? 'bg-indigo-600 text-white animate-moderate-blink shadow-lg' : 'bg-slate-200 text-slate-500 hover:bg-slate-300'}`}
                title="Mensagens do Dia"
              >
                <Icons.Message className="w-3.5 h-3.5" />
                {hasNewFeedback && <span className="absolute -top-1 -right-1 w-2 h-2 bg-red-500 rounded-full border border-white animate-ping"></span>}
              </button>
            </h3>
            <div className="flex-1 overflow-y-auto pr-1 space-y-3">
              {/* Tables */}
              {pendingTables.length > 0 && pendingTables.map(t => (
                <button
                  key={`table-${t.tableNumber}`}
                  onClick={() => loadTableSession(t)}
                  className={`w-full p-4 bg-white rounded-2xl shadow-sm border border-transparent hover:border-orange-500 hover:shadow-md transition-all text-left group ${tableNumber === t.tableNumber ? 'ring-4 ring-orange-500 border-orange-500' : ''}`}
                >
                  <p className="font-black text-slate-800 text-sm uppercase">Mesa {t.tableNumber}</p>
                  <p className="text-[9px] font-black text-slate-400 uppercase mt-0.5 truncate">{t.clientName || 'S/ Identificação'}</p>
                  <p className="text-[10px] font-bold text-orange-500 mt-1 uppercase tracking-tighter">Total: R$ {t.items.reduce((acc, it) => acc + (it.price * it.quantity), 0).toFixed(2)}</p>
                </button>
              ))}

              {/* Counter Orders */}
              {pendingCounterOrders.length > 0 && pendingCounterOrders.map(o => (
                <button
                  key={`counter-${o.id}`}
                  onClick={() => loadCounterOrder(o)}
                  className={`w-full p-4 bg-white rounded-2xl shadow-sm border border-transparent hover:border-blue-500 hover:shadow-md transition-all text-left group ${editingOrderId === o.id ? 'ring-4 ring-blue-500 border-blue-500' : ''}`}
                >
                  <p className="font-black text-slate-800 text-sm uppercase">Balcão</p>
                  <p className="text-[9px] font-black text-slate-400 uppercase mt-0.5 truncate">{o.clientName}</p>
                  <p className="text-[10px] font-bold text-blue-500 mt-1 uppercase tracking-tighter">Pronto: R$ {o.total.toFixed(2)}</p>
                </button>
              ))}

              {/* Receivables (Fiado) */}
              {pendingReceivables.length > 0 && pendingReceivables.map(r => (
                <div
                  key={`receivable-${r.id}`}
                  className={`w-full p-4 bg-white rounded-2xl shadow-sm border border-transparent hover:border-emerald-500 hover:shadow-md transition-all text-left group ${isReceivingFiado === r.id ? 'ring-4 ring-emerald-500 border-emerald-500' : ''}`}
                >
                  <div className="flex justify-between items-start">
                    <div className="flex-1 min-w-0 cursor-pointer" onClick={() => loadReceivable(r)}>
                      <p className="font-black text-slate-800 text-sm uppercase truncate pr-2">{r.client.name}</p>
                      <span className="text-[8px] font-black bg-slate-900 text-white px-2 py-0.5 rounded-full uppercase">
                        {getFriendlySaleType(r.order.type)}
                      </span>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleReturnReceivable(r.id);
                      }}
                      className="w-8 h-8 flex items-center justify-center bg-red-50 text-red-500 rounded-xl hover:bg-red-500 hover:text-white transition-all shadow-sm"
                      title="Devolver para Recebimentos"
                    >
                      -
                    </button>
                  </div>
                  <div className="cursor-pointer" onClick={() => loadReceivable(r)}>
                    <p className="text-[9px] font-black text-slate-400 uppercase mt-0.5 tracking-tighter">Débito: {new Date(r.createdAt).toLocaleDateString()}</p>
                    <p className="text-[10px] font-bold text-emerald-600 mt-1 uppercase tracking-tighter">Total: R$ {r.amount.toFixed(2)}</p>
                  </div>
                </div>
              ))}

              {pendingTables.length === 0 && pendingCounterOrders.length === 0 && pendingReceivables.length === 0 && (
                <div className="text-center py-10 opacity-40">
                  <p className="text-[10px] text-slate-400 font-bold uppercase italic">Nada pendente</p>
                </div>
              )}
            </div>
          </div>

          {/* CASH REGISTER STATUS & TOGGLE */}
          <div className="bg-white p-4 rounded-[2rem] border border-slate-100 shadow-sm flex flex-col gap-3">
            <div className={`flex items-center justify-between p-3 rounded-2xl transition-all ${activeCashSession ? 'bg-emerald-50 border border-emerald-100' : 'bg-red-50 border border-red-100'}`}>
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${activeCashSession ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'}`}></div>
                <span className={`text-[10px] font-black uppercase tracking-widest ${activeCashSession ? 'text-emerald-700' : 'text-red-700'}`}>
                  {activeCashSession ? 'Caixa Aberto' : 'Caixa Fechado'}
                </span>
              </div>
              <button
                onClick={() => {
                  if (activeCashSession) {
                    setAuthModalAction('CLOSE_CASH');
                    setIsAuthModalOpen(true);
                  } else {
                    setAuthModalAction('OPEN_CASH');
                    setIsAuthModalOpen(true);
                  }
                }}
                className={`w-12 h-6 rounded-full transition-all relative ${activeCashSession ? 'bg-emerald-600 ring-4 ring-emerald-500/20' : 'bg-slate-300'}`}
              >
                <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all shadow-sm ${activeCashSession ? 'left-7' : 'left-1'}`}></div>
              </button>
            </div>

            {activeCashSession ? (
              <div className="bg-slate-50 p-3 rounded-2xl border border-slate-100">
                <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Iniciado em</p>
                <p className="text-[10px] font-black text-slate-600 uppercase">
                  {new Date(activeCashSession.openedAt).toLocaleString('pt-BR')}
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                <button
                  onClick={() => { setIsOpeningModalOpen(true); setAdminPassword(''); setSystemPreview(null); }}
                  className="w-full py-4 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl font-black uppercase text-[10px] tracking-widest transition-all shadow-lg active:scale-95 flex items-center justify-center gap-2 group"
                >
                  <Icons.Dashboard className="w-3 h-3 group-hover:rotate-12 transition-transform" />
                  Abrir Caixa
                </button>
                <button
                  onClick={async () => {
                    // Fetch last session for review
                    const sessions = await db.getCashSessions();
                    if (sessions.length > 0) {
                      setReviewSession(sessions[0]);
                      setClosingReport({
                        cash: sessions[0].reportedCash.toString(),
                        pix: sessions[0].reportedPix.toString(),
                        credit: sessions[0].reportedCredit.toString(),
                        debit: sessions[0].reportedDebit.toString(),
                        observations: sessions[0].observations || ''
                      });
                      setIsReviewModalOpen(true);
                    } else {
                      showAlert("Aviso", "Nenhum caixa anterior encontrado para revisar.", "INFO");
                    }
                  }}
                  className="w-full py-3 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-2xl font-black uppercase text-[9px] tracking-widest transition-all flex items-center justify-center gap-2 group"
                >
                  <Icons.View className="w-3 h-3" />
                  Revisar Último Caixa
                </button>
              </div>
            )}

            {activeCashSession && (
              <button
                onClick={() => { setAuthModalAction('CLOSE_CASH'); setIsAuthModalOpen(true); }}
                className="w-full py-4 bg-slate-900 border border-slate-800 hover:bg-orange-600 hover:border-orange-500 text-white rounded-2xl font-black uppercase text-[10px] tracking-widest transition-all shadow-lg active:scale-95 flex items-center justify-center gap-2 group"
              >
                <Icons.Dashboard className="w-3 h-3 group-hover:rotate-12 transition-transform" />
                Fechar Caixa
              </button>
            )}
          </div>
        </div>

        <div className="flex-1 flex flex-col min-w-0 relative">
          {!activeCashSession && (
            <div className="absolute inset-0 z-10 bg-slate-50/70 backdrop-blur-[2px] rounded-3xl flex items-center justify-center">
              <div className="bg-white p-6 rounded-3xl shadow-xl border border-red-100 flex flex-col items-center gap-3 animate-in zoom-in duration-300">
                <div className="w-12 h-12 bg-red-50 text-red-500 rounded-full flex items-center justify-center font-black text-2xl">🔒</div>
                <div className="text-center">
                  <h3 className="font-black text-slate-800 uppercase tracking-tighter">Vendas Bloqueadas</h3>
                  <p className="text-[10px] font-bold text-slate-400 uppercase mt-1">Abra o caixa no painel para iniciar as operações.</p>
                </div>
              </div>
            </div>
          )}
          <div className="flex gap-2 mb-6 overflow-x-auto pb-2 shrink-0">
            {['Todos', ...Array.from(new Set(products.map(p => p.category)))].map(cat => (
              <button key={cat as string} onClick={() => setActiveCategory(cat as string)} className={`px-4 py-2 rounded-full whitespace-nowrap text-[10px] font-black uppercase tracking-widest ${activeCategory === cat ? 'bg-blue-600 text-white shadow-lg shadow-blue-100' : 'bg-white text-slate-600 shadow-sm border'}`}>{cat as string}</button>
            ))}
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 overflow-y-auto pr-2">
            {products.filter(p => activeCategory === 'Todos' || p.category === activeCategory).map(product => (
              <button key={product.id} onClick={() => { setSelectedProductForCart(product); setCartObservation(''); }} className="bg-white p-4 rounded-3xl shadow-sm border border-slate-50 hover:border-blue-300 hover:scale-[1.02] transition-all text-left group">
                <div className="w-full h-32 bg-slate-50 rounded-2xl mb-3 flex items-center justify-center overflow-hidden">
                  <img src={formatImageUrl(product.imageUrl)} onError={e => e.currentTarget.src = PLACEHOLDER_FOOD_IMAGE} className="max-h-full object-contain group-hover:scale-110 transition-transform" />
                </div>
                <p className="font-black text-slate-800 line-clamp-1 uppercase text-[10px] tracking-tighter">{product.name}</p>
                <p className="text-blue-600 font-black mt-1">R$ {product.price.toFixed(2)}</p>
              </button>
            ))}
          </div>
        </div>

        <div className="w-80 lg:w-80 xl:w-96 bg-white rounded-3xl border border-slate-100 shadow-sm flex flex-col shrink-0 overflow-hidden relative border-l-4 border-l-blue-600/10">
          {!activeCashSession && (
            <div className="absolute inset-0 z-20 bg-slate-50/80 backdrop-blur-[2px] rounded-r-3xl flex items-center justify-center">
              <div className="bg-white p-8 rounded-3xl shadow-2xl border border-red-100 flex flex-col items-center gap-4 text-center max-w-[80%]">
                <div className="w-16 h-16 bg-red-100 text-red-600 rounded-2xl flex items-center justify-center text-3xl shadow-inner animate-pulse">
                  💰
                </div>
                <div>
                  <h3 className="text-xl font-black text-slate-800 uppercase tracking-tighter">Caixa Fechado</h3>
                  <p className="text-[10px] font-bold text-slate-400 uppercase mt-2 px-4 leading-relaxed">
                    Você deve abrir o caixa informando o saldo inicial antes de registrar itens e recebimentos.
                  </p>
                </div>
                <button
                  onClick={() => { setAuthModalAction('OPEN_CASH'); setIsAuthModalOpen(true); }}
                  className="mt-2 text-[10px] font-black uppercase text-blue-600 bg-blue-50 px-6 py-3 rounded-full hover:bg-blue-600 hover:text-white transition-colors"
                >
                  Abrir Caixa Agora
                </button>
              </div>
            </div>
          )}
          {isLoadingOrder && (
            <div className="absolute inset-0 z-20 bg-white/80 backdrop-blur-sm flex items-center justify-center animate-in fade-in duration-300">
              <div className="flex flex-col items-center gap-4">
                <div className="w-12 h-12 border-4 border-orange-500 border-t-transparent rounded-full animate-spin"></div>
                <p className="text-[10px] font-black text-orange-600 uppercase tracking-widest">Sincronizando...</p>
              </div>
            </div>
          )}

          <div className="p-4 lg:p-6 xl:p-8 border-b border-slate-50 shrink-0">
            <h3 className="font-black text-lg xl:text-xl text-slate-800 uppercase tracking-tighter">Área de Pagamento</h3>
            <div className="mt-3 xl:mt-6 space-y-3 xl:space-y-4">
              <div className="flex gap-2 bg-slate-100 p-1.5 rounded-2xl">
                {[SaleType.COUNTER, SaleType.TABLE, SaleType.OWN_DELIVERY].map(type => (
                  <button
                    key={type}
                    onClick={() => {
                      if (editingOrderId) return showAlert("Bloqueado", "Finalize ou limpe o pedido atual antes de mudar o tipo.", "DANGER");
                      if (saleType === SaleType.TABLE && tableNumber) return showAlert("Bloqueado", "Limpe a mesa atual antes de mudar a modalidade.", "DANGER");
                      if (isPaymentModalOpen) return showAlert("Bloqueado", "Cancele o pagamento atual antes de mudar a modalidade.", "DANGER");
                      setSaleType(type);
                      if (type !== SaleType.TABLE) {
                        setTableNumber('');
                        setTableNumberInput('');
                        setCurrentOrderStatus(null);
                      }
                    }}
                    className={`flex-1 py-3 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all ${saleType === type ? 'bg-white text-blue-600 shadow-md' : 'text-slate-400'}`}
                  >
                    {getFriendlySaleType(type)}
                  </button>
                ))}
              </div>

              {saleType === SaleType.TABLE && (
                <div className="space-y-3 animate-in slide-in-from-top-2 duration-300">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Identificar Mesa</label>
                  <div className="flex gap-2">
                    <input type="number" placeholder="Mesa" value={tableNumberInput} onChange={e => setTableNumberInput(e.target.value)} className="w-full p-4 bg-slate-100 border-none rounded-2xl text-[11px] font-black outline-none focus:ring-2 focus:ring-orange-500" />
                    <button onClick={handleManualTableLoad} className="bg-orange-500 text-white px-4 rounded-2xl hover:bg-orange-600 transition-all shadow-lg shadow-orange-100"><Icons.View /></button>
                  </div>
                </div>
              )}

              {saleType !== SaleType.TABLE && (
                <div className="space-y-4 animate-in slide-in-from-top-2 duration-300">
                  <div className="flex items-center justify-between px-1">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Identificação do Cliente</label>
                  </div>

                  <button
                    onClick={() => setIsClientModalOpen(true)}
                    className={`w-full p-4 rounded-2xl border-2 transition-all flex items-center justify-between group ${selectedClient || (isAvulso && avulsoData.name) ? 'bg-blue-50 border-blue-200 shadow-sm' : 'bg-slate-50 border-dashed border-slate-200 hover:border-blue-300'}`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors ${selectedClient || (isAvulso && avulsoData.name) ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-400 group-hover:bg-blue-100 group-hover:text-blue-500'}`}>
                        <Icons.User className="w-4 h-4" />
                      </div>
                      <div className="text-left">
                        <p className={`text-[10px] font-black uppercase tracking-tighter ${selectedClient || (isAvulso && avulsoData.name) ? 'text-blue-700' : 'text-slate-400'}`}>
                          {selectedClient?.name || avulsoData.name || 'Clique para Identificar'}
                        </p>
                        <p className="text-[8px] font-bold text-slate-400 uppercase">
                          {selectedClient?.phone || avulsoData.phone || 'Sem cliente vinculado'}
                        </p>
                      </div>
                    </div>
                    <div className="text-slate-300 group-hover:text-blue-400 transition-colors">
                      <Icons.View className="w-4 h-4" />
                    </div>
                  </button>

                  {isAvulso && avulsoData.address && (
                    <div className="px-3 py-2 bg-slate-50 rounded-xl border border-slate-100 flex items-start gap-2">
                      <div className="mt-0.5 text-slate-400"><Icons.MapPin className="w-3 h-3" /></div>
                      <p className="text-[8px] font-bold text-slate-500 uppercase leading-tight line-clamp-2">{avulsoData.address}</p>
                    </div>
                  )}
                </div>
              )}

              {/* HIDE REDUNDANT "Forma de Recebimento" button - Removed as per user request */}

            </div>
          </div>

          <div className="flex-1 min-h-0 p-4 lg:p-6 xl:p-8 space-y-3 xl:space-y-4 font-receipt text-[11px] overflow-y-auto custom-scrollbar">
            {groupedCart.length > 0 ? groupedCart.map(([id, data]) => (
              <div key={id} className={`flex justify-between items-center border-b border-dotted pb-2 ${(currentOrderStatus === OrderStatus.PREPARING || currentOrderStatus === OrderStatus.PARTIALLY_READY) ? 'animate-moderate-blink text-orange-600' : ''}`}>
                <div className="flex-1">
                  <p className="font-black uppercase text-slate-800">{data.product?.name || '...'}</p>
                  <p className="text-slate-400 font-bold">{data.quantity} x R$ {data.price.toFixed(2)}</p>
                </div>
                {!editingOrderId && !isReceivingFiado && (
                  <button onClick={() => {
                    setCart(prev => {
                      const idx = prev.findLastIndex(it => it.productId === id);
                      if (idx === -1) return prev;
                      const next = [...prev];
                      next.splice(idx, 1);
                      return next;
                    });
                  }} className="text-red-300 font-black px-2 hover:text-red-500 transition-colors" title="Remover 1 Unid.">×</button>
                )}
              </div>
            )) : (
              <div className="h-full flex flex-col items-center justify-center text-slate-300 opacity-50 italic text-center">
                <p>Terminal Pronto para Venda</p>
              </div>
            )}
          </div>

          <div className="p-4 lg:p-6 xl:p-8 bg-slate-50 border-t border-slate-100 shrink-0">
            {saleType === SaleType.OWN_DELIVERY && (
              <div className="flex justify-between items-center mb-3 bg-blue-50/50 p-3 rounded-2xl border border-blue-100/50">
                <span className="text-[10px] font-black text-blue-600/60 uppercase tracking-widest">Taxa de Entrega</span>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-black text-blue-600/40">R$</span>
                  <input
                    type="number"
                    step="0.01"
                    value={deliveryFeeValue}
                    onChange={(e) => setManualDeliveryFee(parseFloat(e.target.value) || 0)}
                    className="w-20 bg-transparent border-b border-blue-200 focus:border-blue-600 outline-none text-right font-black text-blue-600 text-sm"
                  />
                </div>
              </div>
            )}
            {saleType === SaleType.TABLE && businessSettings?.serviceFeeStatus && (
              <div className="flex flex-col gap-2 mb-4 bg-slate-50 p-4 rounded-3xl border border-slate-100/50">
                <div className="flex justify-between items-center bg-white p-3 rounded-2xl border border-slate-100">
                  <div>
                    <span className="text-[10px] font-black text-slate-600 uppercase tracking-widest block">Taxa Serviço {businessSettings.serviceFeePercentage}%</span>
                    <span className="text-[8px] font-bold text-slate-400 uppercase">Opcional</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-black text-slate-800">
                      + R$ {(cart.reduce((acc, item) => acc + (item.price * item.quantity), 0) * (businessSettings.serviceFeePercentage || 10) / 100).toFixed(2)}
                    </span>
                    <button
                      type="button"
                      className={`w-10 h-6 rounded-full transition-all relative ${isServiceFeeAccepted ? 'bg-emerald-500' : 'bg-slate-200'}`}
                      onClick={() => setIsServiceFeeAccepted(!isServiceFeeAccepted)}
                    >
                      <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${isServiceFeeAccepted ? 'left-5' : 'left-1'}`}></div>
                    </button>
                  </div>
                </div>
              </div>
            )}

            <div className="flex justify-between items-end mb-3 xl:mb-6 font-receipt mt-2">
              <span className="font-black text-slate-400 uppercase text-[10px] tracking-widest">VALOR FINAL</span>
              <span className="text-2xl xl:text-4xl font-black text-blue-600 tracking-tighter">R$ {cartTotal.toFixed(2)}</span>
            </div>

            {saleType === SaleType.TABLE && tableNumberInput && (
              <div className="flex gap-2 mb-2">
                {/* Hide Launch button if we are in the payment phase (table is in billing or has a ready order) */}
                {!editingOrderId && !pendingTables.some(t => t.tableNumber === parseInt(tableNumberInput)) && (
                  <button
                    onClick={handleLaunchToTable}
                    disabled={cart.length === 0 || !activeCashSession}
                    className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white font-black py-3 xl:py-4 rounded-xl xl:rounded-2xl shadow-xl uppercase text-[9px] xl:text-[10px] tracking-widest transition-all active:scale-95 disabled:opacity-30"
                  >
                    Lançar na Mesa
                  </button>
                )}
                <button
                  onClick={handleReopenTable}
                  disabled={!!isReceivingFiado}
                  className="flex-1 bg-amber-500 hover:bg-amber-600 text-white font-black py-3 xl:py-4 rounded-xl xl:rounded-2xl shadow-xl uppercase text-[9px] xl:text-[10px] tracking-widest transition-all active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  Reabrir a Mesa
                </button>
              </div>
            )}

            <button
              onClick={() => {
                if (!activeCashSession) {
                  return showAlert("Caixa Fechado", "Você deve abrir o caixa antes de realizar recebimentos.", "DANGER");
                }
                handleFinalize();
              }}
              disabled={cart.length === 0 || (saleType === SaleType.TABLE && !tableNumberInput)}
              className={`w-full text-white font-black py-4 xl:py-5 rounded-xl xl:rounded-2xl shadow-xl uppercase text-[10px] tracking-widest transition-all active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed ${((saleType === SaleType.COUNTER && !editingOrderId) || (saleType === SaleType.OWN_DELIVERY && !isReceivingFiado)) ? 'bg-orange-500 hover:bg-orange-600' : 'bg-blue-600 hover:bg-blue-700'
                }`}
            >
              {((saleType === SaleType.COUNTER && !editingOrderId) || (saleType === SaleType.OWN_DELIVERY && !isReceivingFiado)) ? 'Enviar p/ Produção' : 'Finalizar e Receber'}
            </button>

            {editingOrderId && (
              <button onClick={() => clearState()} className="w-full mt-2 text-slate-400 font-black uppercase text-[10px] tracking-widest hover:text-slate-600 transition-colors">
                {isReceivingFiado ? 'Limpar / Devolver p/ Lista' : 'Limpar Seleção'}
              </button>
            )}

            {/* ATALHO DIRETO PARA PAGAMENTO (Requisitado: Somente Delivery) */}
            {(!editingOrderId && cart.length > 0 && saleType === SaleType.OWN_DELIVERY && !isReceivingFiado) && (
              <button
                onClick={() => {
                  setIsPaymentModalOpen(true);
                }}
                className="w-full mt-3 bg-slate-100 hover:bg-slate-200 text-slate-600 py-4 xl:py-5 rounded-xl xl:rounded-2xl shadow-sm uppercase text-[10px] font-black tracking-widest transition-all active:scale-95 flex flex-col items-center justify-center gap-1"
              >
                <span>Realizar Pagamento</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* MODAL DE OBSERVAÇÃO PARA CARRINHO */}
      {
        selectedProductForCart !== null && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in zoom-in duration-200">
            <div className="bg-white rounded-[2rem] shadow-2xl p-8 w-full max-w-sm border border-white/20">
              <h3 className="text-lg font-black text-slate-800 uppercase mb-2 tracking-tighter text-center">Adicionar ao Carrinho</h3>
              <p className="text-center text-[10px] font-bold text-slate-400 uppercase mb-6">{selectedProductForCart.name}</p>
              <div className="space-y-6">
                <div>
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 block">Deseja adicionar alguma observação?</label>
                  <input autoFocus type="text" placeholder="Ex: Sem sal, bem passado..." value={cartObservation} onChange={(e) => setCartObservation(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && confirmAddToCart()} className="w-full p-4 bg-slate-100 rounded-2xl border-none focus:ring-2 focus:ring-blue-600 font-bold text-sm outline-none placeholder:font-normal" maxLength={60} />
                </div>
                <div className="flex gap-2">
                  <button onClick={() => setSelectedProductForCart(null)} className="flex-1 py-4 font-black text-[10px] uppercase text-slate-400 hover:text-slate-600 transition-colors">Cancelar</button>
                  <button onClick={confirmAddToCart} className="flex-1 py-4 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-black text-[10px] uppercase shadow-xl hover:shadow-blue-200 transition-all active:scale-95">Adicionar ✓</button>
                </div>
              </div>
            </div>
          </div>
        )
      }

      {
        printingOrder && businessSettings && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-md">
            <div className="relative w-full max-w-[80mm] bg-white p-8 border border-dashed shadow-2xl font-receipt text-[11px] text-black is-receipt animate-in zoom-in duration-200">
              {isNfceVisual ? (
                // NFC-e (DANFE) Layout - Redesigned to match image
                <div className="space-y-4 font-mono text-[10px] leading-tight text-black">
                  <div className="text-center space-y-1">
                    <p className="font-bold">CNPJ - {businessSettings.cnpj} - {businessSettings.name?.toUpperCase()}</p>
                    <p className="uppercase">{businessSettings.address}</p>
                    <p className="uppercase">Loja: 001 PDV: 001 VD: {printingOrder.id.substring(0, 6)} OPERADOR: {currentUser.name?.toUpperCase()}</p>
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
                          return (
                            <tr key={id} className="uppercase">
                              <td>{ncmCode.substring(0, 6)}</td>
                              <td>{data.product?.name.substring(0, 20)}</td>
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
                    <div className="flex justify-between">
                      <span className="uppercase">{printingOrder.paymentMethod || 'OUTROS'}</span>
                      <span>{printingOrder.total.toFixed(2)}</span>
                    </div>
                    {printingOrder.appliedServiceFee && printingOrder.appliedServiceFee > 0 ? (
                      <div className="flex justify-between italic">
                        <span>TAXA SERVICO R$</span>
                        <span>{printingOrder.appliedServiceFee.toFixed(2)}</span>
                      </div>
                    ) : null}
                  </div>

                  <div className="text-center space-y-1 border-t border-dashed border-black pt-2">
                    <p className="font-bold">NFCe: {printingOrder.nfeNumber?.split('-')[1] || '000001'} Ser: 001 Emi: {new Date(printingOrder.createdAt).toLocaleDateString('pt-BR')} {new Date(printingOrder.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</p>
                    <p>Consulte pela chave de acesso em</p>
                    <p className="text-[8px] underline">www.nfce.sefaz.ba.gov.br/portal/consultaNFCe.jsp</p>
                    <p className="text-[9px] font-bold break-all">35240212345678000190650010000000011000000012</p>
                  </div>

                  <div className="text-center space-y-1 border-t border-dashed border-black pt-2">
                    <p className="font-bold">{!printingOrder.clientName || printingOrder.clientName === 'Consumidor' || printingOrder.clientName === 'Consumidor Padrão' ? 'CONSUMIDOR NAO INFORMADO' : `CLIENTE: ${printingOrder.clientName?.toUpperCase()}`}</p>
                    {printingOrder.clientDocument && <p className="font-bold">CPF/CNPJ: {printingOrder.clientDocument}</p>}
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
                    <p className="text-[9px] font-bold mt-1 uppercase">Comprovante de Pagamento</p>
                  </div>
                  <div className="space-y-1 mb-4 text-[10px] bg-slate-50 p-2 rounded-lg border border-slate-100">
                    <p className="text-[8px] font-black text-slate-400 uppercase mb-1">Dados do Cliente</p>
                    <p className="font-bold">CLIENTE: {printingOrder.clientName?.toUpperCase() || 'NAO INFORMADO'}</p>
                    {printingOrder.clientDocument && <p>CPF/CNPJ: {printingOrder.clientDocument}</p>}
                    {printingOrder.clientEmail && <p>E-MAIL: {printingOrder.clientEmail.toLowerCase()}</p>}
                    {printingOrder.clientPhone && <p>FONE: {printingOrder.clientPhone}</p>}
                    {printingOrder.clientAddress && (
                      <p className="font-bold border-t border-dashed border-slate-200 mt-2 pt-1 uppercase leading-tight text-blue-600">ENTREGA: {printingOrder.clientAddress}</p>
                    )}
                    {printingOrder.tableNumber && <p className="font-black">MESA: {printingOrder.tableNumber}</p>}
                    <p className="text-slate-500">MÉTODO: {printingOrder.paymentMethod || 'PENDENTE'}</p>
                  </div>
                  <div className="border-t border-dashed my-3 py-3">
                    {groupedPrintingItems.map(([id, data]) => (
                      <div key={id} className="flex justify-between font-black uppercase py-0.5">
                        <span>{data.quantity}x {data.product?.name.substring(0, 18)}</span>
                        <span>R$ {(data.quantity * data.price).toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                  {printingOrder.appliedServiceFee && printingOrder.appliedServiceFee > 0 && (
                    <div className="flex justify-between items-center border-t border-dashed pt-4 mb-2 text-[10px] uppercase font-black">
                      <span>Taxa Serviço:</span>
                      <span>R$ {printingOrder.appliedServiceFee.toFixed(2)}</span>
                    </div>
                  )}
                  <div className={`flex justify-between items-end ${(printingOrder.type === SaleType.OWN_DELIVERY || printingOrder.appliedServiceFee) ? '' : 'border-t border-dashed pt-4'} mb-6`}>
                    <span className="font-black text-[9px] uppercase tracking-widest">TOTAL:</span>
                    <span className="text-2xl font-black">R$ {printingOrder.total.toFixed(2)}</span>
                  </div>
                </>
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
        )
      }

      {/* NFC-e Feedback Overlay */}
      {
        isNfceFeedbackOpen && (
          <div className="fixed top-8 left-1/2 -translate-x-1/2 z-[200] animate-in slide-in-from-top-full duration-500">
            <div className="bg-emerald-600 text-white px-8 py-4 rounded-3xl shadow-2xl flex items-center gap-4">
              <div className="bg-white/20 p-2 rounded-xl">
                <Icons.View className="w-6 h-6" />
              </div>
              <div>
                <p className="font-black uppercase text-xs tracking-widest">NFC-e Emitida com Sucesso</p>
                <p className="text-[10px] font-bold opacity-80 uppercase">A nota fiscal foi processada e enviada para a SEFAZ.</p>
              </div>
            </div>
          </div>
        )
      }

      {/* MODAL DE AUTENTICAÇÃO DE CAIXA */}
      {
        isAuthModalOpen && (
          <div className="fixed inset-0 z-[400] flex items-center justify-center p-4 bg-slate-900/90 backdrop-blur-md animate-in zoom-in duration-300">
            <div className="bg-white rounded-[2.5rem] shadow-2xl p-8 lg:p-10 w-full max-w-sm border border-slate-200 relative overflow-hidden">
              <button
                onClick={() => { setIsAuthModalOpen(false); setUserPassword(''); }}
                className="absolute top-6 right-6 w-10 h-10 flex items-center justify-center bg-slate-50 hover:bg-red-50 text-slate-400 hover:text-red-500 rounded-full font-black text-xl transition-all"
              >
                ×
              </button>

              <div className="text-center mb-8">
                <div className="w-20 h-20 bg-indigo-50 rounded-full flex items-center justify-center mx-auto mb-6">
                  <span className="text-3xl">🔑</span>
                </div>
                <h3 className="text-xl font-black text-slate-800 uppercase tracking-tighter">Confirme sua Identidade</h3>
                <p className="text-center text-[10px] font-bold text-slate-400 uppercase mt-2">
                  {authModalAction === 'OPEN_CASH' ? 'Para abrir o caixa' : 'Para fechar o caixa'}, digite sua senha de acesso.
                </p>
              </div>

              <div className="space-y-6">
                <div>
                  <input
                    autoFocus
                    type="password"
                    placeholder="Sua senha..."
                    value={userPassword}
                    onChange={(e) => setUserPassword(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        // handle Auth Submit
                        const doAuth = async () => {
                          if (!userPassword) return showAlert("Atenção", "Digite sua senha.", "INFO");
                          try {
                            const res = await fetch(`${API_URL}/auth/verify-password`, {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ userId: currentUser.id, password: userPassword })
                            });
                            const data = await res.json();
                            if (res.ok && data.valid) {
                              setIsAuthModalOpen(false);
                              setUserPassword('');
                              if (authModalAction === 'OPEN_CASH') {
                                setIsOpeningModalOpen(true);
                                setAdminPassword('');
                                setSystemPreview(null);
                              } else {
                                setIsClosingModalOpen(true);
                              }
                            } else {
                              showAlert("Erro", data.message || "Senha incorreta.", "DANGER");
                            }
                          } catch (err) {
                            showAlert("Erro", "Falha de comunicação com servidor.", "DANGER");
                          }
                        };
                        doAuth();
                      }
                    }}
                    className="w-full p-5 bg-slate-50 rounded-2xl border-2 border-slate-100 focus:border-indigo-500 font-bold text-lg text-center outline-none placeholder:font-normal placeholder:opacity-50"
                  />
                </div>
                <button
                  onClick={async () => {
                    if (!userPassword) return showAlert("Atenção", "Digite sua senha.", "INFO");
                    try {
                      const res = await fetch(`${API_URL}/auth/verify-password`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ userId: currentUser.id, password: userPassword })
                      });
                      const data = await res.json();
                      if (res.ok && data.valid) {
                        setIsAuthModalOpen(false);
                        setUserPassword('');
                        if (authModalAction === 'OPEN_CASH') {
                          setIsOpeningModalOpen(true);
                          setAdminPassword('');
                          setSystemPreview(null);
                        } else {
                          setIsClosingModalOpen(true);
                        }
                      } else {
                        showAlert("Erro", data.message || "Senha incorreta.", "DANGER");
                      }
                    } catch (err) {
                      showAlert("Erro", "Falha de comunicação com servidor.", "DANGER");
                    }
                  }}
                  className="w-full py-5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-xl shadow-indigo-200 transition-all active:scale-95 flex justify-center items-center gap-2"
                >
                  Validar Senha ✓
                </button>
              </div>
            </div>
          </div>
        )
      }

      {/* MODAL DE ABERTURA DE CAIXA */}
      {
        isOpeningModalOpen && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-900/90 backdrop-blur-xl animate-in fade-in duration-300">
            <div className="bg-white w-[400px] rounded-[3rem] shadow-2xl overflow-hidden border border-slate-100 p-8 lg:p-10 relative">
              <button
                onClick={() => setIsOpeningModalOpen(false)}
                className="w-10 h-10 lg:w-12 lg:h-12 flex items-center justify-center bg-slate-50 rounded-full text-slate-400 hover:bg-red-50 hover:text-red-500 transition-all font-black text-xl absolute top-6 right-6"
              >
                ×
              </button>
              <div className="text-center mb-8">
                <div className="w-20 h-20 bg-blue-50 rounded-[2rem] flex items-center justify-center mx-auto mb-6">
                  <Icons.Dashboard className="w-10 h-10 text-blue-600" />
                </div>
                <h2 className="text-xl font-black text-slate-800 uppercase tracking-tighter">Abertura de Caixa</h2>
                <p className="text-[10px] font-bold text-slate-400 uppercase mt-2">Informe o saldo inicial para começar as operações</p>
              </div>

              <div className="space-y-6">
                <div>
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 block">Saldo em Dinheiro (R$)</label>
                  <input
                    autoFocus
                    type="text"
                    placeholder="0,00"
                    value={initialBalanceInput}
                    onChange={(e) => setInitialBalanceInput(e.target.value)}
                    className="w-full p-5 bg-slate-50 rounded-2xl border-2 border-slate-100 focus:border-blue-500 outline-none font-black text-xl text-center text-blue-600"
                  />
                </div>

                <button
                  onClick={handleOpenCash}
                  className="w-full py-5 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl font-black uppercase text-xs tracking-widest shadow-xl transition-all active:scale-95"
                >
                  Abrir Caixa ✓
                </button>
              </div>
            </div>
          </div>
        )
      }

      {/* MODAL DE FECHAMENTO DE CAIXA */}
      {
        isClosingModalOpen && (
          <div className="fixed inset-0 z-[300] flex items-center justify-center bg-slate-900/95 backdrop-blur-xl animate-in fade-in duration-300">
            <div className="bg-white w-[500px] max-w-[95vw] rounded-[3rem] shadow-2xl border border-slate-100 flex flex-col max-h-[95vh] relative overflow-hidden">
              <div className="p-8 border-b border-slate-50 shrink-0 relative bg-slate-50/50">
                <button
                  onClick={() => { setIsClosingModalOpen(false); setAdminPassword(''); setSystemPreview(null); }}
                  className="absolute right-6 top-6 w-10 h-10 flex items-center justify-center bg-white rounded-full text-slate-400 hover:bg-red-50 hover:text-red-500 transition-all font-black text-xl z-20 shadow-sm"
                >
                  ×
                </button>
                <div className="text-center">
                  <div className="w-16 h-16 bg-orange-100 rounded-[1.5rem] flex items-center justify-center mx-auto mb-4 text-2xl shadow-inner">💰</div>
                  <h2 className="text-2xl font-black text-slate-800 uppercase tracking-tighter">Fechamento de Caixa</h2>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Confira os valores para encerrar o expediente</p>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-8 space-y-6 custom-scrollbar">
                <div className="flex gap-2 bg-slate-100/80 p-1.5 rounded-2xl">
                  <button
                    onClick={() => { setClosingMode('MANUAL'); setSystemPreview(null); }}
                    className={`flex-1 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${closingMode === 'MANUAL' ? 'bg-white text-orange-600 shadow-md' : 'text-slate-400 hover:text-slate-600'}`}
                  >
                    Lançamento Manual
                  </button>
                  <button
                    onClick={() => { setClosingMode('SYSTEM'); setSystemPreview(null); setAdminPassword(''); }}
                    className={`flex-1 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${closingMode === 'SYSTEM' ? 'bg-white text-blue-600 shadow-md' : 'text-slate-400 hover:text-slate-600'}`}
                  >
                    Pelo Sistema
                  </button>
                </div>

                {closingMode === 'SYSTEM' && (
                  <div className="p-5 bg-blue-50/50 rounded-3xl border-2 border-dashed border-blue-200 animate-in slide-in-from-top-4 duration-500">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-10 h-10 bg-blue-600 text-white rounded-xl flex items-center justify-center font-black text-lg shadow-lg shadow-blue-200">!</div>
                      <div>
                        <p className="text-[10px] font-black text-blue-800 uppercase tracking-tight">Autorização Necessária</p>
                        <p className="text-[8px] font-bold text-blue-400 uppercase">Apenas Admin Master pode autorizar</p>
                      </div>
                    </div>
                    <div className="flex flex-col sm:flex-row gap-2">
                      <input
                        type="password"
                        placeholder="Senha do Administrador"
                        value={adminPassword}
                        onChange={e => setAdminPassword(e.target.value)}
                        className="flex-1 p-4 bg-white border-2 border-blue-100 rounded-2xl text-xs font-black outline-none focus:border-blue-600 shadow-sm transition-all"
                      />
                      <button
                        onClick={handleSystemPreview}
                        className="w-full sm:w-auto px-6 py-4 sm:py-0 bg-blue-600 text-white rounded-2xl font-black uppercase text-[10px] tracking-widest hover:bg-blue-700 transition-all shadow-xl active:scale-95 flex items-center justify-center"
                      >
                        GERAR
                      </button>
                    </div>
                  </div>
                )}

                {systemPreview && (
                  <div className="grid grid-cols-2 gap-4 bg-emerald-50/50 p-5 rounded-3xl border border-emerald-100 animate-in zoom-in-95 duration-300">
                    <div className="col-span-2 mb-2">
                      <p className="text-[9px] font-black text-emerald-600 uppercase tracking-widest text-center">Valores Calculados pelo Sistema</p>
                    </div>
                    {[
                      { label: 'Dinheiro', val: systemPreview.cash },
                      { label: 'PIX', val: systemPreview.pix },
                      { label: 'Crédito', val: systemPreview.credit },
                      { label: 'Débito', val: systemPreview.debit },
                      { label: 'Outros', val: systemPreview.others }
                    ].map(item => (
                      <div key={item.label} className="bg-white p-3 rounded-2xl border border-emerald-100 shadow-sm">
                        <p className="text-[8px] font-black text-slate-400 uppercase mb-1">{item.label}</p>
                        <p className="text-sm font-black text-emerald-700">R$ {item.val.toFixed(2)}</p>
                      </div>
                    ))}
                  </div>
                )}

                {/* Só mostrar os inputs e resultados se estiver no modo MANUAL ou se o PREVIEW já foi gerado no modo SYSTEM */}
                {(closingMode === 'MANUAL' || systemPreview) && (
                  <div className="space-y-4 animate-in fade-in duration-500">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest ml-1">Dinheiro (R$)</label>
                        <input
                          type="number"
                          step="0.01"
                          placeholder="0,00"
                          value={closingReport.cash}
                          onChange={(e) => setClosingReport(prev => ({ ...prev, cash: e.target.value }))}
                          className="w-full p-4 bg-slate-50 rounded-2xl border-2 border-slate-100 focus:border-orange-500 outline-none font-black text-lg text-center shadow-sm transition-all"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest ml-1">PIX (R$)</label>
                        <input
                          type="number"
                          step="0.01"
                          placeholder="0,00"
                          value={closingReport.pix}
                          onChange={(e) => setClosingReport(prev => ({ ...prev, pix: e.target.value }))}
                          className="w-full p-4 bg-slate-50 rounded-2xl border-2 border-slate-100 focus:border-orange-500 outline-none font-black text-lg text-center shadow-sm transition-all"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest ml-1">Crédito (R$)</label>
                        <input
                          type="number"
                          step="0.01"
                          placeholder="0,00"
                          value={closingReport.credit}
                          onChange={(e) => setClosingReport(prev => ({ ...prev, credit: e.target.value }))}
                          className="w-full p-4 bg-slate-50 rounded-2xl border-2 border-slate-100 focus:border-orange-500 outline-none font-black text-lg text-center shadow-sm transition-all"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest ml-1">Débito (R$)</label>
                        <input
                          type="number"
                          step="0.01"
                          placeholder="0,00"
                          value={closingReport.debit}
                          onChange={(e) => setClosingReport(prev => ({ ...prev, debit: e.target.value }))}
                          className="w-full p-4 bg-slate-50 rounded-2xl border-2 border-slate-100 focus:border-orange-500 outline-none font-black text-lg text-center shadow-sm transition-all"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <label className="text-[9px] font-black text-emerald-700 uppercase tracking-widest ml-1">Outros (R$)</label>
                        <input
                          type="number"
                          step="0.01"
                          placeholder="0,00"
                          value={closingReport.others}
                          onChange={(e) => setClosingReport(prev => ({ ...prev, others: e.target.value }))}
                          className="w-full p-4 bg-emerald-50 rounded-2xl border-2 border-emerald-100 focus:border-emerald-500 outline-none font-black text-lg text-center text-emerald-600 shadow-sm transition-all"
                        />
                      </div>
                      <div className="space-y-1 text-right pt-4 flex flex-col justify-end">
                        <p className="text-[9px] font-black text-slate-300 uppercase tracking-widest">Total Informado</p>
                        <p className="text-2xl font-black text-slate-700 tracking-tighter">R$ {(Number(closingReport.cash || 0) + Number(closingReport.pix || 0) + Number(closingReport.credit || 0) + Number(closingReport.debit || 0) + Number(closingReport.others || 0)).toFixed(2)}</p>
                      </div>
                    </div>

                    <div className="pt-2">
                      <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest ml-1 mb-1 block">Notas / Observações</label>
                      <textarea
                        placeholder="Alguma observação relevante sobre o fechamento..."
                        value={closingReport.observations}
                        onChange={(e) => setClosingReport(prev => ({ ...prev, observations: e.target.value }))}
                        className="w-full p-4 bg-slate-50 rounded-2xl border-2 border-slate-100 focus:border-orange-500 outline-none font-bold text-xs custom-scrollbar"
                        rows={2}
                      />
                    </div>
                  </div>
                )}
              </div>

              <div className="p-8 bg-slate-50 border-t border-slate-100 shrink-0 flex gap-4">
                <button
                  onClick={() => { setIsClosingModalOpen(false); setAdminPassword(''); setSystemPreview(null); }}
                  className="flex-1 py-5 font-black uppercase text-[10px] tracking-widest text-slate-400 hover:text-slate-600 transition-all active:scale-95"
                >
                  CANCELAR
                </button>
                <button
                  onClick={handleCloseCash}
                  className="flex-[2] py-5 bg-orange-600 hover:bg-orange-700 text-white rounded-[1.5rem] font-black uppercase text-xs tracking-widest shadow-xl shadow-orange-100 transition-all active:scale-95 flex items-center justify-center gap-3"
                >
                  ENCERRAR CAIXA ✓
                </button>
              </div>
            </div>
          </div>
        )
      }

      {/* MODAL DE REVISÃO E RELATÓRIO DE CAIXA */}
      {
        isReviewModalOpen && reviewSession && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-900/40 animate-in fade-in duration-300 p-4 print-modal print:bg-white print:static print:transform-none">
            <div className="bg-white w-full max-w-[900px] border border-slate-300 shadow-xl flex flex-col max-h-[95vh] print:max-h-none print:h-auto print:shadow-none print:border-none print:w-full print:m-0 rounded-3xl print:rounded-none">
              <div className="flex-1 p-6 lg:p-8 space-y-6 overflow-y-auto print:overflow-visible">
                {/* Formal Header */}
                <div className="border-b border-slate-900 pb-4">
                  <div className="flex justify-between items-start mb-4">
                    <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Relatório de Fechamento de Caixa</h1>
                    <button
                      onClick={() => {
                        setIsReviewModalOpen(false);
                        setReviewSession(null);
                        setAdminPassword('');
                        setClosingReport({ cash: '', pix: '', credit: '', debit: '', others: '', observations: '' });
                      }}
                      className="w-10 h-10 flex items-center justify-center bg-slate-100 rounded-full text-slate-400 hover:bg-red-50 hover:text-red-500 transition-all text-xl print:hidden"
                    >
                      ×
                    </button>
                  </div>

                  <div className="grid grid-cols-2 gap-4 text-xs font-medium text-slate-700">
                    <div className="space-y-2">
                      <div className="flex justify-between border-b border-slate-100 pb-1">
                        <span className="text-slate-400 uppercase tracking-wider text-[10px]">Estabelecimento</span>
                        <span className="font-bold">{businessSettings?.name || 'Fast Food Express'}</span>
                      </div>
                      <div className="flex justify-between border-b border-slate-100 pb-1">
                        <span className="text-slate-400 uppercase tracking-wider text-[10px]">Identificador</span>
                        <span className="font-bold font-mono">{reviewSession.id.substring(0, 8).toUpperCase()}</span>
                      </div>
                      <div className="flex justify-between border-b border-slate-100 pb-1">
                        <span className="text-slate-400 uppercase tracking-wider text-[10px]">Operador Responsável</span>
                        <span className="font-bold">{reviewSession.closedByName}</span>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <div className="flex justify-between border-b border-slate-100 pb-1">
                        <span className="text-slate-400 uppercase tracking-wider text-[10px]">Data do Fechamento</span>
                        <span className="font-bold">{new Date(reviewSession.closedAt || Date.now()).toLocaleDateString('pt-BR')}</span>
                      </div>
                      <div className="flex justify-between border-b border-slate-100 pb-1">
                        <span className="text-slate-400 uppercase tracking-wider text-[10px]">Horário</span>
                        <span className="font-bold">{new Date(reviewSession.closedAt || Date.now()).toLocaleTimeString('pt-BR')}</span>
                      </div>
                      <div className="flex justify-between border-b border-slate-100 pb-1">
                        <span className="text-slate-400 uppercase tracking-wider text-[10px]">Status</span>
                        <span className="font-bold text-emerald-700">FECHADO</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Values Table */}
                <div className="space-y-2">
                  <h3 className="text-[11px] font-bold text-slate-400 uppercase tracking-widest px-2">Detalhamento por Categoria</h3>
                  <div className="border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                    <table className="w-full border-collapse">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200">
                          <th className="py-2 px-4 text-left text-[11px] font-bold uppercase tracking-widest text-slate-600">Categoria de Recebimento</th>
                          <th className="py-2 px-4 text-right text-[11px] font-bold uppercase tracking-widest text-slate-600">Valor Total Informado</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 italic">
                        <tr className="hover:bg-slate-50 transition-colors">
                          <td className="py-3 px-4 text-sm font-semibold text-slate-700">Dinheiro em Espécie</td>
                          <td className="py-3 px-4 text-right text-base font-bold text-slate-900 border-l border-slate-50">R$ {reviewSession.reportedCash.toFixed(2)}</td>
                        </tr>
                        <tr className="hover:bg-slate-50 transition-colors">
                          <td className="py-3 px-4 text-sm font-semibold text-slate-700">Pagamentos via PIX</td>
                          <td className="py-3 px-4 text-right text-base font-bold text-slate-900 border-l border-slate-50">R$ {reviewSession.reportedPix.toFixed(2)}</td>
                        </tr>
                        <tr className="hover:bg-slate-50 transition-colors">
                          <td className="py-3 px-4 text-sm font-semibold text-slate-700">Cartão de Crédito</td>
                          <td className="py-3 px-4 text-right text-base font-bold text-slate-900 border-l border-slate-50">R$ {reviewSession.reportedCredit.toFixed(2)}</td>
                        </tr>
                        <tr className="hover:bg-slate-50 transition-colors">
                          <td className="py-3 px-4 text-sm font-semibold text-slate-700">Cartão de Débito</td>
                          <td className="py-3 px-4 text-right text-base font-bold text-slate-900 border-l border-slate-50">R$ {(reviewSession.reportedDebit || 0).toFixed(2)}</td>
                        </tr>
                        <tr className="bg-slate-50/80 hover:bg-slate-100 transition-colors border-t border-slate-200">
                          <td className="py-3 px-4 text-sm font-bold text-slate-600 italic">Outras Categorias</td>
                          <td className="py-3 px-4 text-right text-base font-bold text-slate-800 border-l border-slate-50">R$ {(reviewSession.reportedOthers || 0).toFixed(2)}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Summary Section */}
                <div className="grid grid-cols-2 gap-4 pt-2">
                  <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 flex flex-col justify-center">
                    <span className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-1">Total Consolidado</span>
                    <span className="text-3xl font-bold text-slate-900 tracking-tight italic">R$ {((reviewSession.reportedCash || 0) + (reviewSession.reportedPix || 0) + (reviewSession.reportedCredit || 0) + (reviewSession.reportedDebit || 0) + (reviewSession.reportedOthers || 0)).toFixed(2)}</span>
                  </div>

                  <div className={`border rounded-2xl p-4 flex flex-col justify-center ${reviewSession.difference === 0 ? 'bg-white border-slate-300' : 'bg-white border-slate-900 border-2'}`}>
                    <div>
                      <span className="text-[11px] font-bold uppercase tracking-widest text-slate-500">Diferença vs Sistema</span>
                      <div className="text-[10px] font-bold uppercase mt-1 tracking-wider">
                        {reviewSession.difference === 0 ? 'Conformidade de Caixa' : (reviewSession.difference > 0 ? 'Excedente (Sobra)' : 'Ajuste (Falta)')}
                      </div>
                    </div>
                    <span className="text-2xl font-bold text-slate-900 mt-1 italic">R$ {reviewSession.difference.toFixed(2)}</span>
                  </div>
                </div>

                {/* Informações Complementares Section */}
                {((reviewSession.systemFiado || 0) > 0 || (reviewSession.orphanSales || 0) > 0) && (
                  <div className="space-y-4">
                    <h4 className="text-[11px] font-bold text-slate-400 uppercase tracking-widest px-2">Informações Complementares</h4>
                    <div className="grid grid-cols-2 gap-4">
                      {(reviewSession.systemFiado || 0) > 0 && (
                        <div className="flex justify-between items-center bg-white px-6 py-4 rounded-2xl border border-slate-200">
                          <span className="text-[11px] font-semibold text-slate-600 uppercase">Vendas a Prazo (FIADO)</span>
                          <span className="text-base font-bold text-slate-800">R$ {reviewSession.systemFiado!.toFixed(2)}</span>
                        </div>
                      )}
                      {(reviewSession.orphanSales || 0) > 0 && (
                        <div className="flex justify-between items-center bg-white px-6 py-4 rounded-2xl border border-slate-900">
                          <div className="flex flex-col">
                            <span className="text-[11px] font-bold text-slate-900 uppercase">Vendas sem Sessão Aberta</span>
                            <span className="text-[10px] text-slate-500 font-medium italic">Ocorridas antes da abertura oficial</span>
                          </div>
                          <span className="text-base font-bold text-slate-900">R$ {reviewSession.orphanSales!.toFixed(2)}</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {reviewSession.observations && (
                  <div className="space-y-3 pb-4">
                    <h4 className="text-[11px] font-bold text-slate-400 uppercase tracking-widest px-2">Notas e Observações do Operador</h4>
                    <div className="bg-slate-50 p-6 rounded-2xl border border-slate-200">
                      <p className="text-sm text-slate-700 italic leading-relaxed">{reviewSession.observations}</p>
                    </div>
                  </div>
                )}

                {/* Buttons Area */}
                <div className="grid grid-cols-2 gap-4 print:hidden pt-4 border-t border-slate-100">
                  <button
                    onClick={() => {
                      setClosingReport({
                        cash: String(reviewSession.reportedCash || 0),
                        pix: String(reviewSession.reportedPix || 0),
                        credit: String(reviewSession.reportedCredit || 0),
                        debit: String(reviewSession.reportedDebit || 0),
                        others: String(reviewSession.reportedOthers || 0),
                        observations: reviewSession.observations || ''
                      });
                      setIsAdjustModalOpen(true);
                    }}
                    className="bg-white border border-slate-300 text-slate-600 py-3 rounded-xl font-bold uppercase text-[11px] tracking-widest transition-all active:scale-95 flex items-center justify-center gap-3 hover:bg-slate-50 shadow-sm"
                  >
                    <Icons.Dashboard className="w-4 h-4" /> Realizar Ajustes
                  </button>
                  <button
                    onClick={() => {
                      setTimeout(() => window.print(), 100);
                    }}
                    className="bg-slate-900 text-white py-3 rounded-xl font-bold uppercase text-[11px] tracking-widest hover:bg-black active:scale-95 transition-all flex items-center justify-center gap-3 shadow-md shadow-slate-200"
                  >
                    Imprimir
                  </button>
                </div>
              </div>
            </div>
          </div>
        )
      }

      {/* MODAL DE AJUSTES E CORREÇÕES (ADMIN ONLY) */}
      {
        isAdjustModalOpen && reviewSession && (
          <div className="fixed inset-0 z-[250] flex items-center justify-center bg-slate-900/60 backdrop-blur-md animate-in fade-in duration-300 p-4">
            <div className="bg-slate-900 w-full max-w-[800px] rounded-[2.5rem] lg:rounded-[3.5rem] shadow-2xl overflow-hidden border border-slate-700 flex flex-col max-h-[90vh]">
              <div className="p-6 lg:p-10 text-white overflow-y-auto">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6 lg:mb-10 relative">
                  <div className="pr-12">
                    <h3 className="text-xl lg:text-2xl font-black uppercase tracking-tighter">Ajustes e Correções</h3>
                    <p className="text-[9px] lg:text-[10px] font-bold text-slate-400 uppercase mt-1 tracking-widest">Apenas Administrador Master</p>
                  </div>
                  <button
                    onClick={() => setIsAdjustModalOpen(false)}
                    className="w-10 h-10 lg:w-12 lg:h-12 flex items-center justify-center bg-white/10 rounded-full text-slate-400 hover:bg-red-500 hover:text-white transition-all font-black text-xl absolute top-0 right-0 sm:static"
                  >
                    ×
                  </button>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-8 mb-8">
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Corrigir Dinheiro</label>
                        <input
                          type="text"
                          className="w-full bg-white/10 border border-white/20 p-4 rounded-2xl font-black text-center text-blue-400 focus:bg-white/20 transition-all outline-none"
                          value={closingReport.cash}
                          onChange={e => setClosingReport(prev => ({ ...prev, cash: e.target.value.replace(',', '.') }))}
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Corrigir Pix</label>
                        <input
                          type="text"
                          className="w-full bg-white/10 border border-white/20 p-4 rounded-2xl font-black text-center text-blue-400 focus:bg-white/20 transition-all outline-none"
                          value={closingReport.pix}
                          onChange={e => setClosingReport(prev => ({ ...prev, pix: e.target.value.replace(',', '.') }))}
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Corrigir Crédito</label>
                        <input
                          type="text"
                          className="w-full bg-white/10 border border-white/20 p-4 rounded-2xl font-black text-center text-blue-400 focus:bg-white/20 transition-all outline-none"
                          value={closingReport.credit}
                          onChange={e => setClosingReport(prev => ({ ...prev, credit: e.target.value.replace(',', '.') }))}
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Corrigir Débito</label>
                        <input
                          type="text"
                          className="w-full bg-white/10 border border-white/20 p-4 rounded-2xl font-black text-center text-blue-400 focus:bg-white/20 transition-all outline-none"
                          value={closingReport.debit}
                          onChange={e => setClosingReport(prev => ({ ...prev, debit: e.target.value.replace(',', '.') }))}
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-1 gap-4">
                      <div className="space-y-2">
                        <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Corrigir Outros (Permuta/Fiado)</label>
                        <input
                          type="text"
                          className="w-full bg-white/10 border border-white/20 p-4 rounded-2xl font-black text-center text-emerald-400 focus:bg-white/20 transition-all outline-none"
                          value={closingReport.others}
                          onChange={e => setClosingReport(prev => ({ ...prev, others: e.target.value.replace(',', '.') }))}
                        />
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col gap-4 justify-between">
                    <div className="space-y-2">
                      <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Nova Observação</label>
                      <textarea
                        className="w-full bg-white/10 border border-white/20 p-4 rounded-2xl font-bold text-xs min-h-[100px] outline-none"
                        value={closingReport.observations}
                        onChange={e => setClosingReport(prev => ({ ...prev, observations: e.target.value }))}
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[9px] font-black text-blue-400 uppercase tracking-widest">Senha Admin Master</label>
                      <input
                        type="password"
                        className="w-full bg-blue-600/20 border border-blue-500/30 p-4 rounded-2xl font-black text-center text-blue-400 outline-none"
                        placeholder="••••••••"
                        value={adminPassword}
                        onChange={e => setAdminPassword(e.target.value)}
                      />
                    </div>
                  </div>
                </div>

                <div className="flex gap-4">
                  <button
                    onClick={handleSaveReview}
                    className="flex-1 py-5 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl font-black uppercase text-xs tracking-widest shadow-xl transition-all active:scale-95"
                  >
                    Salvar Correções ✓
                  </button>
                </div>
              </div>
            </div>
          </div>
        )
      }


      {/* MODAL DE MENSAGENS / FEEDBACK (SIDEBAR) */}
      {
        showFeedbacks && (
          <div className="fixed inset-0 z-[120] flex items-center justify-end p-4 bg-slate-900/60 backdrop-blur-sm">
            <div className="absolute inset-0" onClick={() => setShowFeedbacks(false)} />
            <div className="bg-white rounded-[3rem] shadow-2xl w-full max-w-md h-[95vh] flex flex-col overflow-hidden animate-in slide-in-from-right duration-300 relative border-l border-white/20">
              <div className="p-8 border-b bg-indigo-50 flex justify-between items-center">
                <div>
                  <h3 className="text-xl font-black text-indigo-900 uppercase tracking-tighter">Mensagens dos Clientes</h3>
                  <p className="text-[9px] font-bold text-indigo-400 uppercase tracking-widest">Feedbacks e Sugestões do dia</p>
                </div>
                <button
                  onClick={() => setShowFeedbacks(false)}
                  className="p-3 bg-white text-slate-400 rounded-2xl hover:text-slate-600 transition-all shadow-sm"
                >
                  ✕
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-6 space-y-4">
                {feedbacks.length > 0 ? (
                  feedbacks.map((fb, i) => (
                    <div key={fb.id || i} className="bg-slate-50 border border-slate-100 p-5 rounded-[2rem] shadow-sm animate-in fade-in slide-in-from-bottom-2" style={{ animationDelay: `${i * 50}ms` }}>
                      <div className="flex justify-between items-start mb-3">
                        <div className="flex items-center gap-2">
                          <div className="bg-indigo-600 text-white w-8 h-8 rounded-xl flex items-center justify-center text-[10px] font-black">M{fb.tableNumber}</div>
                          <span className="text-xs font-black text-slate-800 uppercase tracking-tight">{fb.name || 'Cliente Anônimo'}</span>
                        </div>
                        <span className="text-[8px] font-bold text-slate-400 uppercase">
                          {fb.createdAt ? new Date(fb.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--:--'}
                        </span>
                      </div>
                      <p className="text-sm font-bold text-slate-600 leading-relaxed bg-white/50 p-4 rounded-2xl border border-slate-50 italic">
                        "{fb.message}"
                      </p>
                    </div>
                  ))
                ) : (
                  <div className="h-full flex flex-col items-center justify-center text-center p-12 space-y-4">
                    <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center text-slate-300">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                      </svg>
                    </div>
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Nenhuma mensagem recebida hoje.</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )
      }
    </div >
  );
};

export default POS;
