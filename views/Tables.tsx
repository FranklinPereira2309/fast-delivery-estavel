
import React, { useState, useEffect, useMemo } from 'react';
import { db, BusinessSettings } from '../services/db';
import { TableSession, Product, User, OrderItem, Order, OrderStatus, SaleType, Waiter, Client } from '../types';
import { Icons, PLACEHOLDER_FOOD_IMAGE, formatImageUrl } from '../constants';
import CustomAlert from '../components/CustomAlert';

interface TablesProps {
  currentUser: User;
}

const Tables: React.FC<TablesProps> = ({ currentUser }) => {
  const [settings, setSettings] = useState<BusinessSettings | null>(null);
  const [sessions, setSessions] = useState<TableSession[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [waiters, setWaiters] = useState<Waiter[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [selectedTable, setSelectedTable] = useState<number | null>(null);
  const [activeModalTab, setActiveModalTab] = useState<'LAUNCH' | 'REMOVE' | 'CHECKOUT' | 'CONSUMPTION'>('LAUNCH');
  const [isEditingTableCount, setIsEditingTableCount] = useState(false);
  const [newTableCount, setNewTableCount] = useState(0);

  const [lastAddedProduct, setLastAddedProduct] = useState<string | null>(null);
  const [isConfirmingBilling, setIsConfirmingBilling] = useState(false);
  const [printingPreBill, setPrintingPreBill] = useState<TableSession | null>(null);

  const [showConsumptionTicket, setShowConsumptionTicket] = useState(false);
  const [selectedWaiterId, setSelectedWaiterId] = useState<string>('');

  const [isUnregisteredClient, setIsUnregisteredClient] = useState(false);
  const [manualClientName, setManualClientName] = useState('');
  const [manualClientPhone, setManualClientPhone] = useState('');
  const [manualClientAddress, setManualClientAddress] = useState('');
  const [clientSearch, setClientSearch] = useState('');
  const [showClientList, setShowClientList] = useState(false);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);

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
    return () => clearInterval(agent);
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
    if (s && newTableCount === 0) setNewTableCount(s.tableCount);
  };

  const getTableStatus = (num: number) => {
    const sess = sessions.find(s => s.tableNumber === num);
    if (!sess) return 'available';
    return sess.status;
  };

  const getSessForTable = (num: number) => sessions.find(s => s.tableNumber === num);

  const launchProduct = async (product: Product) => {
    console.log('Attempting to launch product:', product.name, 'to table:', selectedTable);
    if (selectedTable === null) return;
    if (!selectedWaiterId) {
      console.warn('Launch blocked: No waiter selected');
      return showAlert("Garçom Requerido", "Por favor, selecione o garçom responsável.", "DANGER");
    }

    if (getTableStatus(selectedTable) === 'billing') {
      return showAlert("Mesa Bloqueada", "Esta mesa está em processo de fechamento (Faturando). Para lançar mais itens, reabra a mesa.", "DANGER");
    }

    const validation = await db.validateStockForOrder([{ productId: product.id, quantity: 1 }]);
    if (!validation.valid) {
      console.warn('Launch blocked: Out of stock', validation.message);
      return showAlert("Sem Estoque", validation.message || "Produto sem estoque.", "DANGER");
    }

    const existingSess = getSessForTable(selectedTable);
    const newItem: OrderItem = {
      uid: `item-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      productId: product.id,
      quantity: 1,
      price: product.price,
      isReady: false
    };
    const newItems: OrderItem[] = existingSess ? [...existingSess.items, newItem] : [newItem];
    const startTime = existingSess?.startTime || new Date().toISOString();

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
      // Try to get message from backend response
      const errorMessage = err.message || "Erro desconhecido";
      showAlert("Erro ao Salvar", `Não foi possível adicionar o item: ${errorMessage}`, "DANGER");
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
        await db.deleteTableSession(selectedTable);
        await db.deleteOrder(`TABLE-${selectedTable}`, currentUser);
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
          waiterId: sess.waiterId
        };
        await db.saveOrder(kitchenOrder, currentUser);
      }
      setAlertConfig(prev => ({ ...prev, isOpen: false }));
      await refreshData();
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
    if (isUnregisteredClient && !manualClientName.trim()) {
      return showAlert("Identificação Requerida", "Por favor, digite ao menos o nome do cliente avulso.", "DANGER");
    }
    if (!isUnregisteredClient && !selectedClient) {
      return showAlert("Identificação Requerida", "Por favor, selecione um cliente da base ou use a opção 'Avulso'.", "DANGER");
    }

    setPrintingPreBill(sess);
    setIsConfirmingBilling(true);
  };

  const confirmBilling = async () => {
    if (!printingPreBill) return;

    const clientName = isUnregisteredClient ? manualClientName : (selectedClient?.name || 'Consumidor');
    const clientId = isUnregisteredClient ? undefined : selectedClient?.id;
    const clientPhone = isUnregisteredClient ? manualClientPhone : selectedClient?.phone;
    const clientAddress = isUnregisteredClient ? manualClientAddress : selectedClient?.addresses[0];

    let finalClientId = isUnregisteredClient ? undefined : selectedClient?.id;

    if (isUnregisteredClient && manualClientName && manualClientPhone) {
      // Here we attempt to find or create the client in the DB
      try {
        const formattedPhone = manualClientPhone.replace(/\D/g, ''); // just numbers
        const existingClient = clients.find(c => c.phone.replace(/\D/g, '') === formattedPhone);

        if (existingClient) {
          finalClientId = existingClient.id; // It actually existed, we can just use the ID
        } else {
          // Let's create a real client using db
          const newClient: Client = {
            id: `CLIENT-${Date.now()}`,
            name: manualClientName,
            phone: manualClientPhone,
            addresses: manualClientAddress ? [manualClientAddress] : [],
            totalOrders: 0
          };
          await db.saveClient(newClient, currentUser);
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
      clientAddress
    });

    await db.logAction(currentUser, 'TABLE_BILL_REQUEST', `Mesa ${printingPreBill.tableNumber}: Pré-conta para ${clientName}.`);

    setIsConfirmingBilling(false);
    setPrintingPreBill(null);
    setSelectedTable(null);
    setSelectedClient(null);
    setManualClientName('');
    setManualClientPhone('');
    setManualClientAddress('');
    setClientSearch('');
    await refreshData();
    showAlert("Sucesso", "Solicitação de fechamento enviada ao PDV!", "SUCCESS");
  };

  const updateTableCount = async () => {
    if (!settings) return;
    if (newTableCount < 1) return showAlert("Erro", "Mínimo de 1 mesa.", "DANGER");

    const updatedSettings = { ...settings, tableCount: newTableCount };
    await db.saveSettings(updatedSettings);
    setSettings(updatedSettings);
    setIsEditingTableCount(false);
    showAlert("Sucesso", `Sistema atualizado para ${newTableCount} mesas.`, "SUCCESS");
  };

  if (!settings) return null;

  return (
    <div className="flex flex-col h-full gap-8">
      <CustomAlert {...alertConfig} onConfirm={alertConfig.onConfirm} onCancel={alertConfig.onCancel} />

      {/* Header Gestão de Mesas */}
      <div className="flex justify-between items-center bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm">
        <div>
          <h2 className="text-2xl font-black text-slate-800 uppercase tracking-tighter">Gestão de Mesas</h2>
          <p className="text-xs text-slate-400 font-bold uppercase tracking-widest">Painel de Atendimento em Tempo Real</p>
        </div>
        <div className="flex items-center gap-6">
          <div className="flex gap-4">
            <div className="flex items-center gap-1.5"><span className="w-2 h-2 bg-emerald-500 rounded-full"></span><span className="text-[10px] font-bold uppercase text-slate-400">Livre</span></div>
            <div className="flex items-center gap-1.5"><span className="w-2 h-2 bg-red-600 rounded-full"></span><span className="text-[10px] font-bold uppercase text-slate-400">Ocupada</span></div>
            <div className="flex items-center gap-1.5"><span className="w-2 h-2 bg-orange-500 rounded-full animate-pulse"></span><span className="text-[10px] font-bold uppercase text-slate-400">Checkout</span></div>
          </div>
          <button
            onClick={() => { setNewTableCount(settings.tableCount); setIsEditingTableCount(true); }}
            className="px-4 py-2 bg-slate-900 text-white rounded-xl text-[10px] font-black uppercase hover:bg-slate-800 transition-all flex items-center gap-2"
          >
            <Icons.Settings />
            Quantidade de Mesas
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
              setManualClientName('');
              setManualClientPhone('');
              setManualClientAddress('');
              setClientSearch('');
              setSelectedClient(null);
            }}
              className={`relative h-44 rounded-[2.5rem] border-4 transition-all duration-300 flex flex-col items-center justify-center gap-2 shadow-sm ${status === 'available' ? 'bg-white border-emerald-50 text-emerald-600 hover:border-emerald-300' :
                status === 'occupied' ? 'bg-red-600 border-red-700 text-white hover:bg-red-700' :
                  'bg-orange-500 border-orange-600 text-white hover:bg-orange-600 animate-moderate-blink'
                }`}
            >
              <span className="text-2xl font-black shrink-0">Mesa {tableNum}</span>
              {sess && (
                <div className="text-center w-full px-2 overflow-hidden flex flex-col items-center">
                  <p className="text-[10px] font-black mt-1 uppercase opacity-80 w-[95%] text-ellipsis overflow-hidden whitespace-nowrap block">{sess.clientName || 'Consumo'}</p>
                  <p className="text-sm font-black shrink-0 mt-0.5">R$ {sess.items.reduce((acc, it) => acc + (it.price * it.quantity), 0).toFixed(2)}</p>
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* MODAL CONFIGURAÇÃO QUANTIDADE DE MESAS (REDUZIDO) */}
      {isEditingTableCount && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in zoom-in duration-200">
          <div className="bg-white rounded-[2rem] shadow-2xl p-8 w-full max-w-xs border border-white/20">
            <h3 className="text-xs font-black text-slate-800 uppercase mb-6 text-center tracking-widest">Ajustar Quantidade</h3>
            <div className="space-y-6">
              <input type="number" value={newTableCount} onChange={(e) => setNewTableCount(parseInt(e.target.value) || 0)} className="w-full p-4 bg-slate-100 rounded-2xl border-none focus:ring-2 focus:ring-blue-600 font-bold text-2xl text-center outline-none" />
              <div className="flex gap-2">
                <button onClick={() => setIsEditingTableCount(false)} className="flex-1 py-3 font-black text-[9px] uppercase text-slate-400">Sair</button>
                <button onClick={updateTableCount} className="flex-1 py-3 bg-blue-600 text-white rounded-xl font-black text-[9px] uppercase shadow-lg">Salvar</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL GESTÃO DE MESA SELECIONADA */}
      {selectedTable !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white rounded-[3rem] shadow-2xl w-full max-w-5xl h-[85vh] flex flex-col overflow-hidden animate-in zoom-in duration-200 border border-white/20">
            <div className="p-8 border-b bg-slate-50 flex justify-between items-center">
              <div className="flex items-center gap-6">
                <div className={`w-16 h-16 rounded-2xl flex items-center justify-center text-white text-3xl font-black shadow-xl ${getTableStatus(selectedTable) === 'available' ? 'bg-emerald-500' : 'bg-red-600'}`}>{selectedTable}</div>
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
                    <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm"><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2">Garçom:</label><select disabled={getTableStatus(selectedTable) === 'billing'} value={selectedWaiterId} onChange={(e) => setSelectedWaiterId(e.target.value)} className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold focus:ring-4 focus:ring-blue-100 transition-all outline-none disabled:opacity-50"><option value="">Selecione...</option>{waiters.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}</select></div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                      {products.map(prod => (
                        <button
                          key={prod.id}
                          onClick={() => launchProduct(prod)}
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
                      <div className="pt-6 flex justify-between items-end"><span className="font-black text-[11px] uppercase opacity-50">Total Mesa:</span><span className="text-4xl font-black text-indigo-600">R$ {getSessForTable(selectedTable)?.items.reduce((acc, it) => acc + (it.price * it.quantity), 0).toFixed(2)}</span></div>
                    </div>
                  </div>
                )}

                {activeModalTab === 'CHECKOUT' && (
                  <div className="flex flex-col items-center justify-center h-full">
                    <div className="text-center mb-8"><p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Valor Total da Conta</p><h4 className="text-6xl font-black text-slate-900 tracking-tighter">R$ {getSessForTable(selectedTable)?.items.reduce((acc, it) => acc + (it.price * it.quantity), 0).toFixed(2)}</h4></div>
                    <div className="w-full max-w-md bg-slate-50 p-8 rounded-[2rem] border border-slate-100 space-y-6">
                      <div className="flex items-center justify-between"><label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Identificação do Cliente</label><button onClick={() => { setIsUnregisteredClient(!isUnregisteredClient); setSelectedClient(null); setManualClientName(''); setManualClientPhone(''); setManualClientAddress(''); setClientSearch(''); }} className={`text-[9px] font-black uppercase px-2 py-1 rounded-lg transition-all ${isUnregisteredClient ? 'bg-blue-600 text-white shadow-md' : 'bg-slate-200 text-slate-500'}`}>{isUnregisteredClient ? 'Mudar para Base' : 'Cliente Avulso?'}</button></div>
                      {isUnregisteredClient ? (
                        <div className="space-y-3 animate-in zoom-in-95">
                          <input
                            type="text"
                            className="w-full p-4 bg-white border border-slate-200 rounded-2xl text-[11px] font-black uppercase outline-none focus:ring-4 focus:ring-blue-50 transition-all"
                            placeholder="Telefone"
                            value={manualClientPhone}
                            onChange={async (e) => {
                              const phone = e.target.value;
                              setManualClientPhone(phone);
                              if (phone.length >= 8) {
                                const matched = clients.find(c => c.phone.replace(/\D/g, '') === phone.replace(/\D/g, ''));
                                if (matched) {
                                  setManualClientName(matched.name);
                                  setManualClientAddress(matched.addresses[0] || '');
                                }
                              }
                            }}
                          />
                          <input
                            type="text"
                            className="w-full p-4 bg-white border border-slate-200 rounded-2xl text-[11px] font-black uppercase outline-none focus:ring-4 focus:ring-blue-50 transition-all"
                            placeholder="Nome Completo"
                            value={manualClientName}
                            onChange={(e) => setManualClientName(e.target.value)}
                          />
                          <textarea className="w-full p-4 bg-white border border-slate-200 rounded-2xl text-[11px] font-black uppercase outline-none focus:ring-4 focus:ring-blue-50 transition-all h-20 resize-none" placeholder="Endereço (Opcional)" value={manualClientAddress} onChange={(e) => setManualClientAddress(e.target.value)} />
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
              <div className="flex justify-between items-end">
                <span className="font-black text-[10px] uppercase opacity-50">Total Mesa:</span>
                <span className="text-2xl font-black">R$ {(isConfirmingBilling ? printingPreBill : getSessForTable(selectedTable!))?.items.reduce((acc, it) => acc + (it.price * it.quantity), 0).toFixed(2)}</span>
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
    </div>
  );
};

export default Tables;
