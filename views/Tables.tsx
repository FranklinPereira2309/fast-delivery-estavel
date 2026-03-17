
import React, { useState, useEffect, useMemo } from 'react';
import { db } from '../services/db';
import { socket } from '../services/socket';
import { TableSession, Product, User, OrderItem, Order, OrderStatus, SaleType, Waiter, Client, BusinessSettings } from '../types';
import { Icons, PLACEHOLDER_FOOD_IMAGE, formatImageUrl } from '../constants';
import CustomAlert from '../components/CustomAlert';
import { useDigitalAlert } from '../hooks/useDigitalAlert';
import { validateEmail, validateCPF, validateCNPJ, maskPhone, maskDocument, toTitleCase } from '../services/validationUtils';
import { formatAddress } from '../services/formatUtils';
import WaiterAuthModal from '../components/WaiterAuthModal';
import { useToast } from '../hooks/useToast';

interface TablesProps {
  currentUser: User;
}

const Tables: React.FC<TablesProps> = ({ currentUser }) => {
  const { addToast } = useToast();
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
  const [manualClientStreet, setManualClientStreet] = useState('');
  const [manualClientNumber, setManualClientNumber] = useState('');
  const [manualClientNeighborhood, setManualClientNeighborhood] = useState('');
  const [manualClientCity, setManualClientCity] = useState('');
  const [manualClientState, setManualClientState] = useState('');
  const [manualClientComplement, setManualClientComplement] = useState('');
  const [manualClientCep, setManualClientCep] = useState('');
  const [isLoadingCep, setIsLoadingCep] = useState(false);
  const [clientSearch, setClientSearch] = useState('');
  const [showClientList, setShowClientList] = useState(false);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [errors, setErrors] = useState<Record<string, boolean>>({});

  const [alertConfig, setAlertConfig] = useState<{ isOpen: boolean, title: string, message: string, onConfirm: () => void, onCancel?: () => void, type: 'INFO' | 'DANGER' | 'SUCCESS' }>({
    isOpen: false, title: '', message: '', onConfirm: () => { }, type: 'INFO'
  });

  const [waiterAuth, setWaiterAuth] = useState<{
    isOpen: boolean;
    waiter: Waiter | null;
    actionDescription: string;
    onSuccess: (waiterId: string) => void;
  }>({ isOpen: false, waiter: null, actionDescription: '', onSuccess: () => { } });

  const [transferModal, setTransferModal] = useState<{ isOpen: boolean, sourceTable: number | null }>({ isOpen: false, sourceTable: null });
  const [transferTargetStr, setTransferTargetStr] = useState('');
  const [authenticatedWaiters, setAuthenticatedWaiters] = useState<Record<number, string>>({});

  const requireWaiterAuth = (waiterId: string, actionDesc: string): Promise<string> => {
    return new Promise((resolve, reject) => {
      const waiter = waiters.find(w => w.id === waiterId);
      if (!waiter) return reject(new Error('Garçom não encontrado'));

      setWaiterAuth({
        isOpen: true,
        waiter,
        actionDescription: actionDesc,
        onSuccess: (id) => {
          setWaiterAuth(prev => ({ ...prev, isOpen: false }));
          resolve(id);
        }
      });
    });
  };

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
    const [s, allSessions, prods, wa, cl] = await Promise.all([
      db.getSettings(),
      db.getTableSessions(),
      db.getProducts(),
      db.getWaiters(),
      db.getClients()
    ]);
    setSettings(s);
    // Enriquecer sessões com flag isSoftRejected para filtrar no PDV
    const enrichedSessions = allSessions.map(s => {
      let isSoftRejected = false;
      if (s.pendingReviewItems) {
        try {
          const parsed = JSON.parse(s.pendingReviewItems);
          if (parsed && typeof parsed === 'object' && !Array.isArray(parsed) && parsed.rejection) {
            isSoftRejected = true;
          }
        } catch (e) {
          if (s.pendingReviewItems.startsWith('REJECTED:')) isSoftRejected = true;
        }
      }
      return { ...s, isSoftRejected };
    });
    // Limpar cache de autenticação para mesas que foram liberadas ou mudaram de garçom
    setAuthenticatedWaiters(prev => {
      const next = { ...prev };
      let changed = false;
      Object.keys(next).forEach(tableNumStr => {
        const tableNum = parseInt(tableNumStr);
        const tSess = allSessions.find(s => s.tableNumber === tableNum);
        // Se a mesa ficou livre (e não estamos com ela aberta no modal) ou o garçom da sessão mudou, remove do cache local
        if ((!tSess && selectedTable !== tableNum) || (tSess && tSess.waiterId && next[tableNum] !== tSess.waiterId)) {
          delete next[tableNum];
          changed = true;
        }
      });
      return changed ? next : prev;
    });

    setSessions(enrichedSessions);
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
    if (!sess || (sess.isSoftRejected && sess.items.length === 0)) return 'available';
    if (sess.hasPendingDigital) return 'pending_digital';
    return sess.status;
  };

  const getSessForTable = (num: number) => {
    const s = sessions.find(s => s.tableNumber === num);
    // Para o PDV, se a sessão for apenas uma persistência de erro (Soft-Reject), tratamos como inexistente visualmente no painel de lançamento
    if (s?.isSoftRejected && s.items.length === 0) return undefined;
    return s;
  };

  const handleWaiterChange = async (newWaiterId: string) => {
    if (!selectedTable) return;
    if (!newWaiterId) {
      setSelectedWaiterId('');
      return;
    }

    const sess = getSessForTable(selectedTable);

    // Regra de Propriedade: Apenas o dono ou Admin pode assumir mesa ocupada se o trava estiver ligado.
    if (settings?.waiterLockEnabled && sess && sess.waiterId && sess.waiterId !== newWaiterId && !currentUser.permissions.includes('admin')) {
      return addToast({ title: "ACESSO NEGADO", message: "Esta mesa já está sendo atendida por outro garçom.", type: "DANGER" });
    }

    // Se já estiver autenticado localmente para esta mesa com este garçom, apenas troca
    if (authenticatedWaiters[selectedTable] === newWaiterId) {
      setSelectedWaiterId(newWaiterId);
      return;
    }

    // Autenticação obrigatória ao selecionar o garçom
    try {
      await requireWaiterAuth(newWaiterId, `Assumir atendimento da Mesa ${selectedTable}`);
      setAuthenticatedWaiters(prev => ({ ...prev, [selectedTable]: newWaiterId }));
      setSelectedWaiterId(newWaiterId);
    } catch (err) {
      // Se falhar ou cancelar, mantém o anterior ou limpa
      console.log("Autenticação de garçom cancelada");
    }
  };

  const confirmLaunchProduct = async () => {
    const product = selectedProductForLaunch;
    const observationStr = modalObservation;

    // Fechar a tela de "Lançar Item" imediatamente
    setSelectedProductForLaunch(null);
    setModalObservation('');

    console.log('Attempting to launch product:', product.name, 'to table:', selectedTable);
    if (selectedTable === null) return;
    if (!selectedWaiterId) {
      console.warn('Launch blocked: No waiter selected');
      return addToast({ title: "GARÇOM REQUERIDO", message: "Por favor, selecione o garçom responsável.", type: "DANGER" });
    }

    const existingSess = getSessForTable(selectedTable);

    // Ownership Rule: Only the owner or an Admin can edit an occupied table (if waiter lock is enabled).
    if (settings?.waiterLockEnabled && existingSess && existingSess.waiterId && existingSess.waiterId !== selectedWaiterId && !currentUser.permissions.includes('admin')) {
      return addToast({ title: "ACESSO NEGADO", message: "Esta mesa já está sendo atendida por outro garçom. O primeiro garçom a atender torna-se o dono da mesa.", type: "DANGER" });
    }

    if (getTableStatus(selectedTable) === 'billing') {
      return addToast({ title: "MESA BLOQUEADA", message: "Esta mesa está em processo de fechamento (Faturando). Para lançar mais itens, reabra a mesa.", type: "DANGER" });
    }

    // Require Waiter Authentication ONLY if not already authenticated locally for this session
    // NOTE: Removed per user request to only ask when waiter is selected, 
    // but keeping the cache check for safety if we decide to re-enable or for other actions.
    /*
    try {
      if (authenticatedWaiters[selectedTable] !== selectedWaiterId) {
        await requireWaiterAuth(selectedWaiterId, `Lançar ${product.name} na Mesa ${selectedTable}`);
        setAuthenticatedWaiters(prev => ({ ...prev, [selectedTable]: selectedWaiterId }));
      }
    } catch (authErr) {
      return; // Cancelled or failed auth
    }
    */

    const validation = await db.validateStockForOrder([{ productId: product.id, quantity: 1 }]);
    if (!validation.valid) {
      console.warn('Launch blocked: Out of stock', validation.message);
      return addToast({ title: "SEM ESTOQUE", message: validation.message || "Produto sem estoque.", type: "DANGER" });
    }

    const currentSess = getSessForTable(selectedTable);
    const newItem: OrderItem = {
      uid: `item-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      productId: product.id,
      quantity: 1,
      price: product.price,
      isReady: false,
      observations: observationStr || ''
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
      addToast({ title: "ERRO AO SALVAR", message: `Não foi possível adicionar o item: ${errorMessage}`, type: "DANGER" });
    }

    setLastAddedProduct(product.id);
    setTimeout(() => setLastAddedProduct(null), 800);
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
      return addToast({ title: "GARÇOM REQUERIDO", message: "Para oficializar estes itens, selecione qual garçom assumirá o atendimento dessa mesa.", type: "DANGER" });
    }

    // Ownership Rule
    if (sess.waiterId && sess.waiterId !== selectedWaiterId && !currentUser.permissions.includes('admin')) {
      return addToast({ title: "ACESSO NEGADO", message: "Esta mesa já pertence a outro garçom.", type: "DANGER" });
    }

    try {
      if (authenticatedWaiters[tableNum] !== selectedWaiterId) {
        await requireWaiterAuth(selectedWaiterId, `Aprovar Pedido Digital da Mesa ${tableNum}`);
        setAuthenticatedWaiters(prev => ({ ...prev, [tableNum]: selectedWaiterId }));
      }
    } catch (authErr) {
      return;
    }

    try {
      const pendingValue = sess.pendingReviewItems || '[]';
      let pendingItems = [];
      try {
        const parsed = JSON.parse(pendingValue);
        pendingItems = Array.isArray(parsed) ? parsed : [];
      } catch (e) {
        pendingItems = [];
      }

      // Stock Validation
      const validation = await db.validateStockForOrder(pendingItems);
      if (!validation.valid) {
        return addToast({ title: "SEM ESTOQUE", message: `Estoque insuficiente para os itens digitais: ${validation.message}`, type: "DANGER" });
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

      addToast({ title: "APROVADO!", message: "Itens confirmados e enviados para a Cozinha.", type: "SUCCESS" });
      await refreshData();
    } catch (err) {
      console.error("Erro ao aprovar digitais", err);
      addToast({ title: "ERRO", message: "Falha ao processar a aprovação.", type: "DANGER" });
    }
  };

  const rejectDigitalOrders = async (tableNum: number) => {
    const sess = getSessForTable(tableNum);
    if (!sess || !sess.hasPendingDigital) return;

    if (!selectedWaiterId) {
      return addToast({ title: "GARÇOM REQUERIDO", message: "Para rejeitar estes itens, selecione qual garçom está efetuando a ação.", type: "DANGER" });
    }

    // Ownership Rule
    if (sess.waiterId && sess.waiterId !== selectedWaiterId && !currentUser.permissions.includes('admin')) {
      return addToast({ title: "ACESSO NEGADO", message: "Esta mesa já pertence a outro garçom.", type: "DANGER" });
    }

    showAlert("Rejeitar Pedido", "Deseja rejeitar estes itens? O cliente será notificado", "DANGER", async () => {
      setAlertConfig(prev => ({ ...prev, isOpen: false })); // FECHA A MENSAGEM DE REJEITAR ANTES DE PEDIR PIN
      try {
        if (authenticatedWaiters[tableNum] !== selectedWaiterId) {
          await requireWaiterAuth(selectedWaiterId, `Rejeitar Pedido da Mesa ${tableNum}`);
          setAuthenticatedWaiters(prev => ({ ...prev, [tableNum]: selectedWaiterId }));
        }
      } catch (authErr) {
        return;
      }
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
        addToast({ title: "REJEITADO", message: "O pedido digital foi excluído com sucesso.", type: "SUCCESS" });
        await refreshData();
      } catch (err) {
        console.error("Erro ao rejeitar digitais", err);
        setAlertConfig(prev => ({ ...prev, isOpen: false }));
        addToast({ title: "ERRO", message: "Falha ao processar a rejeição.", type: "DANGER" });
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
      addToast({ title: 'CLIENTE NECESSÁRIO', message: 'Identifique o cliente para fechar a conta.', type: 'INFO' });
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
      return addToast({ title: "DADOS INVÁLIDOS", message: "Verifique os campos destacados em vermelho.", type: "DANGER" });
    }

    setErrors({});

    if (!isUnregisteredClient && !selectedClient) {
      return addToast({ title: "IDENTIFICAÇÃO REQUERIDA", message: "Por favor, selecione um cliente da base ou use a opção 'Avulso'.", type: "DANGER" });
    }

    setPrintingPreBill(sess);
    setIsConfirmingBilling(true);
  };

  const confirmBilling = async () => {
    if (!printingPreBill) return;

    const clientName = isUnregisteredClient ? toTitleCase(manualClientName) : (selectedClient?.name || 'Consumidor');
    const clientPhone = isUnregisteredClient ? manualClientPhone : selectedClient?.phone;
    const clientEmail = isUnregisteredClient ? manualClientEmail : selectedClient?.email;
    const clientDocument = isUnregisteredClient ? manualClientDocument : selectedClient?.document;
    const clientAddress = isUnregisteredClient ? toTitleCase(manualClientAddress) : selectedClient?.addresses[0];

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
          const manualData = {
            street: manualClientStreet,
            addressNumber: manualClientNumber,
            neighborhood: manualClientNeighborhood,
            city: manualClientCity,
            state: manualClientState,
            complement: manualClientComplement,
            cep: manualClientCep
          };

          const newClient: Client = {
            id: `CLIENT-${Date.now()}`,
            name: toTitleCase(manualClientName),
            phone: manualClientPhone.replace(/\D/g, ''),
            email: manualClientEmail || undefined,
            document: manualClientDocument || undefined,
            cep: manualClientCep || undefined,
            street: toTitleCase(manualClientStreet),
            addressNumber: manualClientNumber || undefined,
            neighborhood: toTitleCase(manualClientNeighborhood),
            city: toTitleCase(manualClientCity),
            state: manualClientState?.toUpperCase() || undefined,
            complement: manualClientComplement || undefined,
            addresses: [formatAddress({ ...manualData })],
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
      clientAddress: isUnregisteredClient ? formatAddress({
        street: manualClientStreet,
        addressNumber: manualClientNumber,
        neighborhood: manualClientNeighborhood,
        city: manualClientCity,
        state: manualClientState,
        complement: manualClientComplement,
        cep: manualClientCep
      }) : (selectedClient ? formatAddress(selectedClient) : undefined)
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
    setManualClientStreet('');
    setManualClientNumber('');
    setManualClientNeighborhood('');
    setManualClientCity('');
    setManualClientState('');
    setManualClientComplement('');
    setManualClientCep('');
    setClientSearch('');
    await refreshData();
    addToast({ title: "SUCESSO", message: "Solicitação de fechamento enviada ao PDV!", type: "SUCCESS" });
  };

  const handlePrintTable = async () => {
    const sessionToPrint = isConfirmingBilling ? printingPreBill : getSessForTable(selectedTable!);
    if (!sessionToPrint) return;

    const pseudoOrder: Order = {
      id: `TABLE-${sessionToPrint.tableNumber}`,
      clientId: sessionToPrint.clientId || 'ANONYMOUS',
      clientName: isConfirmingBilling ? (isUnregisteredClient ? manualClientName : (selectedClient?.name || 'CONSUMIDOR PADRÃO')) : (sessionToPrint.clientName || 'EM ATENDIMENTO'),
      clientPhone: isConfirmingBilling ? (isUnregisteredClient ? manualClientPhone : selectedClient?.phone) : sessionToPrint.clientPhone,
      items: sessionToPrint.items,
      total: sessionToPrint.items.reduce((acc, it) => acc + (it.price * it.quantity), 0) + (settings.serviceFeeStatus ? (sessionToPrint.items.reduce((acc, it) => acc + (it.price * it.quantity), 0) * (settings.serviceFeePercentage || 10) / 100) : 0),
      status: OrderStatus.PENDING,
      type: SaleType.TABLE,
      createdAt: sessionToPrint.startTime,
      tableNumber: sessionToPrint.tableNumber,
      appliedServiceFee: settings.serviceFeeStatus ? (sessionToPrint.items.reduce((acc, it) => acc + (it.price * it.quantity), 0) * (settings.serviceFeePercentage || 10) / 100) : 0,
    };

    if (!settings?.printerIp) {
      // In soft printer mode, we keep visual as fallback but the user wants "direct"
      // Since it's a browser, we can only window.print() if no thermal IP is set.
      addToast({ title: "Impressão", message: "Enviando para a impressora do sistema...", type: "INFO" });
      setTimeout(() => window.print(), 500);
      return;
    }

    try {
      const { sendOrderToThermalPrinter } = await import('../services/printService');
      const res = await sendOrderToThermalPrinter(pseudoOrder, settings);
      if (!res.fallback) {
        addToast({ title: "Impressão", message: "Conferência enviada para a impressora térmica", type: "SUCCESS" });
      }
    } catch(e: any) {
      addToast({ title: "Erro de Impressão", message: e.message || "Impressora Offline.", type: "DANGER" });
    }
  };

  if (!settings) return null;

  return (
    <div className="flex flex-col h-full gap-8 rounded-[2rem] p-2 transition-all duration-300" onClick={(e) => {
      // Dismiss the alerting state if active, but without visual feedback on the container
      if (isAlerting) dismissAlert();
    }}>
      <WaiterAuthModal
        isOpen={waiterAuth.isOpen}
        waiter={waiterAuth.waiter}
        actionDescription={waiterAuth.actionDescription}
        onSuccess={waiterAuth.onSuccess}
        onCancel={() => setWaiterAuth(prev => ({ ...prev, isOpen: false }))}
      />
      <CustomAlert {...alertConfig} onConfirm={alertConfig.onConfirm} onCancel={alertConfig.onCancel} />

      {/* Header Gestão de Mesas */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center bg-white dark:bg-slate-900 p-6 rounded-[2rem] border border-slate-100 dark:border-slate-800 shadow-sm gap-6">
        <div>
          <h2 className="text-2xl font-black text-slate-800 dark:text-white uppercase tracking-tighter">Gestão de Mesas</h2>
          <p className="text-xs text-slate-400 dark:text-slate-500 font-bold uppercase tracking-widest">Painel de Atendimento em Tempo Real</p>
        </div>
        <div className="flex flex-col xl:flex-row items-stretch xl:items-center gap-6 w-full sm:w-auto">
          <div className="grid grid-cols-2 sm:flex gap-4">
            <div className="flex items-center gap-1.5"><span className="w-2 h-2 bg-emerald-500 rounded-full animate-bounce"></span><span className="text-[10px] font-bold uppercase text-slate-400 dark:text-slate-500">Livre</span></div>
            <div className="flex items-center gap-1.5"><span className="w-2 h-2 bg-fuchsia-600 rounded-full animate-bounce"></span><span className="text-[10px] font-bold uppercase text-slate-400 dark:text-slate-500">App Digital</span></div>
            <div className="flex items-center gap-1.5"><span className="w-2 h-2 bg-red-600 rounded-full animate-bounce"></span><span className="text-[10px] font-bold uppercase text-slate-400 dark:text-slate-500">Ocupada</span></div>
            <div className="flex items-center gap-1.5"><span className="w-2 h-2 bg-orange-500 rounded-full animate-bounce"></span><span className="text-[10px] font-bold uppercase text-slate-400 dark:text-slate-500">Checkout</span></div>
          </div>

          <button
            onClick={() => {
              setShowFeedbacks(true);
              setHasNewFeedback(false);
            }}
            className={`flex items-center justify-center gap-2 px-6 py-3 rounded-2xl transition-all font-black uppercase text-[10px] relative ${hasNewFeedback ? 'bg-indigo-600 text-white animate-moderate-blink shadow-lg shadow-indigo-200' : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'}`}
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
            </svg>
            Mensagens do Dia
            {hasNewFeedback && <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full border-2 border-white dark:border-slate-900 animate-ping"></span>}
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

              if (s?.isSoftRejected) {
                // Se for rejeitado e não ter consumo visível, vai ficar available e abriremos no Laucn
                setActiveModalTab('LAUNCH');
              } else {
                setActiveModalTab(status === 'billing' ? 'CHECKOUT' : 'LAUNCH');
              }

              setIsUnregisteredClient(false);
              setManualClientName(s?.clientName || '');
              setManualClientPhone(s?.clientPhone || '');
              setManualClientEmail(s?.clientEmail || '');
              setManualClientDocument(s?.clientDocument || '');
              setManualClientAddress(s?.clientAddress || '');
              setManualClientStreet(s?.street || '');
              setManualClientNumber(s?.addressNumber || '');
              setManualClientNeighborhood(s?.neighborhood || '');
              setManualClientCity(s?.city || '');
              setManualClientState(s?.state || '');
              setManualClientComplement(s?.complement || '');
              setManualClientCep(s?.cep || '');
              setClientSearch('');
              setSelectedClient(null);
            }}
              className={`relative h-44 rounded-[2.5rem] border-4 transition-all duration-300 flex flex-col items-center justify-center gap-2 shadow-sm ${status === 'available' ? 'bg-white dark:bg-slate-800 border-emerald-50 dark:border-emerald-900/30 text-emerald-600 dark:text-emerald-400 hover:border-emerald-300 dark:hover:border-emerald-500' :
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-0 md:p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 rounded-none md:rounded-[3rem] shadow-2xl w-full max-w-5xl h-full md:h-[90vh] flex flex-col overflow-hidden animate-in zoom-in duration-200 border border-white/20 dark:border-slate-800">
            <div className="p-4 md:p-8 border-b dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 flex justify-between items-center shrink-0">
              <div className="flex items-center gap-6">
                <div className={`w-12 h-12 md:w-16 md:h-16 rounded-xl md:rounded-2xl flex items-center justify-center text-white text-xl md:text-3xl font-black shadow-xl ${getTableStatus(selectedTable) === 'available' ? 'bg-emerald-500' : getTableStatus(selectedTable) === 'pending_digital' ? 'bg-[#C026D3]' : 'bg-red-600'}`}>{selectedTable}</div>
                <div>
                  <h3 className="text-lg md:text-2xl font-black text-slate-800 dark:text-white uppercase tracking-tighter">Mesa {selectedTable}</h3>
                  <p className="text-[9px] md:text-xs text-slate-400 dark:text-slate-500 font-bold uppercase tracking-widest">{getSessForTable(selectedTable)?.startTime ? `Aberta às ${new Date(getSessForTable(selectedTable)!.startTime).toLocaleTimeString()}` : 'Aguardando Atendimento'}</p>
                </div>
              </div>
              <div className="flex items-center gap-4">
                {getTableStatus(selectedTable) === 'occupied' && (
                  <button
                    onClick={async () => {
                      const sess = getSessForTable(selectedTable);
                      if (!sess || !sess.waiterId) {
                        return showAlert("Erro", "Não é possível transferir a mesa sem um garçom responsável.", "DANGER");
                      }

                      setTransferTargetStr('');
                      setTransferModal({ isOpen: true, sourceTable: selectedTable });
                    }}
                    className="flex items-center gap-2 px-6 py-4 bg-orange-100 text-orange-600 font-black uppercase tracking-widest text-xs rounded-2xl hover:bg-orange-500 hover:text-white transition-all shadow-sm"
                  >
                    Transferir
                  </button>
                )}
                <button onClick={() => setSelectedTable(null)} className="p-4 bg-slate-200 dark:bg-slate-800 text-slate-500 dark:text-slate-400 rounded-2xl hover:bg-slate-300 dark:hover:bg-slate-700 hover:text-slate-800 dark:hover:text-white transition-all font-black uppercase text-xs tracking-widest flex items-center gap-2">Sair ✗</button>
              </div>
            </div>

            <div className="flex flex-col md:flex-row flex-1 min-h-0">
              <div className="flex md:flex-col w-full md:w-24 bg-slate-100 dark:bg-slate-800 border-b md:border-b-0 md:border-r dark:border-slate-700 shrink-0">
                <button onClick={() => setActiveModalTab('LAUNCH')} className={`flex-1 flex flex-col items-center justify-center py-3 md:py-0 gap-1 transition-all ${activeModalTab === 'LAUNCH' ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 border-b-4 md:border-b-0 md:border-r-4 border-blue-600 shadow-inner' : 'text-slate-400 dark:text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-700'}`}><Icons.Dashboard /><span className="text-[8px] md:text-[10px] font-black uppercase">Lançar</span></button>
                <button onClick={() => setActiveModalTab('REMOVE')} className={`flex-1 flex flex-col items-center justify-center py-3 md:py-0 gap-1 transition-all ${activeModalTab === 'REMOVE' ? 'bg-white dark:bg-slate-900 text-red-600 dark:text-red-400 border-b-4 md:border-b-0 md:border-r-4 border-red-600 shadow-inner' : 'text-slate-400 dark:text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-700'}`}><svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg><span className="text-[8px] md:text-[10px] font-black uppercase">Estornar</span></button>
                <button onClick={() => setActiveModalTab('CONSUMPTION')} className={`flex-1 flex flex-col items-center justify-center py-3 md:py-0 gap-1 transition-all ${activeModalTab === 'CONSUMPTION' ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 border-b-4 md:border-b-0 md:border-r-4 border-indigo-600 shadow-inner' : 'text-slate-400 dark:text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-700'}`}><Icons.View /><span className="text-[8px] md:text-[10px] font-black uppercase">Consumo</span></button>
                <button onClick={() => setActiveModalTab('CHECKOUT')} className={`flex-1 flex flex-col items-center justify-center py-3 md:py-0 gap-1 transition-all ${activeModalTab === 'CHECKOUT' ? 'bg-white dark:bg-slate-900 text-emerald-600 dark:text-emerald-400 border-b-4 md:border-b-0 md:border-r-4 border-emerald-600 shadow-inner' : 'text-slate-400 dark:text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-700'}`}><Icons.Print /><span className="text-[8px] md:text-[10px] font-black uppercase">Fechar</span></button>
              </div>

              <div className="flex-1 p-4 md:p-12 overflow-y-auto relative">
                {activeModalTab === 'LAUNCH' && (
                  <div className="space-y-8">
                    {getTableStatus(selectedTable) === 'billing' && (
                      <div className="absolute inset-0 z-10 bg-white/60 dark:bg-slate-900/60 backdrop-blur-[2px] flex items-center justify-center rounded-[2rem] p-8">
                        <div className="bg-red-50 dark:bg-red-900/20 p-8 rounded-[2rem] border border-red-200 dark:border-red-900/30 text-center max-w-sm shadow-xl animate-in zoom-in duration-300">
                          <div className="text-red-500 dark:text-red-400 mb-4 flex justify-center"><Icons.Dashboard /></div>
                          <h4 className="text-lg font-black text-red-700 dark:text-red-300 uppercase mb-2">Mesa Bloqueada</h4>
                          <p className="text-[11px] font-bold text-red-600 dark:text-red-400 uppercase">Esta mesa encontra-se em pré-fechamento. Para lançar novos itens, você deve Reabri-la pela área do PDV.</p>
                        </div>
                      </div>
                    )}
                    {getSessForTable(selectedTable)?.hasPendingDigital && !getSessForTable(selectedTable)?.isSoftRejected && (
                      <div className="bg-fuchsia-50 dark:bg-fuchsia-900/20 border-2 border-fuchsia-200 dark:border-fuchsia-900/40 rounded-3xl p-6 shadow-sm overflow-hidden mb-8">
                        <div className="flex items-center gap-4 mb-4">
                          <div className="bg-fuchsia-600 text-white p-3 rounded-2xl shadow-lg"><Icons.Dashboard /></div>
                          <div>
                            <h4 className="text-lg font-black text-fuchsia-800 dark:text-fuchsia-300 uppercase tracking-tighter">Pedidos do Cardápio Digital</h4>
                            <p className="text-[10px] font-bold text-fuchsia-600/80 dark:text-fuchsia-400 uppercase">Confira os itens e selecione o Garçom abaixo para Aprovar</p>
                          </div>
                        </div>
                        <div className="bg-white dark:bg-slate-800 rounded-2xl p-4 space-y-2 mb-4">
                          {(() => {
                            try {
                              const parsed = JSON.parse(getSessForTable(selectedTable)?.pendingReviewItems || '[]');
                              if (!Array.isArray(parsed)) return null;
                              return parsed.map((it: any, i: number) => {
                                const prod = products.find(p => p.id === it.productId);
                                return (
                                  <div key={i} className="flex flex-col bg-slate-50 dark:bg-slate-700/50 p-3 rounded-xl border border-slate-100 dark:border-slate-700">
                                    <p className="font-black text-slate-800 dark:text-white text-sm">{it.quantity}x <span className="uppercase">{prod?.name || 'Item Desconhecido'}</span></p>
                                    {it.observations && <span className="text-[10px] text-orange-500 font-bold bg-orange-50 dark:bg-orange-950/40 px-2 py-1 rounded-lg mt-1 w-fit">Obs: {it.observations}</span>}
                                  </div>
                                );
                              });
                            } catch (e) {
                              return null;
                            }
                          })()}
                        </div>
                        <div className="flex flex-col gap-3 relative z-10 mt-2">
                          <button onClick={() => approveDigitalOrders(selectedTable!)} className="w-full bg-fuchsia-600 hover:bg-fuchsia-700 text-white font-black py-4 rounded-xl transition-all shadow-lg text-sm uppercase flex items-center justify-center gap-2">Aprovar e Lançar Ordem ✓</button>
                          <button onClick={() => rejectDigitalOrders(selectedTable!)} className="w-full bg-red-50 hover:bg-red-500 text-red-600 hover:text-white border border-red-200 hover:border-red-500 font-black py-3 rounded-xl transition-all shadow-sm text-xs uppercase flex items-center justify-center gap-2">Excluir Pedido Incorreto ✗</button>
                        </div>
                      </div>
                    )}
                    <div className="bg-white dark:bg-slate-800 p-6 rounded-3xl border border-slate-100 dark:border-slate-700 shadow-sm mb-6">
                      <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest block mb-2">Selecione o Garçom da Mesa:</label>
                      <select disabled={getTableStatus(selectedTable) === 'billing'} value={selectedWaiterId} onChange={(e) => handleWaiterChange(e.target.value)} className="w-full max-w-sm p-4 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl text-sm font-bold focus:ring-4 focus:ring-blue-100 dark:focus:ring-blue-900 transition-all outline-none disabled:opacity-50 dark:text-white">
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
                          className={`p-5 bg-white dark:bg-slate-800 border rounded-[2.5rem] shadow-sm transition-all duration-200 text-left group relative overflow-hidden active:scale-95 hover:scale-[1.02] ${lastAddedProduct === prod.id
                            ? 'border-emerald-500 ring-4 ring-emerald-50 dark:ring-emerald-900/20 scale-95'
                            : 'border-slate-100 dark:border-slate-700 hover:border-blue-200 dark:hover:border-blue-500 hover:shadow-lg'
                            }`}
                        >
                          <div className="aspect-square mb-4 bg-slate-50 dark:bg-slate-900 rounded-3xl flex items-center justify-center overflow-hidden">
                            <img src={formatImageUrl(prod.imageUrl)} onError={e => e.currentTarget.src = PLACEHOLDER_FOOD_IMAGE} className="w-full h-full object-contain group-hover:scale-110 transition-transform duration-500" />
                          </div>
                          <p className="text-[11px] font-black text-slate-800 dark:text-white uppercase line-clamp-1">{prod.name}</p>
                          <div className="flex justify-between items-center mt-1">
                            <p className="text-sm font-black text-blue-600 dark:text-blue-400">R$ {prod.price.toFixed(2)}</p>
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
                    <div className="bg-red-50 dark:bg-red-900/20 p-6 rounded-[2.5rem] border border-red-100 dark:border-red-900/30 flex items-center gap-4 mb-4"><div className="bg-red-500 p-4 rounded-2xl text-white shadow-lg shrink-0"><svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg></div><p className="text-red-700 dark:text-red-300 text-sm font-black uppercase">Estorno por Unidade (Auditado)</p></div>
                    {getSessForTable(selectedTable)?.items.map(item => (<div key={item.uid} className="flex justify-between items-center p-6 bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-3xl shadow-sm"><div className="flex-1 min-w-0"><p className="font-black text-slate-800 dark:text-white uppercase text-sm truncate">{products.find(p => p.id === item.productId)?.name}</p><p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 mt-1 uppercase tracking-widest">{item.price.toFixed(2)} • {item.isReady ? 'CONCLUÍDO' : 'PENDENTE'}</p></div><button onClick={() => removeProduct(item.uid)} className="p-4 bg-red-50 dark:bg-red-900/40 text-red-600 dark:text-red-400 rounded-2xl hover:bg-red-500 dark:hover:bg-red-600 hover:text-white transition-all shadow-sm"><svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg></button></div>))}
                  </div>
                )}

                {activeModalTab === 'CONSUMPTION' && (
                  <div className="space-y-6">
                    <div className="flex justify-between items-center"><div><h4 className="text-xl font-black text-slate-800 dark:text-white uppercase tracking-tighter">Prévia de Consumo</h4><p className="text-xs text-slate-400 dark:text-slate-500 font-bold uppercase tracking-widest">Conferência Agrupada dos Itens</p></div><button onClick={() => {
                      const sess = getSessForTable(selectedTable!);
                      if (!sess || sess.items.length === 0) {
                        return addToast({ title: "Consumo Zerado", message: "Esta mesa não possui consumo para gerar cupom.", type: "WARNING" });
                      }
                      setShowConsumptionTicket(true);
                    }} className="px-6 py-4 bg-indigo-600 text-white rounded-2xl text-[10px] font-black uppercase shadow-xl hover:bg-indigo-700 transition-all flex items-center gap-2"><Icons.Print /> Cupom de Conferência</button></div>
                    <div className="bg-slate-50 dark:bg-slate-800/50 rounded-[2rem] p-8 border border-slate-100 dark:border-slate-700 space-y-3 font-receipt shadow-inner">
                      {getGroupedItems(getSessForTable(selectedTable)?.items || []).map((it, idx) => (
                        <div key={idx} className="flex justify-between border-b border-dashed border-slate-200 dark:border-slate-700 pb-2">
                          <span className="font-bold text-[13px] dark:text-slate-200">{it.quantity}x {it.product?.name.toUpperCase()}</span>
                          <span className="font-black text-[13px] dark:text-slate-100">R$ {(it.quantity * it.price).toFixed(2)}</span>
                        </div>
                      ))}
                      {settings.serviceFeeStatus && (
                        <div className="flex justify-between border-b border-dashed border-slate-200 dark:border-slate-700 pb-2 text-slate-500 dark:text-slate-400">
                          <span className="font-bold text-[11px] uppercase">Taxa de Serviço ({settings.serviceFeePercentage || 10}%)</span>
                          <span className="font-black text-[12px]">R$ {((getSessForTable(selectedTable)?.items.reduce((acc, it) => acc + (it.price * it.quantity), 0) || 0) * (settings.serviceFeePercentage || 10) / 100).toFixed(2)}</span>
                        </div>
                      )}
                      <div className="pt-6 flex justify-between items-end"><span className="font-black text-[11px] dark:text-slate-400 uppercase opacity-50">Total Mesa:</span><span className="text-4xl font-black text-indigo-600 dark:text-indigo-400">R$ {(
                        (getSessForTable(selectedTable)?.items.reduce((acc, it) => acc + (it.price * it.quantity), 0) || 0) +
                        (settings.serviceFeeStatus ? ((getSessForTable(selectedTable)?.items.reduce((acc, it) => acc + (it.price * it.quantity), 0) || 0) * (settings.serviceFeePercentage || 10) / 100) : 0)
                      ).toFixed(2)}</span></div>
                    </div>
                  </div>
                )}

                {activeModalTab === 'CHECKOUT' && (
                  <div className="flex flex-col items-center py-4">
                    <div className="text-center mb-8"><p className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-2">Valor Total da Conta</p><h4 className="text-6xl font-black text-slate-900 dark:text-white tracking-tighter">R$ {(
                      (getSessForTable(selectedTable)?.items.reduce((acc, it) => acc + (it.price * it.quantity), 0) || 0) +
                      (settings.serviceFeeStatus ? ((getSessForTable(selectedTable)?.items.reduce((acc, it) => acc + (it.price * it.quantity), 0) || 0) * (settings.serviceFeePercentage || 10) / 100) : 0)
                    ).toFixed(2)}</h4></div>
                    <div className="w-full max-w-2xl bg-slate-50 dark:bg-slate-800/50 p-8 rounded-[2rem] border border-slate-100 dark:border-slate-700 space-y-6">
                      <div className="flex items-center justify-between"><label className="text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest">Identificação do Cliente</label><button onClick={() => { setIsUnregisteredClient(!isUnregisteredClient); setSelectedClient(null); setManualClientName(''); setManualClientPhone(''); setManualClientAddress(''); setManualClientCep(''); setClientSearch(''); setManualClientEmail(''); setManualClientDocument(''); }} className={`text-[9px] font-black uppercase px-2 py-1 rounded-lg transition-all ${isUnregisteredClient ? 'bg-blue-600 text-white shadow-md' : 'bg-slate-200 dark:bg-slate-700 text-slate-500 dark:text-slate-400'}`}>{isUnregisteredClient ? 'Mudar para Base' : 'Cliente Avulso?'}</button></div>
                      {isUnregisteredClient ? (
                        <div className="space-y-4 animate-in zoom-in-95">
                          <div className="flex flex-col md:flex-row gap-4">
                            <div className="flex-1 space-y-1.5">
                              <label className={`text-[9px] font-black uppercase tracking-widest ml-1 ${errors.manualClientName ? 'text-red-500' : 'text-slate-400 dark:text-slate-500'}`}>Nome Completo *</label>
                              <input
                                type="text"
                                className={`w-full p-4 md:p-5 bg-white dark:bg-slate-900 border-2 rounded-2xl text-xs font-black outline-none focus:ring-4 focus:ring-blue-50 dark:focus:ring-blue-900/20 transition-all dark:text-white ${errors.manualClientName ? 'border-red-500 animate-shake' : 'border-slate-200 dark:border-slate-700'}`}
                                placeholder="Nome do Cliente"
                                value={manualClientName}
                                onChange={e => {
                                  setManualClientName(e.target.value);
                                  if (errors.manualClientName) setErrors(prev => ({ ...prev, manualClientName: false }));
                                }}
                              />
                            </div>
                            <div className="w-full md:w-1/3 space-y-1.5">
                              <label className={`text-[9px] font-black uppercase tracking-widest ml-1 ${errors.manualClientPhone ? 'text-red-500' : 'text-slate-400 dark:text-slate-500'}`}>Telefone *</label>
                              <input
                                type="text"
                                className={`w-full p-4 md:p-5 bg-white dark:bg-slate-900 border-2 rounded-2xl text-xs font-black outline-none focus:ring-4 focus:ring-blue-50 dark:focus:ring-blue-900/20 transition-all dark:text-white ${errors.manualClientPhone ? 'border-red-500 animate-shake' : 'border-slate-200 dark:border-slate-700'}`}
                                placeholder="(00) 9 0000-0000"
                                value={manualClientPhone}
                                onChange={e => {
                                  setManualClientPhone(maskPhone(e.target.value));
                                  if (errors.manualClientPhone) setErrors(prev => ({ ...prev, manualClientPhone: false }));
                                }}
                              />
                            </div>
                          </div>
                          <div className="flex flex-col md:flex-row gap-4">
                            <div className="flex-1 space-y-1.5">
                              <label className={`text-[9px] font-black uppercase tracking-widest ml-1 ${errors.manualClientEmail ? 'text-red-500' : 'text-slate-400 dark:text-slate-500'}`}>E-mail</label>
                              <input
                                type="email"
                                className={`w-full p-4 md:p-5 bg-white dark:bg-slate-900 border-2 rounded-2xl text-xs font-black outline-none focus:ring-4 focus:ring-blue-50 dark:focus:ring-blue-900/20 transition-all dark:text-white ${errors.manualClientEmail ? 'border-red-500 animate-shake' : 'border-slate-200 dark:border-slate-700'}`}
                                placeholder="Email"
                                value={manualClientEmail}
                                onChange={e => {
                                  setManualClientEmail(e.target.value);
                                  if (errors.manualClientEmail) setErrors(prev => ({ ...prev, manualClientEmail: false }));
                                }}
                              />
                            </div>
                            <div className="flex-1 space-y-1.5">
                              <label className={`text-[9px] font-black uppercase tracking-widest ml-1 ${errors.manualClientDocument ? 'text-red-500' : 'text-slate-400 dark:text-slate-500'}`}>CPF / CNPJ</label>
                              <input
                                type="text"
                                className={`w-full p-4 md:p-5 bg-white dark:bg-slate-900 border-2 rounded-2xl text-xs font-black outline-none focus:ring-4 focus:ring-blue-50 dark:focus:ring-blue-900/20 transition-all dark:text-white ${errors.manualClientDocument ? 'border-red-500 animate-shake' : 'border-slate-200 dark:border-slate-700'}`}
                                placeholder="000.000.000-00"
                                value={manualClientDocument}
                                onChange={e => {
                                  setManualClientDocument(maskDocument(e.target.value));
                                  if (errors.manualClientDocument) setErrors(prev => ({ ...prev, manualClientDocument: false }));
                                }}
                              />
                            </div>
                          </div>
                          <div className="space-y-4">
                            <div className="flex flex-col md:flex-row gap-4">
                              <div className="w-full md:w-32 shrink-0 relative">
                                <label className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest ml-1">CEP</label>
                                <input
                                  type="text"
                                  className={`w-full p-4 md:p-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl text-xs font-black outline-none focus:ring-4 focus:ring-blue-50 dark:focus:ring-blue-900/20 transition-all dark:text-white ${isLoadingCep ? 'opacity-50' : ''}`}
                                  placeholder="00000000"
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
                                          setManualClientStreet(data.logradouro || '');
                                          setManualClientNeighborhood(data.bairro || '');
                                          setManualClientCity(data.localidade || '');
                                          setManualClientState(data.uf || '');
                                        }
                                      } catch (err) {
                                        console.error('ViaCep error:', err);
                                      } finally {
                                        setIsLoadingCep(false);
                                      }
                                    }
                                  }}
                                />
                                {isLoadingCep && (
                                  <div className="absolute right-3 top-1/2 -translate-y-1/2 mt-2">
                                    <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                                  </div>
                                )}
                              </div>
                              <div className="flex-1">
                                <label className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest ml-1">Logradouro</label>
                                <input
                                  type="text"
                                  className="w-full p-4 md:p-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl text-xs font-black outline-none focus:ring-4 focus:ring-blue-50 dark:focus:ring-blue-900/20 transition-all dark:text-white"
                                  placeholder="Rua / Avenida"
                                  value={manualClientStreet}
                                  onChange={e => setManualClientStreet(e.target.value)}
                                />
                              </div>
                            </div>

                            <div className="flex flex-col md:flex-row gap-4">
                              <div className="w-full md:w-24 shrink-0">
                                <label className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest ml-1">Número</label>
                                <input
                                  type="text"
                                  className="w-full p-4 md:p-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl text-xs font-black outline-none focus:ring-4 focus:ring-blue-50 dark:focus:ring-blue-900/20 transition-all dark:text-white"
                                  placeholder="123"
                                  value={manualClientNumber}
                                  onChange={e => setManualClientNumber(e.target.value)}
                                />
                              </div>
                              <div className="flex-1">
                                <label className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest ml-1">Bairro</label>
                                <input
                                  type="text"
                                  className="w-full p-4 md:p-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl text-xs font-black outline-none focus:ring-4 focus:ring-blue-50 dark:focus:ring-blue-900/20 transition-all dark:text-white"
                                  placeholder="Bairro"
                                  value={manualClientNeighborhood}
                                  onChange={e => setManualClientNeighborhood(e.target.value)}
                                />
                              </div>
                            </div>

                            <div className="flex flex-col md:flex-row gap-4">
                              <div className="flex-1">
                                <label className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest ml-1">Cidade</label>
                                <input
                                  type="text"
                                  className="w-full p-4 md:p-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl text-xs font-black outline-none focus:ring-4 focus:ring-blue-50 dark:focus:ring-blue-900/20 transition-all dark:text-white"
                                  placeholder="Cidade"
                                  value={manualClientCity}
                                  onChange={e => setManualClientCity(e.target.value)}
                                />
                              </div>
                              <div className="w-full md:w-16 shrink-0">
                                <label className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest ml-1">UF</label>
                                <input
                                  type="text"
                                  className="w-full p-4 md:p-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl text-xs font-black outline-none focus:ring-4 focus:ring-blue-50 dark:focus:ring-blue-900/20 transition-all dark:text-white"
                                  placeholder="SP"
                                  maxLength={2}
                                  value={manualClientState}
                                  onChange={e => setManualClientState(e.target.value.toUpperCase())}
                                />
                              </div>
                            </div>

                            <div className="space-y-1">
                              <label className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest ml-1">Complemento / Referência</label>
                              <input
                                type="text"
                                placeholder="Ex: Próximo ao mercado..."
                                value={manualClientComplement}
                                onChange={e => setManualClientComplement(e.target.value)}
                                className="w-full p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl text-[11px] font-black outline-none focus:ring-4 focus:ring-blue-50 dark:focus:ring-blue-900/20 transition-all dark:text-white"
                              />
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="relative animate-in zoom-in-95">
                          <input type="text" className="w-full p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl text-[11px] font-black uppercase outline-none focus:ring-4 focus:ring-emerald-50 dark:focus:ring-emerald-900/20 transition-all dark:text-white" placeholder="Pesquisar por Nome ou Fone..." value={clientSearch} onChange={(e) => { setClientSearch(e.target.value); setShowClientList(true); }} />
                          {showClientList && clientSearch && (
                            <div className="absolute z-30 w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-2xl max-h-56 overflow-y-auto mt-3 p-2">
                              {clients.filter(c => c.name.toLowerCase().includes(clientSearch.toLowerCase())).map(c => (<button key={c.id} onClick={() => { setSelectedClient(c); setClientSearch(c.name); setShowClientList(false); }} className="w-full text-left p-4 hover:bg-slate-50 dark:hover:bg-slate-700 border-b border-slate-50 dark:border-slate-700 last:border-0 rounded-2xl"><p className="text-xs font-black text-slate-800 dark:text-white uppercase tracking-tighter">{c.name}</p><p className="text-[10px] text-slate-400 dark:text-slate-500 font-bold">{c.phone}</p></button>))}
                            </div>
                          )}
                          {selectedClient && <div className="mt-4 bg-emerald-50 dark:bg-emerald-900/20 p-4 rounded-2xl border border-emerald-100 dark:border-emerald-900/30 flex justify-between items-center animate-in fade-in"><div className="flex-1 min-w-0"><p className="text-[10px] font-black text-emerald-700 dark:text-emerald-400 uppercase">{selectedClient.name}</p><p className="text-[8px] text-emerald-400 dark:text-emerald-500 truncate uppercase">{formatAddress(selectedClient)}</p></div><button onClick={() => setSelectedClient(null)} className="text-emerald-400 font-black px-2 text-xl">×</button></div>}
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
          <div className="bg-white dark:bg-slate-900 rounded-[2rem] shadow-2xl p-8 w-full max-w-sm border border-white/20 dark:border-slate-800">
            <h3 className="text-lg font-black text-slate-800 dark:text-white uppercase mb-2 tracking-tighter text-center">Lançar Item</h3>
            <p className="text-center text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase mb-6">{selectedProductForLaunch.name}</p>
            <div className="space-y-6">
              <div>
                <label className="text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-2 block">Deseja adicionar alguma observação?</label>
                <input autoFocus type="text" placeholder="Ex: Sem sal, bem passado..." value={modalObservation} onChange={(e) => setModalObservation(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && confirmLaunchProduct()} className="w-full p-4 bg-slate-100 dark:bg-slate-800 rounded-2xl border-none focus:ring-2 focus:ring-blue-600 dark:focus:ring-blue-500 font-bold text-sm outline-none placeholder:font-normal dark:text-white" maxLength={60} />
              </div>
              <div className="flex gap-2">
                <button onClick={() => setSelectedProductForLaunch(null)} className="flex-1 py-4 font-black text-[10px] uppercase text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 transition-colors">Cancelar</button>
                <button onClick={confirmLaunchProduct} className="flex-1 py-4 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-black text-[10px] uppercase shadow-xl hover:shadow-blue-200 dark:hover:shadow-blue-900/40 transition-all active:scale-95">Confirmar ✓</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DE VISUALIZAÇÃO PRÉVIA (CUPOM DE CONFERÊNCIA) - REFATORADO COM AGRUPAMENTO */}

      {(showConsumptionTicket || isConfirmingBilling) && (printingPreBill || getSessForTable(selectedTable!)) && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-slate-900/60 dark:bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-300">
          <div className="relative w-full max-w-md bg-white dark:bg-slate-900 rounded-[2.5rem] shadow-2xl border border-slate-100 dark:border-slate-800 overflow-hidden animate-in zoom-in-95 duration-300">
            {/* Modal Header */}
            <div className={`p-8 pb-6 text-center border-b border-slate-50 dark:border-slate-800 ${isConfirmingBilling ? 'bg-orange-50/50 dark:bg-orange-500/10' : 'bg-blue-50/50 dark:bg-blue-500/10'}`}>
              <div className="flex justify-center mb-4">
                <div className={`w-16 h-16 rounded-2xl flex items-center justify-center shadow-lg transition-transform hover:scale-110 duration-300 ${isConfirmingBilling ? 'bg-orange-500 text-white shadow-orange-200' : 'bg-blue-500 text-white shadow-blue-200'}`}>
                  {isConfirmingBilling ? <Icons.MoneyBag className="w-8 h-8" /> : <Icons.View className="w-8 h-8" />}
                </div>
              </div>
              <h2 className="text-xl font-black text-slate-800 dark:text-white uppercase tracking-tighter">
                Mesa {selectedTable}
              </h2>
              <p className={`text-[10px] font-black uppercase tracking-widest mt-1 ${isConfirmingBilling ? 'text-orange-600 dark:text-orange-400' : 'text-blue-600 dark:text-blue-400'}`}>
                {isConfirmingBilling ? 'Solicitação de Fechamento' : 'Conferência de Consumo'}
              </p>
            </div>

            {/* Modal Content */}
            <div className="p-8 space-y-6">
              {/* Client Info Section */}
              <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-2xl border border-slate-100 dark:border-slate-700">
                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Identificação</p>
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-white dark:bg-slate-800 flex items-center justify-center text-slate-400 border border-slate-100 dark:border-slate-700">
                    <Icons.User className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="text-xs font-black text-slate-700 dark:text-white uppercase truncate">
                      {isConfirmingBilling
                        ? (isUnregisteredClient ? manualClientName.toUpperCase() : (selectedClient?.name.toUpperCase() || 'CONSUMIDOR PADRÃO'))
                        : (getSessForTable(selectedTable!)?.clientName?.toUpperCase() || 'EM ATENDIMENTO')}
                    </p>
                    {(isConfirmingBilling ? (isUnregisteredClient ? manualClientPhone : selectedClient?.phone) : getSessForTable(selectedTable!)?.clientPhone) && (
                      <p className="text-[10px] font-bold text-slate-400/80 uppercase">
                        Contato: {isConfirmingBilling ? (isUnregisteredClient ? manualClientPhone : selectedClient?.phone) : getSessForTable(selectedTable!)?.clientPhone}
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {/* Items List */}
              <div className="space-y-3">
                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Itens Consumidos</p>
                <div className="max-h-56 overflow-y-auto pr-2 space-y-2 custom-scrollbar">
                  {getGroupedItems((isConfirmingBilling ? printingPreBill : getSessForTable(selectedTable!))?.items || []).map((it, i) => (
                    <div key={i} className="flex justify-between items-center p-3 bg-white dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700">
                      <div className="flex-1 min-w-0">
                        <p className={`text-[11px] font-black uppercase truncate ${it.allReady ? 'text-slate-800 dark:text-white' : 'text-slate-400'}`}>
                          {it.quantity}x {it.product?.name.toUpperCase()}
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        {it.allReady && <span className="text-emerald-500 font-black text-xs">✓</span>}
                        <span className="text-xs font-black text-slate-600 dark:text-slate-400">
                          R$ {(it.quantity * it.price).toFixed(2)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Totals Section */}
              <div className="pt-4 border-t border-slate-100 dark:border-slate-800 space-y-2">
                {settings.serviceFeeStatus && (
                  <div className="flex justify-between items-center px-1">
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Taxa de Serviço ({settings.serviceFeePercentage || 10}%)</span>
                    <span className="text-xs font-black text-slate-600 dark:text-slate-400">
                      R$ {(((isConfirmingBilling ? printingPreBill : getSessForTable(selectedTable!))?.items.reduce((acc, it) => acc + (it.price * it.quantity), 0) || 0) * (settings.serviceFeePercentage || 10) / 100).toFixed(2)}
                    </span>
                  </div>
                )}
                <div className="flex justify-between items-end p-4 bg-slate-900 text-white rounded-[2rem]">
                  <span className="text-[10px] font-black uppercase tracking-[0.2em] mb-1">Total Geral</span>
                  <span className="text-2xl font-black tracking-tighter">
                    R$ {(
                      ((isConfirmingBilling ? printingPreBill : getSessForTable(selectedTable!))?.items.reduce((acc, it) => acc + (it.price * it.quantity), 0) || 0) +
                      (settings.serviceFeeStatus ? (((isConfirmingBilling ? printingPreBill : getSessForTable(selectedTable!))?.items.reduce((acc, it) => acc + (it.price * it.quantity), 0) || 0) * (settings.serviceFeePercentage || 10) / 100) : 0)
                    ).toFixed(2)}
                  </span>
                </div>
              </div>
            </div>

            {/* Modal Actions */}
            <div className="p-8 pt-0 flex gap-3">
              <button
                onClick={() => { setShowConsumptionTicket(false); setIsConfirmingBilling(false); }}
                className="flex-1 py-4 bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 rounded-2xl font-black uppercase text-[10px] tracking-widest transition-all hover:bg-slate-200 dark:hover:bg-slate-700 active:scale-95"
              >
                {isConfirmingBilling ? 'Cancelar' : 'Fechar'}
              </button>
              {isConfirmingBilling ? (
                <button
                  onClick={confirmBilling}
                  className="flex-[1.5] py-4 bg-orange-600 hover:bg-orange-700 text-white rounded-2xl font-black uppercase text-[10px] tracking-widest shadow-xl shadow-orange-100 dark:shadow-none transition-all active:scale-95 flex items-center justify-center gap-2"
                >
                  <Icons.Check className="w-4 h-4" /> Confirmar
                </button>
              ) : (
                <button
                  onClick={handlePrintTable}
                  className="flex-[1.5] py-4 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl font-black uppercase text-[10px] tracking-widest shadow-xl shadow-blue-100 dark:shadow-none transition-all active:scale-95 flex items-center justify-center gap-2"
                >
                  <Icons.View className="w-4 h-4" /> Imprimir
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* MODAL DE MENSAGENS / FEEDBACK */}
      {showFeedbacks && (
        <div className="fixed inset-0 z-[100] flex items-center justify-end p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="absolute inset-0" onClick={() => setShowFeedbacks(false)} />
          <div className="bg-white dark:bg-slate-900 rounded-[3rem] shadow-2xl w-full max-w-md h-[95vh] flex flex-col overflow-hidden animate-in slide-in-from-right duration-300 relative border-l border-white/20 dark:border-slate-800">
            <div className="p-8 border-b dark:border-slate-800 bg-indigo-50 dark:bg-indigo-950/20 flex justify-between items-center">
              <div>
                <h3 className="text-xl font-black text-indigo-900 dark:text-indigo-100 uppercase tracking-tighter">Mensagens dos Clientes</h3>
                <p className="text-[9px] font-bold text-indigo-400 dark:text-indigo-500 uppercase tracking-widest">Feedbacks e Sugestões do dia</p>
              </div>
              <button
                onClick={() => setShowFeedbacks(false)}
                className="p-3 bg-white dark:bg-slate-800 text-slate-400 dark:text-slate-500 rounded-2xl hover:text-slate-600 dark:hover:text-slate-300 transition-all shadow-sm"
              >
                ✕
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {feedbacks.length > 0 ? (
                feedbacks.map((fb, i) => (
                  <div key={fb.id} className="bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-700 p-5 rounded-[2rem] shadow-sm animate-in fade-in slide-in-from-bottom-2" style={{ animationDelay: `${i * 50}ms` }}>
                    <div className="flex justify-between items-start mb-3">
                      <div className="flex items-center gap-2">
                        <div className="bg-indigo-600 text-white w-8 h-8 rounded-xl flex items-center justify-center text-[10px] font-black">M{fb.tableNumber}</div>
                        <span className="text-xs font-black text-slate-800 dark:text-white uppercase tracking-tight">{fb.name || 'Cliente Anônimo'}</span>
                      </div>
                      <span className="text-[8px] font-bold text-slate-400 dark:text-slate-500 uppercase">{new Date(fb.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                    <p className="text-sm font-bold text-slate-600 dark:text-slate-300 leading-relaxed bg-white/50 dark:bg-slate-800/80 p-4 rounded-2xl border border-slate-50 dark:border-slate-700 italic">
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

      {/* MODAL DE TRANSFERENCIA */}
      {transferModal.isOpen && transferModal.sourceTable !== null && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 p-8 rounded-[3rem] shadow-2xl w-full max-w-md animate-in zoom-in duration-200 text-center border border-white/20 dark:border-slate-800">
            <div className="text-orange-500 dark:text-orange-400 mb-6 flex justify-center"><Icons.Dashboard /></div>
            <h3 className="text-2xl font-black text-slate-800 dark:text-white uppercase tracking-tighter mb-2">Transferir Mesa {transferModal.sourceTable}</h3>
            <p className="text-sm font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-6 px-4">Digite o número da mesa de destino (Livre)</p>

            <input
              autoFocus
              type="number"
              className="w-full text-center text-4xl font-black text-slate-800 dark:text-white bg-slate-50 dark:bg-slate-800 border-2 border-slate-200 dark:border-slate-700 rounded-3xl p-6 mb-8 focus:border-orange-500 dark:focus:border-orange-400 focus:ring-4 focus:ring-orange-500/20 dark:focus:ring-orange-900/40 outline-none transition-all placeholder:text-slate-300 dark:placeholder:text-slate-600"
              placeholder="00"
              value={transferTargetStr}
              onChange={e => setTransferTargetStr(e.target.value)}
              onKeyDown={async (e) => {
                if (e.key === 'Enter') {
                  const target = parseInt(transferTargetStr);
                  if (isNaN(target) || target <= 0 || target > (settings?.tableCount || 0)) {
                    return showAlert("Erro", "Mesa de destino inválida.", "DANGER");
                  }

                  if (target === transferModal.sourceTable) return;
                  if (getTableStatus(target) !== 'available') {
                    return showAlert("Mesa Ocupada", `A mesa ${target} encontra-se ocupada. Só é possível transferir para mesas livres.`, "DANGER");
                  }

                  const sess = getSessForTable(transferModal.sourceTable!);
                  if (!sess || !sess.waiterId) return;

                  try {
                    setTransferModal({ isOpen: false, sourceTable: null });
                    if (!currentUser.permissions.includes('admin')) {
                      await requireWaiterAuth(sess.waiterId, `Transferir Mesa ${transferModal.sourceTable} para ${target}`);
                    }
                    await db.transferTable(transferModal.sourceTable, target, sess.waiterId, currentUser.permissions);
                    setSelectedTable(null);
                    await refreshData();
                    addToast({ title: "SUCESSO", message: "Transferência realizada com sucesso!", type: "SUCCESS" });
                  } catch (err: any) {
                    if (err.message && err.message !== 'Garçom não encontrado') {
                      showAlert("Erro ao Transferir", err.message, "DANGER");
                    }
                  }
                }
              }}
            />

            <div className="flex gap-4">
              <button
                onClick={() => setTransferModal({ isOpen: false, sourceTable: null })}
                className="flex-1 py-5 text-slate-400 dark:text-slate-500 font-black uppercase text-xs tracking-widest hover:bg-slate-50 dark:hover:bg-slate-800 rounded-2xl transition-all"
              >
                Cancelar
              </button>
              <button
                onClick={async () => {
                  const target = parseInt(transferTargetStr);
                  if (isNaN(target) || target <= 0 || target > (settings?.tableCount || 0)) {
                    return showAlert("Erro", "Mesa de destino inválida.", "DANGER");
                  }

                  if (target === transferModal.sourceTable) return;
                  if (getTableStatus(target) !== 'available') {
                    return showAlert("Mesa Ocupada", `A mesa ${target} encontra-se ocupada. Só é possível transferir para mesas livres.`, "DANGER");
                  }

                  const sess = getSessForTable(transferModal.sourceTable!);
                  if (!sess || !sess.waiterId) return;

                  try {
                    setTransferModal({ isOpen: false, sourceTable: null });
                    if (!currentUser.permissions.includes('admin')) {
                      await requireWaiterAuth(sess.waiterId, `Transferir Mesa ${transferModal.sourceTable} para ${target}`);
                    }
                    await db.transferTable(transferModal.sourceTable, target, sess.waiterId, currentUser.permissions);
                    setSelectedTable(null);
                    await refreshData();
                    addToast({ title: "SUCESSO", message: "Transferência realizada com sucesso!", type: "SUCCESS" });
                  } catch (err: any) {
                    if (err.message && err.message !== 'Garçom não encontrado') {
                      showAlert("Erro ao Transferir", err.message, "DANGER");
                    }
                  }
                }}
                className="flex-1 bg-orange-500 text-white font-black uppercase text-xs tracking-widest rounded-2xl shadow-xl shadow-orange-500/30 hover:bg-orange-600 hover:scale-[1.02] active:scale-95 transition-all"
              >
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Tables;
