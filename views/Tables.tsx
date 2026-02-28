
import React, { useState, useEffect, useMemo } from 'react';
import { db, BusinessSettings } from '../services/db';
import { socket } from '../services/socket';
import { TableSession, Product, User, OrderItem, Order, OrderStatus, SaleType, Waiter, Client } from '../types';
import { Icons, PLACEHOLDER_FOOD_IMAGE, formatImageUrl } from '../constants';
import CustomAlert from '../components/CustomAlert';
import { useDigitalAlert } from '../hooks/useDigitalAlert';
import { validateEmail, validateCPF, validateCNPJ, maskPhone, maskDocument, toTitleCase } from '../services/validationUtils';

interface TablesProps {
  currentUser: User;
}

const Tables: React.FC<TablesProps> = ({ currentUser }) => {
  const { isAlerting, dismissAlert } = useDigitalAlert();
  const [settings, setSettings] = useState<BusinessSettings | null>(null);
  const [sessions, setSessions] = useState<TableSession[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [waiters, setWaiters] = useState<Waiter[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [selectedTable, setSelectedTable] = useState<number | null>(null);
  const [activeModalTab, setActiveModalTab] = useState<'LAUNCH' | 'REMOVE' | 'CHECKOUT' | 'CONSUMPTION'>('LAUNCH');
  const [feedbacks, setFeedbacks] = useState<any[]>([]);
  const [showFeedbacks, setShowFeedbacks] = useState(false);
  const [hasNewFeedback, setHasNewFeedback] = useState(false);
  const [lastFeedbackBlink, setLastFeedbackBlink] = useState(false);

  const [lastAddedProduct, setLastAddedProduct] = useState<string | null>(null);
  const [isConfirmingBilling, setIsConfirmingBilling] = useState(false);
  const [printingPreBill, setPrintingPreBill] = useState<TableSession | null>(null);

  const [showConsumptionTicket, setShowConsumptionTicket] = useState(false);
  const [selectedWaiterId, setSelectedWaiterId] = useState<string>('');
  const [selectedProductForLaunch, setSelectedProductForLaunch] = useState<Product | null>(null);
  const [modalObservation, setModalObservation] = useState('');

  const [isUnregisteredClient, setIsUnregisteredClient] = useState(false);
  const [manualClientName, setManualClientName] = useState('');
  const [manualClientPhone, setManualClientPhone] = useState('');
  const [manualClientEmail, setManualClientEmail] = useState('');
  const [manualClientDocument, setManualClientDocument] = useState('');
  const [manualClientAddress, setManualClientAddress] = useState('');
  const [manualClientCep, setManualClientCep] = useState('');
  const [isLoadingCep, setIsLoadingCep] = useState(false);
  const [clientSearch, setClientSearch] = useState('');
  const [showClientList, setShowClientList] = useState(false);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [errors, setErrors] = useState<Record<string, boolean>>({});

  const [alertConfig, setAlertConfig] = useState<{ isOpen: boolean, title: string, message: string, onConfirm: () => void, onCancel?: () => void, type: 'INFO' | 'DANGER' | 'SUCCESS' }>({
    isOpen: false, title: '', message: '', onConfirm: () => { }, type: 'INFO'
  });

  const showAlert = (title: string, message: string, type: 'INFO' | 'DANGER' | 'SUCCESS' = 'INFO', onConfirm?: () => void, onCancel?: () => void) => {
    setAlertConfig({
      isOpen: true, title, message,
      onConfirm: onConfirm || (() => setAlertConfig(prev => ({ ...prev, isOpen: false }))),
      onCancel: onCancel,
      type
    });
  };

  useEffect(() => {
    refreshData();
    const agent = setInterval(refreshData, 3000);

    // Escuta evento de novo pedido via WebSockets
    const handleNewOrder = () => {
      console.log('WS: Novo pedido recebido na mesa! Atualizando tela de mesas...');
      refreshData();
    };

    socket.on('newOrder', handleNewOrder);

    const handleNewFeedback = (feedback: any) => {
      console.log('WS: Novo feedback recebido!', feedback);
      setFeedbacks(prev => [feedback, ...prev]);
      setHasNewFeedback(true);
    };

    socket.on('newFeedback', handleNewFeedback);

    return () => {
      clearInterval(agent);
      socket.off('newOrder', handleNewOrder);
      socket.off('newFeedback', handleNewFeedback);
    };
  }, []);

  const refreshData = async () => {
    const [s, sess, prods, wa, cl] = await Promise.all([
      db.getSettings(),
      db.getTableSessions(),
      db.getProducts(),
      db.getWaiters(),
      db.getClients()
    ]);
    setSettings(s);
    setSessions(sess);
    setProducts(prods);
    setWaiters(wa);
    setClients(cl);

    // Fetch feedbacks
    try {
      const fb = await db.getFeedbacks();
      setFeedbacks(fb);
    } catch (e) {
      console.error('Error fetching feedbacks', e);
    }
  };

  const getTableStatus = (num: number) => {
    const sess = sessions.find(s => s.tableNumber === num);
    if (!sess) return 'available';
    if (sess.hasPendingDigital) return 'pending_digital';
    return sess.status;
  };

  const getSessForTable = (num: number) => sessions.find(s => s.tableNumber === num);

  const confirmLaunchProduct = async () => {
    if (!selectedProductForLaunch) return;
    const product = selectedProductForLaunch;

    console.log('Attempting to launch product:', product.name, 'to table:', selectedTable);
    if (selectedTable === null) return;
    if (!selectedWaiterId) {
      console.warn('Launch blocked: No waiter selected');
      setSelectedProductForLaunch(null);
      return showAlert("Garçom Requerido", "Por favor, selecione o garçom responsável.", "DANGER");
    }

    if (getTableStatus(selectedTable) === 'billing') {
      setSelectedProductForLaunch(null);
      return showAlert("Mesa Bloqueada", "Esta mesa está em processo de fechamento (Faturando). Para lançar mais itens, reabra a mesa.", "DANGER");
    }

    const validation = await db.validateStockForOrder([{ productId: product.id, quantity: 1 }]);
    if (!validation.valid) {
      console.warn('Launch blocked: Out of stock', validation.message);
      setSelectedProductForLaunch(null);
      return showAlert("Sem Estoque", validation.message || "Produto sem estoque.", "DANGER");
    }

    const existingSess = getSessForTable(selectedTable);
    const newItem: OrderItem = {
      uid: `item-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      productId: product.id,
      quantity: 1,
      price: product.price,
      isReady: false,
      observations: modalObservation || ''
    };
    const newItems: OrderItem[] = existingSess ? [...existingSess.items, newItem] : [newItem];
    let startTime = existingSess?.startTime ? new Date(existingSess.startTime).toISOString() : new Date().toISOString();

    // If session is from a different day, reset startTime to now
    if (existingSess?.startTime) {
      const sessDate = new Date(existingSess.startTime);
      const now = new Date();
      if (sessDate.toDateString() !== now.toDateString()) {
        console.log('Resetting stale session start time from', sessDate.toLocaleString(), 'to now');
        startTime = now.toISOString();
      }
    }

    const newSess: TableSession = {
      tableNumber: selectedTable,
      status: 'occupied',
      items: newItems,
      waiterId: selectedWaiterId,
      startTime: startTime
    };

    const waiter = waiters.find(w => w.id === selectedWaiterId);

    if (!existingSess) await db.logAction(currentUser, 'TABLE_OPEN', `Mesa ${selectedTable} aberta por ${waiter?.name}.`);

    try {
      await db.saveTableSession(newSess);
      console.log('Product launched successfully to Table', selectedTable);
    } catch (err: any) {
      console.error('Error saving table session:', err);
      const errorMessage = err.message || "Erro desconhecido";
      showAlert("Erro ao Salvar", `Não foi possível adicionar o item: ${errorMessage}`, "DANGER");
    }

    setLastAddedProduct(product.id);
    setTimeout(() => setLastAddedProduct(null), 800);
    setSelectedProductForLaunch(null);
    setModalObservation('');
    await refreshData();
  };

  const removeProduct = async (uid: string) => {
    if (!currentUser.permissions.includes('admin')) return showAlert("Acesso Negado", "Ação restrita ao Admin Master.", "DANGER");
    if (selectedTable === null) return;
    const sess = getSessForTable(selectedTable);
    if (!sess) return;

    showAlert("Confirmar Estorno", "Deseja realmente remover este item do consumo?", "DANGER", async () => {
      const itemIdx = sess.items.findIndex(i => i.uid === uid);
      if (itemIdx === -1) return;
      sess.items.splice(itemIdx, 1);

      if (sess.items.length === 0) {
        let reason = undefined;
        if (sess.isOriginDigitalMenu) {
          reason = window.prompt("Informe o motivo do cancelamento para o cliente (Cardápio Digital):") || undefined;
        }
        await db.deleteTableSession(selectedTable, true); // true = cancellation
        await db.deleteOrder(`TABLE-${selectedTable}`, currentUser, reason);
      } else {
        await db.saveTableSession({ ...sess });
        const kitchenOrder: Order = {
          id: `TABLE-${selectedTable}`,
          clientId: 'ANONYMOUS',
          clientName: `Mesa ${selectedTable}`,
          items: sess.items,
          total: sess.items.reduce((acc, it) => acc + (it.price * it.quantity), 0),
          status: OrderStatus.PREPARING,
          type: SaleType.TABLE,
          createdAt: sess.startTime,
          tableNumber: selectedTable,
          waiterId: sess.waiterId,
          isOriginDigitalMenu: sess.isOriginDigitalMenu || false
        };
        await db.saveOrder(kitchenOrder, currentUser);
      }
      setAlertConfig(prev => ({ ...prev, isOpen: false }));
      await refreshData();
    }, () => setAlertConfig(prev => ({ ...prev, isOpen: false })));
  };

  const approveDigitalOrders = async (tableNum: number) => {
    const sess = getSessForTable(tableNum);
    if (!sess || !sess.hasPendingDigital) return;

    if (!selectedWaiterId) {
      return showAlert("Garçom Requerido", "Para oficializar estes itens, selecione qual garçom assumirá o atendimento dessa mesa.", "DANGER");
    }

    try {
      const pendingItems = JSON.parse(sess.pendingReviewItems || '[]');

      // Stock Validation
      const validation = await db.validateStockForOrder(pendingItems);
      if (!validation.valid) {
        return showAlert("Sem Estoque", `Estoque insuficiente para os itens digitais: ${validation.message}`, "DANGER");
      }

      const resolvedItems: OrderItem[] = pendingItems.map((pi: any) => {
        const product = products.find(p => p.id === pi.productId);
        return {
          uid: `item-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
          productId: pi.productId,
          quantity: pi.quantity,
          price: product?.price || 0,
          isReady: false,
          observations: pi.orderedBy ? `(${pi.orderedBy}) ${pi.observations || ''}`.trim() : (pi.observations || '')
        };
      });

      const newItems = [...sess.items, ...resolvedItems];

      await db.saveTableSession({
        ...sess,
        items: newItems,
        waiterId: selectedWaiterId,
        status: 'occupied',
        hasPendingDigital: false,
        pendingReviewItems: null as any
      });

      const waiter = waiters.find(w => w.id === selectedWaiterId);
      await db.logAction(currentUser, 'TABLE_DIGITAL_APPROVE', `Mesa ${tableNum}: Pedido digital aprovado por ${waiter?.name}.`);

      showAlert("Aprovado!", "Itens do Cardápio Digital foram confirmados e enviados para a Cozinha.", "SUCCESS");
      await refreshData();
    } catch (err) {
      console.error("Erro ao aprovar digitais", err);
      showAlert("Erro", "Falha ao processar a aprovação.", "DANGER");
    }
  };

  const rejectDigitalOrders = async (tableNum: number) => {
    const sess = getSessForTable(tableNum);
    if (!sess || !sess.hasPendingDigital) return;

    showAlert("Rejeitar Pedido", "Deseja realmente excluir este pedido do cardápio digital?", "DANGER", async () => {
      try {
        if (sess.items.length === 0) {
          // Se não há outros itens, exclui a sessão da mesa e ela volta a ficar livre
          await db.deleteTableSession(tableNum, true); // true = cancellation
        } else {
          // Se já haviam outros itens na mesa, apenas remove o status de digital pendente
          await db.saveTableSession({
            ...sess,
            hasPendingDigital: false,
            pendingReviewItems: null as any
          }, true);
        }

        await db.logAction(currentUser, 'TABLE_DIGITAL_REJECT', `Mesa ${tableNum}: Pedido digital rejeitado/excluído.`);

        setAlertConfig(prev => ({ ...prev, isOpen: false }));
        showAlert("Rejeitado", "O pedido digital foi excluído com sucesso.", "SUCCESS");
        await refreshData();
      } catch (err) {
        console.error("Erro ao rejeitar digitais", err);
        setAlertConfig(prev => ({ ...prev, isOpen: false }));
        showAlert("Erro", "Falha ao processar a rejeição.", "DANGER");
      }
    }, () => setAlertConfig(prev => ({ ...prev, isOpen: false })));
  };

  // Lógica de agrupamento para exibição em cupons de mesa
  const getGroupedItems = (items: OrderItem[]) => {
    const grouped: Record<string, { product: Product | undefined, quantity: number, price: number, allReady: boolean }> = {};
    items.forEach(item => {
      if (!grouped[item.productId]) {
        grouped[item.productId] = {
          product: products.find(p => p.id === item.productId),
          quantity: 0,
          price: item.price,
          allReady: true
        };
      }
      grouped[item.productId].quantity += 1;
      if (!item.isReady) grouped[item.productId].allReady = false;
    });
    return Object.values(grouped);
  };

  const startBillingRequest = (sess: TableSession) => {
    const newErrors: Record<string, boolean> = {};
    const hasClient = isUnregisteredClient ? manualClientName.trim() : selectedClient;

    if (!hasClient) {
      if (isUnregisteredClient) newErrors.manualClientName = true;
      showAlert('Cliente Necessário', 'Identifique o cliente para fechar a conta.', 'INFO');
      return;
    }

    if (isUnregisteredClient && manualClientEmail && !validateEmail(manualClientEmail)) {
      newErrors.manualClientEmail = true;
    }

    if (isUnregisteredClient && manualClientPhone) {
      const cleanPhone = manualClientPhone.replace(/\D/g, '');
      if (cleanPhone.length < 11) newErrors.manualClientPhone = true;
    }

    if (manualClientDocument) {
      const cleanDoc = manualClientDocument.replace(/\D/g, '');
      if (cleanDoc.length === 11) {
        if (!validateCPF(cleanDoc)) newErrors.manualClientDocument = true;
      } else if (cleanDoc.length === 14) {
        if (!validateCNPJ(cleanDoc)) newErrors.manualClientDocument = true;
      } else {
        newErrors.manualClientDocument = true;
      }
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return showAlert("Dados Inválidos", "Verifique os campos destacados em vermelho.", "DANGER");
    }

    setErrors({});

    if (!isUnregisteredClient && !selectedClient) {
      return showAlert("Identificação Requerida", "Por favor, selecione um cliente da base ou use a opção 'Avulso'.", "DANGER");
    }

    setPrintingPreBill(sess);
    setIsConfirmingBilling(true);
  };

  const confirmBilling = async () => {
    if (!printingPreBill) return;

    const clientName = isUnregisteredClient ? manualClientName : (selectedClient?.name || 'Consumidor');
    const clientPhone = isUnregisteredClient ? manualClientPhone : selectedClient?.phone;
    const clientEmail = isUnregisteredClient ? manualClientEmail : selectedClient?.email;
    const clientDocument = isUnregisteredClient ? manualClientDocument : selectedClient?.document;
    const clientAddress = isUnregisteredClient ? manualClientAddress : selectedClient?.addresses[0];

    let finalClientId = isUnregisteredClient ? undefined : selectedClient?.id;

    if (isUnregisteredClient && manualClientName) {
      // Here we attempt to find or create the client in the DB
      try {
        const formattedPhone = manualClientPhone.replace(/\D/g, ''); // just numbers
        const existingClient = clients.find(c => c.phone?.replace(/\D/g, '') === formattedPhone);

        if (existingClient) {
          finalClientId = existingClient.id; // It actually existed, we can just use the ID
        } else {
          // Let's create a real client using db
          const newClient: Client = {
            id: `CLIENT-${Date.now()}`,
            name: manualClientName,
            phone: manualClientPhone,
            email: manualClientEmail || undefined,
            document: manualClientDocument || undefined,
            addresses: manualClientAddress ? [manualClientAddress] : [],
            totalOrders: 0
          };
          await db.saveClient(newClient);
          finalClientId = newClient.id;
          // Add to local state so next searches find them
          setClients(prev => [...prev, newClient]);
        }
      } catch (err) {
        console.error('Error auto-registering client', err);
        // It fails gracefully, let backend create ANONYMOUS if undefined
      }
    }

    await db.saveTableSession({
      ...printingPreBill,
      status: 'billing',
      clientName,
      clientId: finalClientId,
      clientPhone,
      clientEmail,
      clientDocument,
      clientAddress
    });

    await db.logAction(currentUser, 'TABLE_BILL_REQUEST', `Mesa ${printingPreBill.tableNumber}: Pré-conta para ${clientName}.`);

    setIsConfirmingBilling(false);
    setPrintingPreBill(null);
    setSelectedTable(null);
    setSelectedClient(null);
    setManualClientName('');
    setManualClientPhone('');
    setManualClientEmail('');
    setManualClientDocument('');
    setManualClientAddress('');
    setManualClientCep('');
    setClientSearch('');
    await refreshData();
    showAlert("Sucesso", "Solicitação de fechamento enviada ao PDV!", "SUCCESS");
  };

  if (!settings) return null;

  return (
    <div className="flex flex-col h-full gap-8 rounded-[2rem] p-2 transition-all duration-300" onClick={(e) => {
      // Dismiss the alerting state if active, but without visual feedback on the container
      if (isAlerting) dismissAlert();
    }}>
      <CustomAlert {...alertConfig} onConfirm={alertConfig.onConfirm} onCancel={alertConfig.onCancel} />

      {/* Header Gestão de Mesas */}
      <div className="flex justify-between items-center bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm">
        <div>
          <h2 className="text-2xl font-black text-slate-800 uppercase tracking-tighter">Gestão de Mesas</h2>
          <p className="text-xs text-slate-400 font-bold uppercase tracking-widest">Painel de Atendimento em Tempo Real</p>
        </div>
        <div className="flex items-center gap-6">
          <div className="flex gap-4">
            <div className="flex items-center gap-1.5"><span className="w-2 h-2 bg-emerald-500 rounded-full animate-bounce"></span><span className="text-[10px] font-bold uppercase text-slate-400">Livre</span></div>
            <div className="flex items-center gap-1.5"><span className="w-2 h-2 bg-fuchsia-600 rounded-full animate-bounce"></span><span className="text-[10px] font-bold uppercase text-slate-400">App Digital</span></div>
            <div className="flex items-center gap-1.5"><span className="w-2 h-2 bg-red-600 rounded-full animate-bounce"></span><span className="text-[10px] font-bold uppercase text-slate-400">Ocupada</span></div>
            <div className="flex items-center gap-1.5"><span className="w-2 h-2 bg-orange-500 rounded-full animate-bounce"></span><span className="text-[10px] font-bold uppercase text-slate-400">Checkout</span></div>
          </div>

          <button
            onClick={() => {
              setShowFeedbacks(true);
              setHasNewFeedback(false);
            }}
            className={`flex items-center gap-2 px-6 py-3 rounded-2xl transition-all font-black uppercase text-[10px] relative ${hasNewFeedback ? 'bg-indigo-600 text-white animate-moderate-blink shadow-lg shadow-indigo-200' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
            </svg>
            Mensagens do Dia
            {hasNewFeedback && <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full border-2 border-white animate-ping"></span>}
          </button>
        </div>
      </div>


      {/* Grid de Mesas */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-8 gap-6 overflow-y-auto pb-12 transition-all pr-2">
        {Array.from({ length: settings.tableCount }).map((_, i) => {
          const tableNum = i + 1;
          const status = getTableStatus(tableNum);
          const sess = getSessForTable(tableNum);

          return (
            <button key={tableNum} onClick={() => {
              setSelectedTable(tableNum);
              const s = getSessForTable(tableNum);
              setSelectedWaiterId(s?.waiterId || '');
              setActiveModalTab(status === 'billing' ? 'CHECKOUT' : 'LAUNCH');
              setIsUnregisteredClient(false);
              setManualClientName(s?.clientName || '');
              setManualClientPhone(s?.clientPhone || '');
              setManualClientEmail(s?.clientEmail || '');
              setManualClientDocument(s?.clientDocument || '');
              setManualClientAddress(s?.clientAddress || '');
              setManualClientCep('');
              setClientSearch('');
              setSelectedClient(null);
            }}
              className={`relative h-44 rounded-[2.5rem] border-4 transition-all duration-300 flex flex-col items-center justify-center gap-2 shadow-sm ${status === 'available' ? 'bg-white border-emerald-50 text-emerald-600 hover:border-emerald-300' :
                status === 'occupied' ? 'bg-red-600 border-red-700 text-white hover:bg-red-700' :
                  status === 'pending_digital' ? 'bg-[#C026D3] border-fuchsia-700 text-white hover:bg-fuchsia-700 shadow-[0_0_15px_rgba(192,38,211,0.4)]' :
                    'bg-orange-500 border-orange-600 text-white hover:bg-orange-600 animate-moderate-blink'
                }`}
            >
              <span className="text-2xl font-black shrink-0">Mesa {tableNum}</span>
              {sess && (sess.items.length > 0 || sess.hasPendingDigital) && (
                <div className="text-center w-full px-2 overflow-hidden flex flex-col items-center">
                  <p className="text-[10px] font-black mt-1 opacity-80 w-[95%] text-ellipsis overflow-hidden whitespace-nowrap block">{sess.clientName || 'Consumo'}</p>
                  <p className="text-sm font-black shrink-0 mt-0.5">R$ {sess.items.reduce((acc, it) => acc + (it.price * it.quantity), 0).toFixed(2)}</p>
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* MODAL GESTÃO DE MESA SELECIONADA */}
      {selectedTable !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white rounded-[3rem] shadow-2xl w-full max-w-5xl h-[85vh] flex flex-col overflow-hidden animate-in zoom-in duration-200 border border-white/20">
            <div className="p-8 border-b bg-slate-50 flex justify-between items-center">
              <div className="flex items-center gap-6">
                <div className={`w-16 h-16 rounded-2xl flex items-center justify-center text-white text-3xl font-black shadow-xl ${getTableStatus(selectedTable) === 'available' ? 'bg-emerald-500' : getTableStatus(selectedTable) === 'pending_digital' ? 'bg-[#C026D3]' : 'bg-red-600'}`}>{selectedTable}</div>
                <div>
                  <h3 className="text-2xl font-black text-slate-800 uppercase tracking-tighter">Painel da Mesa {selectedTable}</h3>
                  <p className="text-xs text-slate-400 font-bold uppercase tracking-widest">{getSessForTable(selectedTable)?.startTime ? `Aberta às ${new Date(getSessForTable(selectedTable)!.startTime).toLocaleTimeString()}` : 'Aguardando Atendimento'}</p>
                </div>
              </div>
              <button onClick={() => setSelectedTable(null)} className="p-4 text-slate-400 hover:text-slate-600 transition-transform active:rotate-90"><svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg></button>
            </div>

            <div className="flex flex-1 min-h-0">
              <div className="w-24 bg-slate-100 border-r flex flex-col">
                <button onClick={() => setActiveModalTab('LAUNCH')} className={`flex-1 flex flex-col items-center justify-center gap-1 transition-all ${activeModalTab === 'LAUNCH' ? 'bg-white text-blue-600 border-r-4 border-blue-600 shadow-inner' : 'text-slate-400 hover:bg-slate-200'}`}><Icons.Dashboard /><span className="text-[10px] font-black uppercase">Lançar</span></button>
                <button onClick={() => setActiveModalTab('REMOVE')} className={`flex-1 flex flex-col items-center justify-center gap-1 transition-all ${activeModalTab === 'REMOVE' ? 'bg-white text-red-600 border-r-4 border-red-600 shadow-inner' : 'text-slate-400 hover:bg-slate-200'}`}><svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg><span className="text-[10px] font-black uppercase">Estornar</span></button>
                <button onClick={() => setActiveModalTab('CONSUMPTION')} className={`flex-1 flex flex-col items-center justify-center gap-1 transition-all ${activeModalTab === 'CONSUMPTION' ? 'bg-white text-indigo-600 border-r-4 border-indigo-600 shadow-inner' : 'text-slate-400 hover:bg-slate-200'}`}><Icons.View /><span className="text-[10px] font-black uppercase">Consumo</span></button>
                <button onClick={() => setActiveModalTab('CHECKOUT')} className={`flex-1 flex flex-col items-center justify-center gap-1 transition-all ${activeModalTab === 'CHECKOUT' ? 'bg-white text-emerald-600 border-r-4 border-emerald-600 shadow-inner' : 'text-slate-400 hover:bg-slate-200'}`}><Icons.Print /><span className="text-[10px] font-black uppercase">Fechar</span></button>
              </div>

              <div className="flex-1 p-12 overflow-y-auto relative">
                {activeModalTab === 'LAUNCH' && (
                  <div className="space-y-8">
                    {getTableStatus(selectedTable) === 'billing' && (
                      <div className="absolute inset-0 z-10 bg-white/60 backdrop-blur-[2px] flex items-center justify-center rounded-[2rem] p-8">
                        <div className="bg-red-50 p-8 rounded-[2rem] border border-red-200 text-center max-w-sm shadow-xl animate-in zoom-in duration-300">
                          <div className="text-red-500 mb-4 flex justify-center"><Icons.Dashboard /></div>
                          <h4 className="text-lg font-black text-red-700 uppercase mb-2">Mesa Bloqueada</h4>
                          <p className="text-[11px] font-bold text-red-600 uppercase">Esta mesa encontra-se em pré-fechamento. Para lançar novos itens, você deve Reabri-la pela área do PDV.</p>
                        </div>
                      </div>
                    )}
                    {getSessForTable(selectedTable)?.hasPendingDigital && (
                      <div className="bg-fuchsia-50 border-2 border-fuchsia-200 rounded-3xl p-6 shadow-sm overflow-hidden mb-8">
                        <div className="flex items-center gap-4 mb-4">
                          <div className="bg-fuchsia-600 text-white p-3 rounded-2xl shadow-lg"><Icons.Dashboard /></div>
                          <div>
                            <h4 className="text-lg font-black text-fuchsia-800 uppercase tracking-tighter">Pedidos do Cardápio Digital</h4>
                            <p className="text-[10px] font-bold text-fuchsia-600/80 uppercase">Confira os itens e selecione o Garçom abaixo para Aprovar</p>
                          </div>
                        </div>
                        <div className="bg-white rounded-2xl p-4 space-y-2 mb-4">
                          {JSON.parse(getSessForTable(selectedTable)?.pendingReviewItems || '[]').map((it: any, i: number) => {
                            const prod = products.find(p => p.id === it.productId);
                            return (
                              <div key={i} className="flex flex-col bg-slate-50 p-3 rounded-xl border border-slate-100">
                                <p className="font-black text-slate-800 text-sm">{it.quantity}x <span className="uppercase">{prod?.name || 'Item Desconhecido'}</span></p>
                                {it.observations && <span className="text-[10px] text-orange-500 font-bold bg-orange-50 px-2 py-1 rounded-lg mt-1 w-fit">Obs: {it.observations}</span>}
                              </div>
                            );
                          })}
                        </div>
                        <div className="flex flex-col gap-3 relative z-10 mt-2">
                          <button onClick={() => approveDigitalOrders(selectedTable!)} className="w-full bg-fuchsia-600 hover:bg-fuchsia-700 text-white font-black py-4 rounded-xl transition-all shadow-lg text-sm uppercase flex items-center justify-center gap-2">Aprovar e Lançar Ordem ✓</button>
                          <button onClick={() => rejectDigitalOrders(selectedTable!)} className="w-full bg-red-50 hover:bg-red-500 text-red-600 hover:text-white border border-red-200 hover:border-red-500 font-black py-3 rounded-xl transition-all shadow-sm text-xs uppercase flex items-center justify-center gap-2">Excluir Pedido Incorreto ✗</button>
                        </div>
                      </div>
                    )}
                    <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm mb-6">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2">Selecione o Garçom da Mesa:</label>
                      <select disabled={getTableStatus(selectedTable) === 'billing'} value={selectedWaiterId} onChange={(e) => setSelectedWaiterId(e.target.value)} className="w-full max-w-sm p-4 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold focus:ring-4 focus:ring-blue-100 transition-all outline-none disabled:opacity-50">
                        <option value="">Selecione...</option>
                        {waiters.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                      </select>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                      {products.map(prod => (
                        <button
                          key={prod.id}
                          onClick={() => {
                            setSelectedProductForLaunch(prod);
                            setModalObservation('');
                          }}
                          className={`p-5 bg-white border rounded-[2.5rem] shadow-sm transition-all duration-200 text-left group relative overflow-hidden active:scale-95 hover:scale-[1.02] ${lastAddedProduct === prod.id
                            ? 'border-emerald-500 ring-4 ring-emerald-50 scale-95'
                            : 'border-slate-100 hover:border-blue-200 hover:shadow-lg'
                            }`}
                        >
                          <div className="aspect-square mb-4 bg-slate-50 rounded-3xl flex items-center justify-center overflow-hidden">
                            <img src={formatImageUrl(prod.imageUrl)} onError={e => e.currentTarget.src = PLACEHOLDER_FOOD_IMAGE} className="w-full h-full object-contain group-hover:scale-110 transition-transform duration-500" />
                          </div>
                          <p className="text-[11px] font-black text-slate-800 uppercase line-clamp-1">{prod.name}</p>
                          <div className="flex justify-between items-center mt-1">
                            <p className="text-sm font-black text-blue-600">R$ {prod.price.toFixed(2)}</p>
                            {lastAddedProduct === prod.id && (
                              <span className="bg-emerald-500 text-white text-[8px] font-black px-2 py-1 rounded-full animate-bounce">OK!</span>
                            )}
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {activeModalTab === 'REMOVE' && (
                  <div className="space-y-3">
                    <div className="bg-red-50 p-6 rounded-[2.5rem] border border-red-100 flex items-center gap-4 mb-4"><div className="bg-red-500 p-4 rounded-2xl text-white shadow-lg shrink-0"><svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg></div><p className="text-red-700 text-sm font-black uppercase">Estorno por Unidade (Auditado)</p></div>
                    {getSessForTable(selectedTable)?.items.map(item => (<div key={item.uid} className="flex justify-between items-center p-6 bg-white border border-slate-100 rounded-3xl shadow-sm"><div className="flex-1 min-w-0"><p className="font-black text-slate-800 uppercase text-sm truncate">{products.find(p => p.id === item.productId)?.name}</p><p className="text-[10px] font-bold text-slate-400 mt-1 uppercase tracking-widest">{item.price.toFixed(2)} • {item.isReady ? 'CONCLUÍDO' : 'PENDENTE'}</p></div><button onClick={() => removeProduct(item.uid)} className="p-4 bg-red-50 text-red-600 rounded-2xl hover:bg-red-500 hover:text-white transition-all shadow-sm"><svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg></button></div>))}
                  </div>
                )}

                {activeModalTab === 'CONSUMPTION' && (
                  <div className="space-y-6">
                    <div className="flex justify-between items-center"><div><h4 className="text-xl font-black text-slate-800 uppercase tracking-tighter">Prévia de Consumo</h4><p className="text-xs text-slate-400 font-bold uppercase tracking-widest">Conferência Agrupada dos Itens</p></div><button onClick={() => setShowConsumptionTicket(true)} className="px-6 py-4 bg-indigo-600 text-white rounded-2xl text-[10px] font-black uppercase shadow-xl hover:bg-indigo-700 transition-all flex items-center gap-2"><Icons.Print /> Cupom de Conferência</button></div>
                    <div className="bg-slate-50 rounded-[2rem] p-8 border border-slate-100 space-y-3 font-receipt shadow-inner">
                      {getGroupedItems(getSessForTable(selectedTable)?.items || []).map((it, idx) => (
                        <div key={idx} className="flex justify-between border-b border-dashed border-slate-200 pb-2">
                          <span className="font-bold text-[13px]">{it.quantity}x {it.product?.name.toUpperCase()}</span>
                          <span className="font-black text-[13px]">R$ {(it.quantity * it.price).toFixed(2)}</span>
                        </div>
                      ))}
                      {settings.serviceFeeStatus && (
                        <div className="flex justify-between border-b border-dashed border-slate-200 pb-2 text-slate-500">
                          <span className="font-bold text-[11px] uppercase">Taxa de Serviço ({settings.serviceFeePercentage || 10}%)</span>
                          <span className="font-black text-[12px]">R$ {((getSessForTable(selectedTable)?.items.reduce((acc, it) => acc + (it.price * it.quantity), 0) || 0) * (settings.serviceFeePercentage || 10) / 100).toFixed(2)}</span>
                        </div>
                      )}
                      <div className="pt-6 flex justify-between items-end"><span className="font-black text-[11px] uppercase opacity-50">Total Mesa:</span><span className="text-4xl font-black text-indigo-600">R$ {(
                        (getSessForTable(selectedTable)?.items.reduce((acc, it) => acc + (it.price * it.quantity), 0) || 0) +
                        (settings.serviceFeeStatus ? ((getSessForTable(selectedTable)?.items.reduce((acc, it) => acc + (it.price * it.quantity), 0) || 0) * (settings.serviceFeePercentage || 10) / 100) : 0)
                      ).toFixed(2)}</span></div>
                    </div>
                  </div>
                )}

                {activeModalTab === 'CHECKOUT' && (
                  <div className="flex flex-col items-center justify-center h-full">
                    <div className="text-center mb-8"><p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Valor Total da Conta</p><h4 className="text-6xl font-black text-slate-900 tracking-tighter">R$ {(
                      (getSessForTable(selectedTable)?.items.reduce((acc, it) => acc + (it.price * it.quantity), 0) || 0) +
                      (settings.serviceFeeStatus ? ((getSessForTable(selectedTable)?.items.reduce((acc, it) => acc + (it.price * it.quantity), 0) || 0) * (settings.serviceFeePercentage || 10) / 100) : 0)
                    ).toFixed(2)}</h4></div>
                    <div className="w-full max-w-2xl bg-slate-50 p-8 rounded-[2rem] border border-slate-100 space-y-6">
                      <div className="flex items-center justify-between"><label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Identificação do Cliente</label><button onClick={() => { setIsUnregisteredClient(!isUnregisteredClient); setSelectedClient(null); setManualClientName(''); setManualClientPhone(''); setManualClientAddress(''); setManualClientCep(''); setClientSearch(''); setManualClientEmail(''); setManualClientDocument(''); }} className={`text-[9px] font-black uppercase px-2 py-1 rounded-lg transition-all ${isUnregisteredClient ? 'bg-blue-600 text-white shadow-md' : 'bg-slate-200 text-slate-500'}`}>{isUnregisteredClient ? 'Mudar para Base' : 'Cliente Avulso?'}</button></div>
                      {isUnregisteredClient ? (
                        <div className="space-y-3 animate-in zoom-in-95">
                          <div className="flex gap-2">
                            <div className="flex-1 space-y-1">
                              <label className={`text-[9px] font-black uppercase tracking-widest ml-1 ${errors.manualClientName ? 'text-red-500' : 'text-slate-400'}`}>Nome Completo *</label>
                              <input
                                type="text"
                                placeholder="Nome do Cliente"
                                value={manualClientName}
                                onChange={e => {
                                  setManualClientName(toTitleCase(e.target.value));
                                  if (errors.manualClientName) setErrors(prev => ({ ...prev, manualClientName: false }));
                                }}
                                className={`w-full p-4 bg-white border-2 rounded-2xl text-[11px] font-black uppercase outline-none focus:ring-4 focus:ring-blue-50 transition-all ${errors.manualClientName ? 'border-red-500 animate-shake' : 'border-slate-200'}`}
                              />
                            </div>
                            <div className="w-1/3 space-y-1">
                              <label className={`text-[9px] font-black uppercase tracking-widest ml-1 ${errors.manualClientPhone ? 'text-red-500' : 'text-slate-400'}`}>Telefone *</label>
                              <input
                                type="text"
                                placeholder="(00) 9 0000-0000"
                                value={manualClientPhone}
                                onChange={e => {
                                  setManualClientPhone(maskPhone(e.target.value));
                                  if (errors.manualClientPhone) setErrors(prev => ({ ...prev, manualClientPhone: false }));
                                }}
                                className={`w-full p-4 bg-white border-2 rounded-2xl text-[11px] font-black uppercase outline-none focus:ring-4 focus:ring-blue-50 transition-all ${errors.manualClientPhone ? 'border-red-500 animate-shake' : 'border-slate-200'}`}
                              />
                            </div>
                          </div>
                          <div className="flex gap-2">
                            <div className="flex-1 space-y-1">
                              <label className={`text-[9px] font-black uppercase tracking-widest ml-1 ${errors.manualClientEmail ? 'text-red-500' : 'text-slate-400'}`}>E-mail</label>
                              <input
                                type="email"
                                placeholder="Email"
                                value={manualClientEmail}
                                onChange={e => {
                                  setManualClientEmail(e.target.value);
                                  if (errors.manualClientEmail) setErrors(prev => ({ ...prev, manualClientEmail: false }));
                                }}
                                className={`w-full p-4 bg-white border-2 rounded-2xl text-[11px] font-black uppercase outline-none focus:ring-4 focus:ring-blue-50 transition-all ${errors.manualClientEmail ? 'border-red-500 animate-shake' : 'border-slate-200'}`}
                              />
                            </div>
                            <div className="flex-1 space-y-1">
                              <label className={`text-[9px] font-black uppercase tracking-widest ml-1 ${errors.manualClientDocument ? 'text-red-500' : 'text-slate-400'}`}>CPF / CNPJ</label>
                              <input
                                type="text"
                                placeholder="000.000.000-00"
                                value={manualClientDocument}
                                onChange={e => {
                                  setManualClientDocument(maskDocument(e.target.value));
                                  if (errors.manualClientDocument) setErrors(prev => ({ ...prev, manualClientDocument: false }));
                                }}
                                className={`w-full p-4 bg-white border-2 rounded-2xl text-[11px] font-black uppercase outline-none focus:ring-4 focus:ring-blue-50 transition-all ${errors.manualClientDocument ? 'border-red-500 animate-shake' : 'border-slate-200'}`}
                              />
                            </div>
                          </div>
                          <div className="flex gap-2 items-start">
                            <div className="w-1/3 relative shrink-0">
                              <input
                                type="text"
                                placeholder="CEP"
                                maxLength={8}
                                value={manualClientCep}
                                onChange={async e => {
                                  const cep = e.target.value.replace(/\D/g, '').slice(0, 8);
                                  setManualClientCep(cep);
                                  if (cep.length === 8) {
                                    setIsLoadingCep(true);
                                    try {
                                      const res = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
                                      const data = await res.json();
                                      if (!data.erro) {
                                        const newAddress = `${data.logradouro}, , ${data.bairro}, ${data.localidade} - ${data.uf}`;
                                        setManualClientAddress(newAddress);
                                      }
                                    } catch (err) {
                                      console.error('ViaCep error:', err);
                                    } finally {
                                      setIsLoadingCep(false);
                                    }
                                  }
                                }}
                                className={`w-full p-4 bg-white border border-slate-200 rounded-2xl text-[11px] font-black uppercase outline-none focus:ring-4 focus:ring-blue-50 transition-all ${isLoadingCep ? 'opacity-50' : ''}`}
                              />
                              {isLoadingCep && (
                                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                                  <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                                </div>
                              )}
                            </div>
                            <textarea className="flex-1 w-full p-4 bg-white border border-slate-200 rounded-2xl text-[11px] font-black uppercase outline-none focus:ring-4 focus:ring-blue-50 transition-all h-20 resize-none" placeholder="Endereço (Opcional)" value={manualClientAddress} onChange={(e) => setManualClientAddress(e.target.value)} />
                          </div>
                        </div>
                      ) : (
                        <div className="relative animate-in zoom-in-95">
                          <input type="text" className="w-full p-4 bg-white border border-slate-200 rounded-2xl text-[11px] font-black uppercase outline-none focus:ring-4 focus:ring-emerald-50 transition-all" placeholder="Pesquisar por Nome ou Fone..." value={clientSearch} onChange={(e) => { setClientSearch(e.target.value); setShowClientList(true); }} />
                          {showClientList && clientSearch && (
                            <div className="absolute z-30 w-full bg-white border border-slate-200 rounded-2xl shadow-2xl max-h-56 overflow-y-auto mt-3 p-2">
                              {clients.filter(c => c.name.toLowerCase().includes(clientSearch.toLowerCase())).map(c => (<button key={c.id} onClick={() => { setSelectedClient(c); setClientSearch(c.name); setShowClientList(false); }} className="w-full text-left p-4 hover:bg-slate-50 border-b border-slate-50 last:border-0 rounded-2xl"><p className="text-xs font-black text-slate-800 uppercase tracking-tighter">{c.name}</p><p className="text-[10px] text-slate-400 font-bold">{c.phone}</p></button>))}
                            </div>
                          )}
                          {selectedClient && <div className="mt-4 bg-emerald-50 p-4 rounded-2xl border border-emerald-100 flex justify-between items-center animate-in fade-in"><div className="flex-1 min-w-0"><p className="text-[10px] font-black text-emerald-700 uppercase">{selectedClient.name}</p><p className="text-[8px] text-emerald-400 truncate uppercase">{selectedClient.addresses[0]}</p></div><button onClick={() => setSelectedClient(null)} className="text-emerald-400 font-black px-2 text-xl">×</button></div>}
                        </div>
                      )}
                      <button onClick={() => { const sess = getSessForTable(selectedTable!); if (sess) startBillingRequest(sess); }} disabled={getSessForTable(selectedTable)?.items.length === 0} className="w-full py-5 bg-orange-500 text-white font-black text-xs uppercase tracking-widest rounded-2xl shadow-xl shadow-orange-100 hover:bg-orange-600 transition-all active:scale-95 disabled:opacity-50">Solicitar Pré-Fechamento / Ir para Cupom</button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DE OBSERVAÇÃO PARA LANÇAMENTO */}
      {selectedProductForLaunch !== null && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in zoom-in duration-200">
          <div className="bg-white rounded-[2rem] shadow-2xl p-8 w-full max-w-sm border border-white/20">
            <h3 className="text-lg font-black text-slate-800 uppercase mb-2 tracking-tighter text-center">Lançar Item</h3>
            <p className="text-center text-[10px] font-bold text-slate-400 uppercase mb-6">{selectedProductForLaunch.name}</p>
            <div className="space-y-6">
              <div>
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 block">Deseja adicionar alguma observação?</label>
                <input autoFocus type="text" placeholder="Ex: Sem sal, bem passado..." value={modalObservation} onChange={(e) => setModalObservation(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && confirmLaunchProduct()} className="w-full p-4 bg-slate-100 rounded-2xl border-none focus:ring-2 focus:ring-blue-600 font-bold text-sm outline-none placeholder:font-normal" maxLength={60} />
              </div>
              <div className="flex gap-2">
                <button onClick={() => setSelectedProductForLaunch(null)} className="flex-1 py-4 font-black text-[10px] uppercase text-slate-400 hover:text-slate-600 transition-colors">Cancelar</button>
                <button onClick={confirmLaunchProduct} className="flex-1 py-4 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-black text-[10px] uppercase shadow-xl hover:shadow-blue-200 transition-all active:scale-95">Confirmar ✓</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DE VISUALIZAÇÃO PRÉVIA (CUPOM DE CONFERÊNCIA) - REFATORADO COM AGRUPAMENTO */}

      {(showConsumptionTicket || isConfirmingBilling) && (printingPreBill || getSessForTable(selectedTable!)) && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-slate-900/90 backdrop-blur-xl animate-in fade-in duration-300">
          <div className="relative w-full max-w-[80mm] bg-white p-8 border border-dashed shadow-2xl font-receipt text-black overflow-hidden animate-in zoom-in duration-300 print-container is-receipt rounded-sm">
            <div className="text-center mb-6 border-b border-dashed border-slate-300 pb-4">
              <h2 className="font-black text-sm uppercase tracking-tighter">{settings.name}</h2>
              <p className="text-[9px] font-bold mt-1 uppercase opacity-60">{isConfirmingBilling ? 'Solicitação de Fechamento' : 'Conferência de Consumo'}</p>
              <div className="mt-4 bg-slate-900 text-white py-1 px-3 inline-block rounded-md font-black text-xs uppercase">MESA {selectedTable}</div>
            </div>

            <div className="space-y-2 mb-6">
              <div className="border-b border-dashed border-slate-200 pb-2 flex flex-col gap-0.5">
                <p className="text-[10px] font-black opacity-50 uppercase">Cliente:</p>
                <p className="text-[12px] font-black uppercase truncate">
                  {isConfirmingBilling
                    ? (isUnregisteredClient ? manualClientName.toUpperCase() : (selectedClient?.name.toUpperCase() || 'CONSUMIDOR PADRÃO'))
                    : (getSessForTable(selectedTable!)?.clientName?.toUpperCase() || 'EM ATENDIMENTO')}
                </p>
                {(isConfirmingBilling ? (isUnregisteredClient ? manualClientPhone : selectedClient?.phone) : getSessForTable(selectedTable!)?.clientPhone) && (
                  <p className="text-[10px] font-bold text-slate-500 italic mt-0.5">CONTATO: {isConfirmingBilling ? (isUnregisteredClient ? manualClientPhone : selectedClient?.phone) : getSessForTable(selectedTable!)?.clientPhone}</p>
                )}
              </div>

              <div className="py-2">
                {getGroupedItems((isConfirmingBilling ? printingPreBill : getSessForTable(selectedTable!))?.items || []).map((it, i) => (
                  <div key={i} className="flex justify-between items-start gap-4 animate-in slide-in-from-left duration-200" style={{ animationDelay: `${i * 30}ms` }}>
                    <span className={`font-bold text-[12px] leading-tight flex-1 uppercase ${it.allReady ? 'text-slate-800' : 'text-slate-400'}`}>
                      {it.quantity}x {it.product?.name.toUpperCase()} {it.allReady ? '✓' : ''}
                    </span>
                    <span className="font-black text-[12px] whitespace-nowrap">R$ {(it.quantity * it.price).toFixed(2)}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="border-t border-dashed border-slate-900 pt-4 mb-8">
              {settings.serviceFeeStatus && (
                <div className="flex justify-between items-end mb-1 opacity-70">
                  <span className="font-black text-[9px] uppercase">Taxa Receb. ({settings.serviceFeePercentage || 10}%)</span>
                  <span className="font-black text-[10px]">R$ {(((isConfirmingBilling ? printingPreBill : getSessForTable(selectedTable!))?.items.reduce((acc, it) => acc + (it.price * it.quantity), 0) || 0) * (settings.serviceFeePercentage || 10) / 100).toFixed(2)}</span>
                </div>
              )}
              <div className="flex justify-between items-end">
                <span className="font-black text-[10px] uppercase opacity-50">Total Mesa:</span>
                <span className="text-2xl font-black">R$ {(
                  ((isConfirmingBilling ? printingPreBill : getSessForTable(selectedTable!))?.items.reduce((acc, it) => acc + (it.price * it.quantity), 0) || 0) +
                  (settings.serviceFeeStatus ? (((isConfirmingBilling ? printingPreBill : getSessForTable(selectedTable!))?.items.reduce((acc, it) => acc + (it.price * it.quantity), 0) || 0) * (settings.serviceFeePercentage || 10) / 100) : 0)
                ).toFixed(2)}</span>
              </div>
            </div>

            <div className="flex flex-col gap-2 no-print">
              {isConfirmingBilling ? (
                <button onClick={confirmBilling} className="w-full bg-blue-600 text-white py-4 rounded-xl font-black uppercase text-[10px] shadow-lg shadow-blue-100 hover:bg-blue-700 transition-all flex items-center justify-center gap-2">
                  <Icons.Dashboard /> Confirmar Envio ao PDV
                </button>
              ) : (
                <button onClick={() => window.print()} className="w-full bg-slate-900 text-white py-4 rounded-xl font-black uppercase text-[10px] shadow-lg hover:bg-black transition-all flex items-center justify-center gap-2">
                  <Icons.Print /> Imprimir Cupom
                </button>
              )}
              <button onClick={() => { setShowConsumptionTicket(false); setIsConfirmingBilling(false); }} className="w-full py-3 text-slate-400 font-black uppercase text-[9px] hover:text-red-500 transition-all">Cancelar / Voltar</button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DE MENSAGENS / FEEDBACK */}
      {showFeedbacks && (
        <div className="fixed inset-0 z-[100] flex items-center justify-end p-4 bg-slate-900/60 backdrop-blur-sm">
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
                  <div key={fb.id} className="bg-slate-50 border border-slate-100 p-5 rounded-[2rem] shadow-sm animate-in fade-in slide-in-from-bottom-2" style={{ animationDelay: `${i * 50}ms` }}>
                    <div className="flex justify-between items-start mb-3">
                      <div className="flex items-center gap-2">
                        <div className="bg-indigo-600 text-white w-8 h-8 rounded-xl flex items-center justify-center text-[10px] font-black">M{fb.tableNumber}</div>
                        <span className="text-xs font-black text-slate-800 uppercase tracking-tight">{fb.name || 'Cliente Anônimo'}</span>
                      </div>
                      <span className="text-[8px] font-bold text-slate-400 uppercase">{new Date(fb.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
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
      )}
    </div>
  );
};

export default Tables;
