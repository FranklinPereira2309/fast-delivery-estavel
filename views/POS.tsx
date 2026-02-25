
import React, { useState, useEffect, useMemo } from 'react';
import { Product, OrderItem, SaleType, Order, OrderStatus, OrderStatusLabels, User, Client, DeliveryDriver, TableSession } from '../types';
import { db, BusinessSettings } from '../services/db';
import { socket } from '../services/socket';
import { Icons, PLACEHOLDER_FOOD_IMAGE, formatImageUrl } from '../constants';
import CustomAlert from '../components/CustomAlert';

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
  const [avulsoData, setAvulsoData] = useState({ name: '', phone: '', address: '', cep: '' });
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

  const [alertConfig, setAlertConfig] = useState<{ isOpen: boolean, title: string, message: string, onConfirm: () => void, type: 'INFO' | 'DANGER' }>({
    isOpen: false, title: '', message: '', onConfirm: () => { }, type: 'INFO'
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
    const [p, o, s, c, ts] = await Promise.all([
      db.getProducts(),
      db.getOrders(),
      db.getSettings(),
      db.getClients(),
      db.getTableSessions()
    ]);
    setProducts(p);
    setOrders(o);
    setBusinessSettings(s);
    if (s && manualDeliveryFee === null) {
      const clean = s.deliveryFee.replace('R$', '').replace(',', '.').trim();
      setManualDeliveryFee(parseFloat(clean) || 0);
    }
    setClients(c);
    setPendingTables(ts.filter(t => t.status === 'billing'));
    setPendingCounterOrders(o.filter(order => order.type === SaleType.COUNTER && order.status === OrderStatus.READY));
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
        cep: ''
      });
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

  const handleFinalize = async () => {
    if (cart.length === 0) return;

    const isTableSale = saleType === SaleType.TABLE;
    const isCounterSale = saleType === SaleType.COUNTER;
    const isDelivery = saleType === SaleType.OWN_DELIVERY;
    const finalTableNum = isTableSale ? parseInt(tableNumberInput) : null;

    // Table Validation
    if (isTableSale) {
      if (isNaN(finalTableNum!)) return showAlert("Erro", "Por favor, informe o número da mesa.", "DANGER");
      const tableOrder = orders.find(o => o.id === `TABLE-${finalTableNum}`);
      if (tableOrder && (tableOrder.status === OrderStatus.PREPARING || tableOrder.status === OrderStatus.PARTIALLY_READY)) {
        return showAlert("Produção Ativa", "ATENÇÃO: Checkout bloqueado. Esta mesa ainda possui itens EM PREPARO na cozinha.", "DANGER");
      }
    }

    // Busca a sessão da mesa diretamente no banco de garantir que pegamos os dados reais, 
    // mesmo que ela esteja apenas 'occupied' (e não 'billing' no pendingTables)
    let freshTableSession = isTableSale ? ((await db.getTableSessions()).find(t => t.tableNumber === finalTableNum)) : null;
    let tableSessionToClose = isTableSale ? (freshTableSession || pendingTables.find(t => t.tableNumber === finalTableNum)) : null;

    let finalClientId = isTableSale ? (tableSessionToClose?.clientId || 'ANONYMOUS') : (isAvulso ? undefined : selectedClient?.id);
    let finalClientName = isTableSale
      ? (tableSessionToClose?.clientName || `Mesa ${finalTableNum}`)
      : (isAvulso ? avulsoData.name : (selectedClient?.name || 'Consumidor Padrão'));

    // Handle Unregistered/Avulso auto-save
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
            totalOrders: 0
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

    // Counter Validation (New order must go to kitchen)
    if (isCounterSale && !editingOrderId) {
      // Just save and send to kitchen
      const orderData: Order = {
        id: `PED-${Date.now()}`,
        clientId: finalClientId,
        clientName: finalClientName,
        clientAddress: isAvulso ? avulsoData.address : (selectedClient?.addresses[0] || undefined),
        clientPhone: isAvulso ? avulsoData.phone : (selectedClient?.phone || undefined),
        items: [...cart],
        total: cartTotal,
        status: OrderStatus.PREPARING,
        type: SaleType.COUNTER,
        createdAt: new Date().toISOString(),
        paymentMethod: undefined,
        isOriginDigitalMenu: false
      };
      await db.saveOrder(orderData, currentUser);
      showAlert("Enviado para Cozinha", `Pedido de balcão (${finalClientName}) enviado para preparo.`, "INFO");
      clearState();
      await refreshAllData();
      return;
    }

    // Counter Validation (Must be Ready to take payment)
    if (isCounterSale && editingOrderId) {
      if (currentOrderStatus !== OrderStatus.READY) {
        return showAlert("Não Pronto", "Este pedido ainda não está pronto para recebimento.", "DANGER");
      }
    }

    const finalAddress = isTableSale
      ? (pendingTables.find(t => t.tableNumber === finalTableNum)?.clientAddress || undefined)
      : (isAvulso ? avulsoData.address : (selectedClient?.addresses[0] || undefined));

    const finalPhone = isTableSale
      ? (pendingTables.find(t => t.tableNumber === finalTableNum)?.clientPhone || undefined)
      : (isAvulso ? avulsoData.phone : (selectedClient?.phone || undefined));

    const existingTableOrderId = isTableSale ? `TABLE-${finalTableNum}` : null;

    // Delivery Validation
    if (isDelivery) {
      if (isAvulso) {
        if (!avulsoData.name || !avulsoData.address || !avulsoData.phone) {
          return showAlert("Dados Faltantes", "Para Delivery Avulso, preencha Nome, Endereço e Telefone.", "DANGER");
        }
      } else if (!selectedClient) {
        return showAlert("Cliente Requerido", "Para Delivery, selecione um cliente cadastrado ou use a opção 'Avulso'.", "DANGER");
      }

      // For Delivery, always send to kitchen first
      const existingOrder = editingOrderId ? orders.find(o => o.id === editingOrderId) : null;
      const orderData: Order = {
        id: editingOrderId || `PED-${Date.now()}`,
        clientId: finalClientId,
        clientName: finalClientName,
        clientAddress: finalAddress,
        clientPhone: finalPhone,
        items: [...cart],
        total: cartTotal,
        status: OrderStatus.PREPARING,
        type: saleType,
        createdAt: editingOrderId ? orders.find(o => o.id === editingOrderId)?.createdAt || new Date().toISOString() : new Date().toISOString(),
        paymentMethod: paymentMethod,
        driverId: existingOrder?.driverId,
        isOriginDigitalMenu: false
      };

      await db.saveOrder(orderData, currentUser);
      showAlert("Enviado para Cozinha", `Pedido de delivery (${finalClientName}) enviado para preparo.`, "INFO");
      clearState();
      await refreshAllData();
      return;
    }

    const existingOrderId = existingTableOrderId || editingOrderId;
    const existingOrder = existingOrderId ? orders.find(o => o.id === existingOrderId) : null;

    const orderData: Order = {
      id: existingOrderId || `PED-${Date.now()}`,
      clientId: finalClientId,
      clientName: finalClientName,
      clientAddress: finalAddress,
      clientPhone: finalPhone,
      items: [...cart],
      total: cartTotal,
      status: OrderStatus.DELIVERED,
      type: saleType,
      createdAt: existingOrderId ? orders.find(o => o.id === existingOrderId)?.createdAt || new Date().toISOString() : new Date().toISOString(),
      paymentMethod: paymentMethod,
      driverId: existingOrder?.driverId,
      tableNumber: isTableSale ? finalTableNum! : undefined,
      waiterId: isTableSale ? orders.find(o => o.id === existingTableOrderId)?.waiterId : undefined,
      isOriginDigitalMenu: isTableSale ? (tableSessionToClose?.isOriginDigitalMenu || false) : false
    };

    await db.saveOrder(orderData, currentUser);

    // UPDATE LOCAL ORDERS STATE
    setOrders(prev => {
      const exists = prev.some(o => o.id === orderData.id);
      if (exists) return prev.map(o => o.id === orderData.id ? orderData : o);
      return [orderData, ...prev];
    });

    if (isTableSale) {
      await db.deleteTableSession(finalTableNum!);
      setPendingTables(prev => prev.filter(t => t.tableNumber !== finalTableNum));
    } else if (editingOrderId) {
      setPendingCounterOrders(prev => prev.filter(o => o.id !== editingOrderId));
    }

    clearState();
    setPrintingOrder(orderData);
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
    setAvulsoData({ name: '', phone: '', address: '', cep: '' });
  };

  const getFriendlySaleType = (type: SaleType | string) => {
    switch (type) {
      case SaleType.COUNTER: return 'Balcão';
      case SaleType.TABLE: return 'Mesa';
      case SaleType.OWN_DELIVERY: return 'Delivery';
      default: return type;
    }
  };

  // Cálculo de itens agrupados para exibição na área de pagamentos e cupons
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
                  <div className="flex items-center justify-between px-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Identificação do Cliente</label>
                    <button
                      onClick={() => {
                        setIsAvulso(!isAvulso);
                        setSelectedClient(null);
                        setClientSearch('');
                      }}
                      className={`text-[9px] font-black uppercase px-2 py-1 rounded-lg transition-all ${isAvulso ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-500'}`}>
                      {isAvulso ? 'Cadastrado?' : 'Avulso?'}
                    </button>
                  </div>

                  {isAvulso ? (
                    <div className="space-y-2 animate-in zoom-in-95">
                      <input
                        type="text"
                        placeholder="Telefone"
                        value={avulsoData.phone}
                        onChange={e => {
                          const phone = e.target.value;
                          const cleanPhone = phone.replace(/\D/g, '');
                          const cleanPrevPhone = avulsoData.phone.replace(/\D/g, '');
                          const matchedNew = clients.find(c => c.phone.replace(/\D/g, '') === cleanPhone && cleanPhone.length > 0);
                          const matchedOld = clients.find(c => c.phone.replace(/\D/g, '') === cleanPrevPhone && cleanPrevPhone.length > 0);

                          if (matchedNew) {
                            setAvulsoData({ phone, name: matchedNew.name, address: matchedNew.addresses[0] || '', cep: avulsoData.cep });
                          } else if (matchedOld || (cleanPhone.length >= 8 && cleanPrevPhone.length < 8)) {
                            setAvulsoData({ phone, name: '', address: '', cep: '' });
                          } else {
                            setAvulsoData(prev => ({ ...prev, phone }));
                          }
                        }}
                        className="w-full p-3 bg-slate-100 border-none rounded-xl text-[10px] font-black uppercase outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      <input type="text" placeholder="Nome do Cliente" value={avulsoData.name} onChange={e => setAvulsoData({ ...avulsoData, name: e.target.value })} className="w-full p-3 bg-slate-100 border-none rounded-xl text-[10px] font-black outline-none focus:ring-2 focus:ring-blue-500" />
                      {(saleType === SaleType.OWN_DELIVERY || saleType === SaleType.THIRD_PARTY) && (
                        <div className="flex gap-2 items-start">
                          <div className="w-1/3 relative shrink-0">
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
                              className={`w-full p-3 bg-slate-100 border-none rounded-xl text-[10px] font-black uppercase outline-none focus:ring-2 focus:ring-blue-500 ${isLoadingCep ? 'opacity-50' : ''}`}
                            />
                            {isLoadingCep && (
                              <div className="absolute right-2 top-1/2 -translate-y-1/2">
                                <div className="w-3 h-3 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                              </div>
                            )}
                          </div>
                          <textarea placeholder="Endereço de Entrega" value={avulsoData.address} onChange={e => setAvulsoData({ ...avulsoData, address: e.target.value })} className="flex-1 w-full p-3 bg-slate-100 border-none rounded-xl text-[10px] font-black uppercase outline-none focus:ring-2 focus:ring-blue-500 h-20 resize-none" />
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="relative">
                      <input type="text" className="w-full p-4 bg-slate-100 border-none rounded-2xl text-[10px] font-black uppercase tracking-widest outline-none focus:ring-2 focus:ring-blue-500" placeholder="Buscar Cliente (CRM)..." value={clientSearch} onChange={(e) => { setClientSearch(e.target.value); setShowClientList(true); }} />
                      {showClientList && clientSearch && (
                        <div className="absolute z-30 w-full bg-white border border-slate-200 rounded-2xl shadow-2xl max-h-40 overflow-y-auto mt-2 p-2">
                          {clients.filter(c => c.name.toLowerCase().includes(clientSearch.toLowerCase())).map(c => (
                            <button key={c.id} onClick={() => { setSelectedClient(c); setClientSearch(c.name); setShowClientList(false); }} className="w-full text-left p-3 hover:bg-slate-50 border-b last:border-0 rounded-lg">
                              <p className="text-[10px] font-black text-slate-800 uppercase tracking-tighter">{c.name}</p>
                              <p className="text-[8px] text-slate-400 truncate">{c.addresses[0]}</p>
                            </button>
                          ))}
                        </div>
                      )}
                      {selectedClient && (
                        <div className="mt-2 bg-blue-50 p-4 rounded-2xl border border-blue-100 flex flex-col gap-1">
                          <div className="flex justify-between items-center">
                            <span className="text-[10px] font-black text-blue-700 uppercase">{selectedClient.name}</span>
                            <button onClick={() => setSelectedClient(null)} className="text-blue-400 font-black">×</button>
                          </div>
                          <p className="text-[8px] text-blue-500 font-bold uppercase truncate">{selectedClient.addresses[0]}</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* HIDE PAYMENT METHODS UNLESS READY */}
              {((saleType === SaleType.TABLE && (currentOrderStatus === OrderStatus.READY || orders.find(o => o.id === `TABLE-${tableNumber}`)?.status === OrderStatus.READY || pendingTables.some(t => t.tableNumber === tableNumber))) ||
                (saleType === SaleType.COUNTER && editingOrderId && currentOrderStatus === OrderStatus.READY) ||
                (saleType === SaleType.OWN_DELIVERY)) ? (
                <select value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)} className="w-full p-4 bg-slate-100 border-none rounded-2xl text-[10px] font-black uppercase tracking-widest outline-none focus:ring-2 focus:ring-blue-500 font-bold animate-in fade-in duration-300">
                  <option value="DINHEIRO">Dinheiro Espécie</option>
                  <option value="PIX">Pagamento Via PIX</option>
                  <option value="CRÉDITO">Cartão de Crédito</option>
                  <option value="DÉBITO">Cartão de Débito</option>
                </select>
              ) : (
                <div className="p-4 bg-blue-50 text-blue-600 rounded-2xl text-[9px] font-black uppercase text-center border border-blue-100 italic">
                  Informar pagamento após o preparo
                </div>
              )}
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
      {selectedProductForCart !== null && (
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
      )}

      {printingOrder && businessSettings && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-md">
          <div className="relative w-full max-w-[80mm] bg-white p-8 border border-dashed shadow-2xl font-receipt text-[11px] text-black is-receipt animate-in zoom-in duration-200">
            <div className="text-center mb-6 border-b border-dashed pb-4">
              <h2 className="font-black text-sm uppercase tracking-tighter">{businessSettings.name}</h2>
              <p className="text-[9px] font-bold mt-1 uppercase">Comprovante de Pagamento</p>
            </div>
            <div className="space-y-1 mb-4">
              <p>DATA: {new Date(printingOrder.createdAt).toLocaleString('pt-BR')}</p>
              <p>CLIENTE: {printingOrder.clientName}</p>
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
            <div className="flex gap-2 no-print">
              <button onClick={() => window.print()} className="flex-1 bg-slate-900 text-white py-4 rounded-2xl font-black uppercase text-[10px] shadow-xl">Imprimir</button>
              <button onClick={() => setPrintingOrder(null)} className="flex-1 bg-slate-100 text-slate-600 py-4 rounded-2xl font-black uppercase text-[10px]">Fechar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default POS;
