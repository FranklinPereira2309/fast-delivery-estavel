
import React, { useState, useEffect, useMemo } from 'react';
import { Product, OrderItem, SaleType, Order, OrderStatus, OrderStatusLabels, User, Client, DeliveryDriver, TableSession, CashSession } from '../types';
import { db, BusinessSettings } from '../services/db';
import { socket } from '../services/socket';
import { Icons, PLACEHOLDER_FOOD_IMAGE, formatImageUrl } from '../constants';
import CustomAlert from '../components/CustomAlert';
import { validateEmail, validateCPF, validateCNPJ, maskPhone, maskDocument, validateCreditCard, getCardBrand, maskCardNumber, maskExpiry, toTitleCase } from '../services/validationUtils';

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
    address: '',
    cep: '',
    email: '',
    document: ''
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
  const [isLoadingOrder, setIsLoadingOrder] = useState(false);
  const [manualDeliveryFee, setManualDeliveryFee] = useState<number | null>(null);
  const [currentOrderStatus, setCurrentOrderStatus] = useState<OrderStatus | null>(null);

  const [isClientModalOpen, setIsClientModalOpen] = useState(false);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [isSplitPayment, setIsSplitPayment] = useState(false);
  const [paymentMethod2, setPaymentMethod2] = useState<string>('');
  const [splitAmount1, setSplitAmount1] = useState<string>('');
  const [emitNfce, setEmitNfce] = useState<boolean>(false);
  const [isNfceFeedbackOpen, setIsNfceFeedbackOpen] = useState(false);
  const [isNfceVisual, setIsNfceVisual] = useState(false);
  const [paymentData, setPaymentData] = useState({
    receivedAmount: '',
    cardHolder: '',
    cardNumber: '',
    cardExpiry: '',
    cardCVV: '',
    pixStatus: 'idle' as 'idle' | 'generating' | 'waiting' | 'paid'
  });
  const [alertConfig, setAlertConfig] = useState<{ isOpen: boolean, title: string, message: string, onConfirm: () => void, type: 'INFO' | 'DANGER' }>({
    isOpen: false, title: '', message: '', onConfirm: () => { }, type: 'INFO'
  });

  const [errors, setErrors] = useState<Record<string, boolean>>({});

  const [activeCashSession, setActiveCashSession] = useState<CashSession | null>(null);
  const [isOpeningModalOpen, setIsOpeningModalOpen] = useState(false);
  const [isClosingModalOpen, setIsClosingModalOpen] = useState(false);
  const [initialBalanceInput, setInitialBalanceInput] = useState('0.00');
  const [closingReport, setClosingReport] = useState({
    cash: '',
    pix: '',
    credit: '',
    debit: '',
    observations: ''
  });

  const showAlert = (title: string, message: string, type: 'INFO' | 'DANGER' = 'INFO') => {
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

    return () => {
      clearInterval(interval);
      socket.off('newOrder', handleRealtimeUpdate);
      socket.off('tableStatusChanged', handleRealtimeUpdate);
      socket.off('orderStatusChanged', handleRealtimeUpdate);
    };
  }, []);

  const refreshAllData = async () => {
    const [p, o, s, c, ts, cs] = await Promise.all([
      db.getProducts(),
      db.getOrders(),
      db.getSettings(),
      db.getClients(),
      db.getTableSessions(),
      db.getActiveCashSession()
    ]);
    setProducts(p);
    setOrders(o);
    setBusinessSettings(s);
    setClients(c);
    setPendingTables(ts.filter(t => t.status === 'billing'));
    setPendingCounterOrders(o.filter(order => order.type === SaleType.COUNTER && order.status === OrderStatus.READY));
    setActiveCashSession(cs);

    // Se não houver caixa aberto, forçar abertura
    if (!cs && !isOpeningModalOpen) {
      setIsOpeningModalOpen(true);
    }
  };

  const confirmAddToCart = () => {
    if (!selectedProductForCart) return;
    const product = selectedProductForCart;

    if (editingOrderId) {
      setSelectedProductForCart(null);
      return showAlert("Ação Bloqueada", "Não é possível adicionar itens a um pedido pronto que está sendo recebido.", "DANGER");
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
        await db.updateOrderStatus(tableOrder.id, OrderStatus.REOPENED, currentUser!);
        // UPDATE LOCAL ORDERS STATE
        setOrders(prev => prev.map(o => o.id === tableOrder.id ? { ...o, status: OrderStatus.REOPENED } : o));
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
    const total = cartTotal;

    if (!isSplitPayment) {
      if (paymentMethod === 'DINHEIRO') {
        const received = parseFloat(paymentData.receivedAmount);
        if (isNaN(received) || received < total) {
          return showAlert("Valor Insuficiente", "O valor recebido deve ser igual ou maior que o total.", "DANGER");
        }
      }

      if (paymentMethod === 'CRÉDITO' || paymentMethod === 'DÉBITO') {
        if (!validateCreditCard(paymentData.cardNumber)) {
          return showAlert("Cartão Inválido", "O número do cartão informado é inválido.", "DANGER");
        }
        if (!paymentData.cardExpiry || paymentData.cardExpiry.length < 5) {
          return showAlert("Validade Inválida", "Informe a validade do cartão (MM/AA).", "DANGER");
        }
      }
    } else {
      const am1 = parseFloat(splitAmount1) || 0;
      const am2 = total - am1;

      if (am1 <= 0 || am1 >= total) {
        return showAlert("Valor Inválido", "O valor do primeiro pagamento deve ser maior que zero e menor que o total.", "DANGER");
      }

      if (!paymentMethod2) {
        return showAlert("Segundo Método", "Selecione a segunda forma de pagamento.", "DANGER");
      }

      // Check change for Cash in either slot
      if (paymentMethod === 'DINHEIRO') {
        const received = parseFloat(paymentData.receivedAmount);
        if (isNaN(received) || received < am1) {
          return showAlert("Valor Insuficiente", "O valor recebido em Dinheiro (Met. 1) deve ser >= " + am1.toFixed(2), "DANGER");
        }
      }

      if (paymentMethod2 === 'DINHEIRO') {
        const received = parseFloat(paymentData.receivedAmount); // Reuse receivedAmount for the cash portion
        if (isNaN(received) || received < am2) {
          return showAlert("Valor Insuficiente", "O valor recebido em Dinheiro (Met. 2) deve ser >= " + am2.toFixed(2), "DANGER");
        }
      }

      // Basic card validation if either is card
      if (paymentMethod === 'CRÉDITO' || paymentMethod === 'DÉBITO' || paymentMethod2 === 'CRÉDITO' || paymentMethod2 === 'DÉBITO') {
        if (paymentData.cardNumber && !validateCreditCard(paymentData.cardNumber)) {
          return showAlert("Cartão Inválido", "O número do cartão informado é inválido.", "DANGER");
        }
      }
    }

    await commitOrder();

    if (emitNfce) {
      setIsNfceFeedbackOpen(true);
      setTimeout(() => setIsNfceFeedbackOpen(false), 5000);
    }

    setIsPaymentModalOpen(false);
  };

  const handleFinalize = async () => {
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

    // Rule: Balcão and Delivery must have a client. Tables too if they are being finalized.
    if (!selectedClient && !avulsoData.name) {
      if (saleType === SaleType.OWN_DELIVERY) return showAlert('Identificar Cliente', 'Para Entregas, identifique o cliente.', 'INFO');
      if (saleType === SaleType.COUNTER) return showAlert('Identificar Cliente', 'Para vendas de Balcão, identifique o cliente.', 'INFO');
    }

    if (isCounterSale && !editingOrderId) {
      await commitOrder();
      return;
    }

    if (isDelivery) {
      await commitOrder();
      return;
    }

    setIsPaymentModalOpen(true);
  };

  const commitOrder = async () => {
    const isTableSale = saleType === SaleType.TABLE;
    const isCounterSale = saleType === SaleType.COUNTER;
    const isDelivery = saleType === SaleType.OWN_DELIVERY;
    const finalTableNum = isTableSale ? parseInt(tableNumberInput) : null;

    let freshTableSession = isTableSale ? ((await db.getTableSessions()).find(t => t.tableNumber === finalTableNum)) : null;
    let tableSessionToClose = isTableSale ? (freshTableSession || pendingTables.find(t => t.tableNumber === finalTableNum)) : null;

    let finalClientId = isTableSale ? (tableSessionToClose?.clientId || 'ANONYMOUS') : (isAvulso ? undefined : selectedClient?.id);
    let finalClientName = isTableSale
      ? (tableSessionToClose?.clientName || `Mesa ${finalTableNum}`)
      : (isAvulso ? avulsoData.name : (selectedClient?.name || 'Consumidor Padrão'));

    if (!isTableSale && isAvulso && avulsoData.name && avulsoData.phone) {
      try {
        const formattedPhone = avulsoData.phone.replace(/\D/g, '');
        const existingClient = clients.find(c => c.phone.replace(/\D/g, '') === formattedPhone);

        if (existingClient) {
          finalClientId = existingClient.id;
          finalClientName = existingClient.name;
        } else {
          const newClient: Client = {
            id: `CLIENT-${Date.now()}`,
            name: avulsoData.name,
            phone: avulsoData.phone,
            addresses: avulsoData.address ? [avulsoData.address] : [],
            totalOrders: 0,
            email: avulsoData.email || undefined,
            document: avulsoData.document || undefined
          };
          await db.saveClient(newClient);
          finalClientId = newClient.id;
          setClients(prev => [...prev, newClient]);
        }
      } catch (err) {
        console.error('Error auto-registering client', err);
      }
    }

    if (!finalClientId) finalClientId = 'ANONYMOUS';

    const finalAddress = isTableSale
      ? (pendingTables.find(t => t.tableNumber === finalTableNum)?.clientAddress || undefined)
      : (isAvulso ? avulsoData.address : (selectedClient?.addresses[0] || undefined));

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
      paymentMethod: isSplitPayment ? `${paymentMethod} + ${paymentMethod2}` : paymentMethod,
      driverId: existingOrder?.driverId,
      deliveryFee: (saleType === SaleType.OWN_DELIVERY) ? deliveryFeeValue : undefined,
      tableNumber: isTableSale ? finalTableNum! : undefined,
      waiterId: isTableSale ? orders.find(o => o.id === existingTableOrderId)?.waiterId : undefined,
      isOriginDigitalMenu: isTableSale ? (tableSessionToClose?.isOriginDigitalMenu || false) : false,
      nfeStatus: emitNfce ? 'EMITTED' : undefined,
      nfeNumber: emitNfce ? `NFC-${Date.now()}` : undefined,
      nfeUrl: emitNfce ? `https://sefaz.gov.br/nfce/qrcode?p=${Date.now()}` : undefined,
      splitAmount1: isSplitPayment ? parseFloat(splitAmount1.toString().replace(',', '.')) : undefined
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
    }

    clearState();
    await refreshAllData();
  };

  const clearState = () => {
    setCart([]);
    setSelectedClient(null);
    setClientSearch('');
    setTableNumber('');
    setTableNumberInput('');
    setCurrentOrderStatus(null);
    setEditingOrderId(null);
    setIsAvulso(false);
    setAvulsoData({ name: '', phone: '', address: '', cep: '', email: '', document: '' });
    setManualDeliveryFee(null);
    setIsSplitPayment(false);
    setPaymentMethod2('');
    setSplitAmount1('');
    setEmitNfce(false);
    setPaymentData({
      receivedAmount: '',
      cardHolder: '',
      cardNumber: '',
      cardExpiry: '',
      cardCVV: '',
      pixStatus: 'idle'
    });
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

  const handleCloseCash = async () => {
    if (!activeCashSession) return;

    // Validar preenchimento
    if (!closingReport.cash || !closingReport.pix || !closingReport.credit || !closingReport.debit) {
      showAlert("Atenção", "Por favor, preencha todos os campos de valores para o fechamento.", "DANGER");
      return;
    }

    try {
      const reports = {
        cash: parseFloat(closingReport.cash.toString().replace(',', '.')),
        pix: parseFloat(closingReport.pix.toString().replace(',', '.')),
        credit: parseFloat(closingReport.credit.toString().replace(',', '.')),
        debit: parseFloat(closingReport.debit.toString().replace(',', '.')),
        observations: closingReport.observations
      };

      const session = await db.closeCashSession(activeCashSession.id, reports, currentUser);
      setActiveCashSession(null);
      setIsClosingModalOpen(false);

      // Mostrar resumo
      const diff = session.difference || 0;
      const statusText = diff === 0 ? "em dia" : (diff > 0 ? `com SOBRA de R$ ${diff.toFixed(2)}` : `com FALTA de R$ ${Math.abs(diff).toFixed(2)}`);

      showAlert("Caixa Fechado", `Caixa fechado com sucesso!\nO saldo está ${statusText}.`, diff === 0 ? "INFO" : "DANGER");

      // Limpar campos
      setClosingReport({ cash: '', pix: '', credit: '', debit: '', observations: '' });
      refreshAllData();
    } catch (e: any) {
      showAlert("Erro", e.message || "Erro ao fechar o caixa", "DANGER");
    }
  };

  const handleReopenCash = async (sessionId: string) => {
    if (!currentUser || currentUser.role !== 'ADMIN') {
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
    return saleType === SaleType.OWN_DELIVERY ? itemsTotal + deliveryFeeValue : itemsTotal;
  }, [cart, saleType, deliveryFeeValue]);

  const groupedPrintingItems = useMemo(() => {
    if (!printingOrder) return [];
    const grouped: Record<string, { product: Product | undefined, quantity: number, price: number }> = {};
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
    return Object.entries(grouped);
  }, [printingOrder, products]);

  return (
    <div className="flex flex-col h-full gap-2 lg:gap-4 xl:gap-6">
      <CustomAlert {...alertConfig} onConfirm={alertConfig.onConfirm} />

      {/* Payment Selection Modal */}
      {isPaymentModalOpen && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-900/60 backdrop-blur-md animate-in fade-in duration-300">
          <div className="bg-white w-[600px] max-w-[95vw] rounded-[3rem] shadow-2xl overflow-hidden border border-slate-100 flex flex-col max-h-[90vh]">
            <div className="p-8 lg:p-10 border-b border-slate-50 shrink-0 relative">
              <button
                onClick={() => setIsPaymentModalOpen(false)}
                className="absolute right-8 top-8 w-12 h-12 flex items-center justify-center bg-slate-100 rounded-full text-slate-400 hover:bg-red-50 hover:text-red-500 transition-all font-black text-2xl z-10"
              >
                ×
              </button>
              <div className="flex items-center gap-4 mb-4 px-2">
                <button
                  onClick={() => {
                    setIsSplitPayment(!isSplitPayment);
                    if (!isSplitPayment) {
                      setPaymentMethod2('PIX');
                      setSplitAmount1((cartTotal / 2).toFixed(2));
                    }
                  }}
                  className={`text-[10px] font-black uppercase tracking-widest px-4 py-2 rounded-full transition-all ${isSplitPayment ? 'bg-blue-600 text-white shadow-md' : 'bg-slate-100 text-slate-500'}`}
                >
                  {isSplitPayment ? '✓ Pagamento Dividido' : '+ Dividir Pagamento'}
                </button>
                {isSplitPayment && <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Selecione 02 Métodos</span>}
              </div>

              <div className="grid grid-cols-4 gap-3 bg-slate-100 p-2 rounded-[2rem] mb-4">
                {[
                  { id: 'DINHEIRO', label: 'Dinheiro', icon: Icons.Dashboard },
                  { id: 'PIX', label: 'PIX', icon: Icons.QrCode },
                  { id: 'CRÉDITO', label: 'Crédito', icon: Icons.CreditCard },
                  { id: 'DÉBITO', label: 'Débito', icon: Icons.CreditCard }
                ].map(method => (
                  <button
                    key={method.id}
                    onClick={() => setPaymentMethod(method.id)}
                    className={`flex flex-col items-center gap-2 py-4 rounded-3xl transition-all ${paymentMethod === method.id ? 'bg-white text-blue-600 shadow-xl' : 'text-slate-400 hover:bg-slate-200'}`}
                  >
                    <method.icon className="w-5 h-5" />
                    <span className="text-[9px] font-black uppercase tracking-widest">{method.label}</span>
                  </button>
                ))}
              </div>

              {isSplitPayment && (
                <div className="space-y-4 animate-in slide-in-from-top-2 duration-300">
                  <div className="bg-blue-50/50 p-4 rounded-3xl border border-blue-100">
                    <label className="text-[10px] font-black text-blue-600 uppercase tracking-widest mb-2 block">Quanto no 1º Método ({paymentMethod})?</label>
                    <input
                      type="number"
                      className="w-full p-4 bg-white border-2 border-blue-100 rounded-2xl text-lg font-black outline-none focus:border-blue-500 transition-all"
                      value={splitAmount1}
                      onChange={e => setSplitAmount1(e.target.value)}
                    />
                  </div>

                  <div className="grid grid-cols-4 gap-3 bg-slate-100 p-2 rounded-[2rem]">
                    {[
                      { id: 'DINHEIRO', label: 'Dinheiro', icon: Icons.Dashboard },
                      { id: 'PIX', label: 'PIX', icon: Icons.QrCode },
                      { id: 'CRÉDITO', label: 'Crédito', icon: Icons.CreditCard },
                      { id: 'DÉBITO', label: 'Débito', icon: Icons.CreditCard }
                    ].map(method => (
                      <button
                        key={method.id}
                        onClick={() => setPaymentMethod2(method.id)}
                        className={`flex flex-col items-center gap-2 py-4 rounded-3xl transition-all ${paymentMethod2 === method.id ? 'bg-white text-blue-600 shadow-xl' : 'text-slate-400 hover:bg-slate-200'}`}
                      >
                        <method.icon className="w-5 h-5" />
                        <span className="text-[9px] font-black uppercase tracking-widest">{method.label}</span>
                      </button>
                    ))}
                  </div>
                  <div className="px-4 py-2 text-center">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                      2º Método ({paymentMethod2}): <span className="text-blue-600">R$ {(cartTotal - (parseFloat(splitAmount1) || 0)).toFixed(2)}</span>
                    </p>
                  </div>
                </div>
              )}
            </div>

            <div className="p-8 lg:p-10 overflow-y-auto">
              {/* Render Payment Details based on selection */}
              {(paymentMethod === 'DINHEIRO' || (isSplitPayment && paymentMethod2 === 'DINHEIRO')) && (
                <div className="space-y-6 animate-in zoom-in-95 duration-200 mb-6">
                  <div className="p-6 bg-blue-50/50 rounded-[2rem] border-2 border-blue-100 flex flex-col items-center justify-center">
                    <span className="text-[10px] font-black text-blue-600 uppercase tracking-widest mb-1">Total da Compra</span>
                    <span className="text-4xl font-black text-blue-700 tracking-tighter">R$ {cartTotal.toFixed(2)}</span>
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1">Valor Recebido em Dinheiro (R$)</label>
                    <input
                      type="number"
                      className="w-full p-6 bg-slate-50 border-2 border-slate-100 rounded-[2rem] text-2xl font-black outline-none focus:border-blue-500 transition-all"
                      placeholder="0,00"
                      value={paymentData.receivedAmount}
                      onChange={e => setPaymentData({ ...paymentData, receivedAmount: e.target.value })}
                      autoFocus={!isSplitPayment}
                    />
                  </div>
                  {(() => {
                    const amCash = !isSplitPayment
                      ? cartTotal
                      : (paymentMethod === 'DINHEIRO' ? parseFloat(splitAmount1) : (cartTotal - parseFloat(splitAmount1)));
                    const received = parseFloat(paymentData.receivedAmount) || 0;
                    if (received > amCash && amCash > 0) {
                      return (
                        <div className="bg-green-50 p-6 rounded-[2rem] border border-green-100 flex items-center justify-between animate-in slide-in-from-top-2">
                          <span className="text-sm font-black text-green-700 uppercase">Troco para o Cliente:</span>
                          <span className="text-2xl font-black text-green-600">R$ {(received - amCash).toFixed(2)}</span>
                        </div>
                      );
                    }
                    return null;
                  })()}
                </div>
              )}

              {(paymentMethod === 'CRÉDITO' || paymentMethod === 'DÉBITO') && (
                <div className="space-y-6 animate-in zoom-in-95 duration-200">
                  <div className="space-y-2">
                    <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1">Número do Cartão</label>
                    <div className="relative">
                      <input
                        type="text"
                        className="w-full p-6 bg-slate-50 border-2 border-slate-100 rounded-[2rem] text-xl font-black outline-none focus:border-blue-500 transition-all pr-20"
                        placeholder="0000 0000 0000 0000"
                        value={paymentData.cardNumber}
                        onChange={e => setPaymentData({ ...paymentData, cardNumber: maskCardNumber(e.target.value) })}
                      />
                      <div className="absolute right-6 top-1/2 -translate-y-1/2 bg-white px-3 py-1.5 rounded-xl border border-slate-100 text-[10px] font-black text-blue-600 shadow-sm uppercase tracking-tighter">
                        {getCardBrand(paymentData.cardNumber)}
                      </div>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1">Validade</label>
                      <input
                        type="text"
                        className="w-full p-5 bg-slate-50 border-2 border-slate-100 rounded-[2rem] text-lg font-black outline-none focus:border-blue-500 transition-all text-center"
                        placeholder="MM/AA"
                        value={paymentData.cardExpiry}
                        onChange={e => setPaymentData({ ...paymentData, cardExpiry: maskExpiry(e.target.value) })}
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1">CVV</label>
                      <input
                        type="text"
                        className="w-full p-5 bg-slate-50 border-2 border-slate-100 rounded-[2rem] text-lg font-black outline-none focus:border-blue-500 transition-all text-center"
                        placeholder="000"
                        maxLength={3}
                        value={paymentData.cardCVV}
                        onChange={e => setPaymentData({ ...paymentData, cardCVV: e.target.value.replace(/\D/g, '') })}
                      />
                    </div>
                  </div>
                </div>
              )}

              {paymentMethod === 'PIX' && (
                <div className="flex flex-col items-center py-6 animate-in zoom-in-95 duration-200">
                  <div className="w-48 h-48 bg-slate-50 rounded-[2.5rem] border-4 border-blue-50 flex items-center justify-center mb-6 relative group overflow-hidden shadow-inner">
                    <div className="text-slate-200"><Icons.QrCode className="w-24 h-24" /></div>
                    <div className="absolute inset-0 bg-white/60 backdrop-blur-sm flex items-center justify-center flex-col gap-2 p-4 text-center">
                      <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mb-2"></div>
                      <p className="text-[10px] font-black text-blue-800 uppercase leading-tight">Aguardando Pagamento em Tempo Real...</p>
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText("00020126580014BR.GOV.BCB.PIX0136123e4567-e89b-12d3-a456-42661417400052040000530398654041.005802BR5913Fast Delivery6009Sao Paulo62070503***6304E2CA");
                      showAlert("Copiado!", "Código PIX Copia e Cola copiado para a área de transferência.");
                    }}
                    className="px-8 py-4 bg-slate-100 text-slate-600 rounded-2xl font-black uppercase text-[10px] tracking-widest hover:bg-slate-200 transition-all flex items-center gap-2"
                  >
                    <Icons.View className="w-4 h-4" />
                    PIX Copia e Cola
                  </button>
                </div>
              )}
            </div>

            <div className="p-8 lg:p-10 bg-slate-50 border-t border-slate-100 shrink-0 flex flex-col gap-4">
              <div className="flex items-center justify-between px-4 py-2 bg-white rounded-2xl border border-slate-100">
                <div className="flex items-center gap-3">
                  <Icons.View className="w-5 h-5 text-blue-600" />
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-tight">Emitir NFC-e Fiscal?</p>
                    <p className="text-[8px] font-bold text-slate-400 uppercase">Nota Fiscal de Consumidor Eletrônica</p>
                  </div>
                </div>
                <button
                  onClick={() => setEmitNfce(!emitNfce)}
                  className={`w-12 h-6 rounded-full transition-all relative ${emitNfce ? 'bg-emerald-600 ring-4 ring-emerald-500/20' : 'bg-slate-200'}`}
                >
                  <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${emitNfce ? 'left-7' : 'left-1'}`}></div>
                </button>
              </div>

              <button
                onClick={processPaymentAndFinalize}
                className="w-full py-6 bg-blue-600 hover:bg-blue-700 text-white rounded-[2rem] font-black uppercase text-lg tracking-widest shadow-2xl shadow-blue-200 transition-all flex items-center justify-center gap-4 group"
              >
                <span>Finalizar Pedido</span>
                <Icons.View className="w-6 h-6 group-hover:translate-x-1 transition-transform" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Client Selection Modal */}
      {isClientModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 backdrop-blur-md animate-in fade-in duration-300">
          <div className="bg-white w-[500px] max-w-[95vw] rounded-[2.5rem] shadow-2xl overflow-hidden border border-slate-100 flex flex-col max-h-[90vh]">
            <div className="p-8 border-b border-slate-50 shrink-0">
              <div className="flex justify-between items-center mb-6">
                <div>
                  <h2 className="text-2xl font-black text-slate-800 uppercase tracking-tighter">Identificar Cliente</h2>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Venda: {getFriendlySaleType(saleType)}</p>
                </div>
                <button
                  onClick={() => setIsClientModalOpen(false)}
                  className="w-10 h-10 flex items-center justify-center bg-slate-100 rounded-full text-slate-400 hover:bg-red-50 hover:text-red-500 transition-all font-black text-xl"
                >
                  ×
                </button>
              </div>

              <div className="flex gap-2 bg-slate-100 p-1.5 rounded-2xl mb-6">
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

            <div className="p-8 overflow-y-auto">
              {!isAvulso ? (
                <div className="space-y-4">
                  <div className="relative">
                    <input
                      type="text"
                      className="w-full p-5 bg-slate-50 border-2 border-slate-100 rounded-2xl text-xs font-black uppercase tracking-widest outline-none focus:border-blue-500 transition-all"
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
                          setAvulsoData({ ...avulsoData, name: toTitleCase(e.target.value) });
                          if (errors.avulsoName) setErrors(prev => ({ ...prev, avulsoName: false }));
                        }}
                      />
                    </div>
                    <div className="w-1/3 space-y-1.5">
                      <label className={`text-[9px] font-black uppercase tracking-widest ml-1 ${errors.avulsoPhone ? 'text-red-500' : 'text-slate-400'}`}>Telefone *</label>
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

                  {(saleType === SaleType.OWN_DELIVERY || saleType === SaleType.THIRD_PARTY) && (
                    <div className="space-y-1.5">
                      <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Endereço de Entrega</label>
                      <div className="flex gap-2">
                        <div className="w-32 shrink-0 relative">
                          <input
                            type="text"
                            placeholder="CEP"
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
                                    const newAddress = `${data.logradouro}, , ${data.bairro}, ${data.localidade} - ${data.uf}`;
                                    setAvulsoData(prev => ({ ...prev, address: newAddress }));
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
                        <input
                          type="text"
                          placeholder="Endereço Completo, Número, Bairro..."
                          value={avulsoData.address}
                          onChange={e => setAvulsoData({ ...avulsoData, address: e.target.value })}
                          className="flex-1 p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl text-xs font-black outline-none focus:border-blue-500 transition-all"
                        />
                      </div>
                    </div>
                  )}

                  <button
                    onClick={() => {
                      const newErrors: Record<string, boolean> = {};
                      if (!avulsoData.name) newErrors.avulsoName = true;

                      const cleanPhone = avulsoData.phone.replace(/\D/g, '');
                      if (cleanPhone.length < 11) newErrors.avulsoPhone = true;

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
                    className="w-full py-5 bg-blue-600 hover:bg-blue-700 text-white rounded-3xl font-black uppercase tracking-widest shadow-xl shadow-blue-100 transition-all flex items-center justify-center gap-3"
                  >
                    Confirmar Identificação
                    <Icons.View className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>

            <div className="p-8 bg-slate-50 flex gap-4 shrink-0">
              <button
                onClick={() => {
                  setSelectedClient(null);
                  setAvulsoData({ name: '', phone: '', address: '', cep: '', email: '', document: '' });
                  setIsAvulso(false);
                  setIsClientModalOpen(false);
                }}
                className="flex-1 py-4 bg-white border border-slate-200 text-slate-500 rounded-2xl font-black uppercase tracking-widest text-[10px] hover:bg-red-50 hover:text-red-500 hover:border-red-100 transition-all"
              >
                Limpar / Voltar
              </button>
            </div>
          </div>
        </div>
      )
      }

      <div className="flex gap-2 lg:gap-4 xl:gap-6 flex-1 min-h-0">
        <div className="w-64 lg:w-72 flex flex-col gap-2 lg:gap-4 shrink-0">
          <div className="bg-orange-50 p-4 lg:p-6 rounded-[2rem] border border-orange-100 flex-1 flex flex-col overflow-hidden">
            <h3 className="text-[10px] font-black text-orange-600 uppercase tracking-widest mb-2 lg:mb-4 flex items-center gap-2">
              <div className="w-2 h-2 bg-orange-500 rounded-full animate-pulse"></div>
              Aguardando Recebimento
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

              {pendingTables.length === 0 && pendingCounterOrders.length === 0 && (
                <div className="text-center py-10 opacity-40">
                  <p className="text-[10px] text-slate-400 font-bold uppercase italic">Nada pendente</p>
                </div>
              )}
            </div>
          </div>

          {/* CASH REGISTER STATUS & CLOSING TRIGGER */}
          <div className="bg-white p-4 rounded-[2rem] border border-slate-100 shadow-sm flex flex-col gap-3">
            <div className="flex items-center justify-between px-2">
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${activeCashSession ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'}`}></div>
                <span className="text-[10px] font-black text-slate-800 uppercase tracking-widest">Caixa Aberto</span>
              </div>
              <span className="text-[10px] font-bold text-slate-400">#{activeCashSession?.id.substring(0, 5)}</span>
            </div>

            <div className="bg-slate-50 p-3 rounded-2xl border border-slate-100">
              <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Abertura</p>
              <p className="text-[10px] font-black text-slate-600 uppercase">
                {activeCashSession ? new Date(activeCashSession.openedAt).toLocaleString('pt-BR') : '--/--/-- --:--'}
              </p>
            </div>

            <button
              onClick={() => setIsClosingModalOpen(true)}
              disabled={!activeCashSession}
              className="w-full py-4 bg-slate-900 border border-slate-800 hover:bg-orange-600 hover:border-orange-500 text-white rounded-2xl font-black uppercase text-[10px] tracking-widest transition-all shadow-lg active:scale-95 disabled:opacity-30 flex items-center justify-center gap-2 group"
            >
              <Icons.Dashboard className="w-3 h-3 group-hover:rotate-12 transition-transform" />
              Fechar Caixa
            </button>
          </div>
        </div>

        <div className="flex-1 flex flex-col min-w-0">
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

        <div className="w-80 lg:w-80 xl:w-96 bg-white rounded-3xl border border-slate-100 shadow-sm flex flex-col shrink-0 overflow-y-auto overflow-x-hidden relative border-l-4 border-l-blue-600/10">
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

          <div className="min-h-[150px] p-4 lg:p-6 xl:p-8 space-y-3 xl:space-y-4 font-receipt text-[11px]">
            {groupedCart.length > 0 ? groupedCart.map(([id, data]) => (
              <div key={id} className={`flex justify-between items-center border-b border-dotted pb-2 ${(currentOrderStatus === OrderStatus.PREPARING || currentOrderStatus === OrderStatus.PARTIALLY_READY) ? 'animate-moderate-blink text-orange-600' : ''}`}>
                <div className="flex-1">
                  <p className="font-black uppercase text-slate-800">{data.product?.name || '...'}</p>
                  <p className="text-slate-400 font-bold">{data.quantity} x R$ {data.price.toFixed(2)}</p>
                </div>
                {!editingOrderId && (
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
            <div className="flex justify-between items-end mb-3 xl:mb-6 font-receipt">
              <span className="font-black text-slate-400 uppercase text-[10px] tracking-widest">VALOR FINAL</span>
              <span className="text-2xl xl:text-4xl font-black text-blue-600 tracking-tighter">R$ {cartTotal.toFixed(2)}</span>
            </div>

            {saleType === SaleType.TABLE && tableNumberInput && (
              <div className="flex gap-2 mb-2">
                {/* Hide Launch button if we are in the payment phase (table is in billing or has a ready order) */}
                {!editingOrderId && !pendingTables.some(t => t.tableNumber === parseInt(tableNumberInput)) && (
                  <button
                    onClick={handleLaunchToTable}
                    disabled={cart.length === 0}
                    className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white font-black py-3 xl:py-4 rounded-xl xl:rounded-2xl shadow-xl uppercase text-[9px] xl:text-[10px] tracking-widest transition-all active:scale-95 disabled:opacity-30"
                  >
                    Lançar na Mesa
                  </button>
                )}
                <button
                  onClick={handleReopenTable}
                  className="flex-1 bg-amber-500 hover:bg-amber-600 text-white font-black py-3 xl:py-4 rounded-xl xl:rounded-2xl shadow-xl uppercase text-[9px] xl:text-[10px] tracking-widest transition-all active:scale-95"
                >
                  Reabrir a Mesa
                </button>
              </div>
            )}

            <button
              onClick={handleFinalize}
              disabled={cart.length === 0 || (saleType === SaleType.TABLE && !tableNumberInput)}
              className={`w-full text-white font-black py-4 xl:py-5 rounded-xl xl:rounded-2xl shadow-xl uppercase text-[10px] tracking-widest transition-all active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed ${(saleType === SaleType.COUNTER && !editingOrderId) ? 'bg-orange-500 hover:bg-orange-600' : 'bg-blue-600 hover:bg-blue-700'
                }`}
            >
              {(saleType === SaleType.COUNTER && !editingOrderId) ? 'Enviar p/ Produção' : 'Finalizar e Receber'}
            </button>

            {editingOrderId && (
              <button onClick={clearState} className="w-full mt-2 text-slate-400 font-black uppercase text-[10px] tracking-widest hover:text-slate-600 transition-colors">Limpar Seleção</button>
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
                        <tr className="text-[8px] uppercase">
                          <th>Item</th>
                          <th className="text-right">Vl. Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {groupedPrintingItems.map(([id, data]) => (
                          <tr key={id} className="text-[9px] uppercase font-black">
                            <td>{data.quantity}x {data.product?.name.substring(0, 15)}</td>
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
                      <Icons.Print className="w-20 h-20 opacity-20" />
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
                    <p className="text-[9px] font-bold mt-1 uppercase">Comprovante de Pagamento</p>
                  </div>
                  <div className="space-y-1 mb-4">
                    <p>DATA: {new Date(printingOrder.createdAt).toLocaleString('pt-BR')}</p>
                    <p>CLIENTE: {printingOrder.clientName}</p>
                    {printingOrder.clientDocument && <p>CPF/CNPJ: {printingOrder.clientDocument}</p>}
                    {printingOrder.clientEmail && <p>E-MAIL: {printingOrder.clientEmail}</p>}
                    {printingOrder.clientPhone && <p>FONE: {printingOrder.clientPhone}</p>}
                    {printingOrder.clientAddress && (
                      <p className="font-bold border-t border-dashed mt-2 pt-1 uppercase leading-tight">ENTREGA: {printingOrder.clientAddress}</p>
                    )}
                    {printingOrder.tableNumber && <p className="font-black">MESA: {printingOrder.tableNumber}</p>}
                    <p>MÉTODO: {printingOrder.paymentMethod || 'DINHEIRO'}</p>
                  </div>
                  <div className="border-t border-dashed my-3 py-3">
                    {groupedPrintingItems.map(([id, data]) => (
                      <div key={id} className="flex justify-between font-black uppercase py-0.5">
                        <span>{data.quantity}x {data.product?.name.substring(0, 18)}</span>
                        <span>R$ {(data.quantity * data.price).toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                  {printingOrder.type === SaleType.OWN_DELIVERY && (
                    <div className="flex justify-between items-center border-t border-dashed pt-4 mb-2 text-[10px] uppercase font-black">
                      <span>Taxa Entrega:</span>
                      <span>R$ {deliveryFeeValue.toFixed(2)}</span>
                    </div>
                  )}
                  <div className={`flex justify-between items-end ${printingOrder.type === SaleType.OWN_DELIVERY ? '' : 'border-t border-dashed pt-4'} mb-6`}>
                    <span className="font-black text-[9px] uppercase tracking-widest">TOTAL:</span>
                    <span className="text-2xl font-black">R$ {printingOrder.total.toFixed(2)}</span>
                  </div>
                </>
              )}

              <div className="flex flex-col gap-2 no-print">
                <div className="flex gap-2">
                  <button onClick={() => window.print()} className="flex-[2] bg-slate-900 text-white py-4 rounded-2xl font-black uppercase text-[10px] shadow-xl">Imprimir</button>
                  <button onClick={() => setPrintingOrder(null)} className="flex-1 bg-slate-100 text-slate-600 py-4 rounded-2xl font-black uppercase text-[10px]">Fechar</button>
                </div>

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

      {/* MODAL DE ABERTURA DE CAIXA */}
      {isOpeningModalOpen && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-900/90 backdrop-blur-xl animate-in fade-in duration-300">
          <div className="bg-white w-[400px] rounded-[3rem] shadow-2xl overflow-hidden border border-slate-100 p-8 lg:p-10">
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
      )}

      {/* MODAL DE FECHAMENTO DE CAIXA */}
      {isClosingModalOpen && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-900/90 backdrop-blur-xl animate-in fade-in duration-300">
          <div className="bg-white w-[500px] rounded-[3rem] shadow-2xl overflow-hidden border border-slate-100 p-8 lg:p-10 max-h-[90vh] overflow-y-auto">
            <div className="text-center mb-8">
              <div className="w-20 h-20 bg-orange-50 rounded-[2rem] flex items-center justify-center mx-auto mb-6 font-black text-2xl text-orange-600">
                $
              </div>
              <h2 className="text-xl font-black text-slate-800 uppercase tracking-tighter">Fechamento de Caixa</h2>
              <p className="text-[10px] font-bold text-slate-400 uppercase mt-2">Confirme os valores recebidos para encerrar o dia</p>
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1 block">Dinheiro em Espécie (R$)</label>
                  <input
                    type="text"
                    placeholder="0,00"
                    value={closingReport.cash}
                    onChange={(e) => setClosingReport(prev => ({ ...prev, cash: e.target.value }))}
                    className="w-full p-4 bg-slate-50 rounded-2xl border-2 border-slate-100 focus:border-orange-500 outline-none font-black text-sm text-center"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1 block">Total em PIX (R$)</label>
                  <input
                    type="text"
                    placeholder="0,00"
                    value={closingReport.pix}
                    onChange={(e) => setClosingReport(prev => ({ ...prev, pix: e.target.value }))}
                    className="w-full p-4 bg-slate-50 rounded-2xl border-2 border-slate-100 focus:border-orange-500 outline-none font-black text-sm text-center"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1 block">Cartão Crédito (R$)</label>
                  <input
                    type="text"
                    placeholder="0,00"
                    value={closingReport.credit}
                    onChange={(e) => setClosingReport(prev => ({ ...prev, credit: e.target.value }))}
                    className="w-full p-4 bg-slate-50 rounded-2xl border-2 border-slate-100 focus:border-orange-500 outline-none font-black text-sm text-center"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1 block">Cartão Débito (R$)</label>
                  <input
                    type="text"
                    placeholder="0,00"
                    value={closingReport.debit}
                    onChange={(e) => setClosingReport(prev => ({ ...prev, debit: e.target.value }))}
                    className="w-full p-4 bg-slate-50 rounded-2xl border-2 border-slate-100 focus:border-orange-500 outline-none font-black text-sm text-center"
                  />
                </div>
              </div>

              <div>
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1 block">Observações (Opcional)</label>
                <textarea
                  placeholder="Ex: Diferença justificada por..."
                  value={closingReport.observations}
                  onChange={(e) => setClosingReport(prev => ({ ...prev, observations: e.target.value }))}
                  className="w-full p-4 bg-slate-50 rounded-2xl border-2 border-slate-100 focus:border-orange-500 outline-none font-bold text-xs min-h-[80px]"
                />
              </div>

              <div className="flex gap-2 pt-4">
                <button
                  onClick={() => setIsClosingModalOpen(false)}
                  className="flex-1 py-5 font-black uppercase text-[10px] text-slate-400 hover:text-slate-600"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleCloseCash}
                  className="flex-[2] py-5 bg-orange-600 hover:bg-orange-700 text-white rounded-2xl font-black uppercase text-xs tracking-widest shadow-xl transition-all active:scale-95"
                >
                  Encerrar Caixa ✓
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div >
  );
};

export default POS;
