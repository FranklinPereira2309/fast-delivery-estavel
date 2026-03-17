
import React, { useState, useEffect, useMemo } from 'react';
import { DeliveryDriver, Order, OrderStatus, OrderStatusLabels, SaleType, User, Product, BusinessSettings } from '../types';
import { db } from '../services/db';
import { Icons } from '../constants';
import { socket, chatUnreadManager } from '../services/socket';
import CustomAlert from '../components/CustomAlert';
import { getLocalIsoDate } from '../services/dateUtils';

const BlinkCSS = () => (
  <style>{`
        @keyframes blink {
            0% { opacity: 1; }
            50% { opacity: 0.3; }
            100% { opacity: 1; }
        }
        .animate-blink {
            animation: blink 0.8s infinite;
        }
    `}</style>
);

const paymentLabels: { [key: string]: string } = {
  'pix': 'PIX',
  'PIX': 'PIX',
  'cartao_credito': 'Cartão de Crédito',
  'CREDIT': 'Cartão de Crédito',
  'CRÉDITO': 'Cartão de Crédito',
  'cartao_debito': 'Cartão de Débito',
  'DEBIT': 'Cartão de Débito',
  'DÉBITO': 'Cartão de Débito',
  'dinheiro': 'Dinheiro',
  'CASH': 'Dinheiro',
  'DINHEIRO': 'Dinheiro'
};

const CheckoutTimer: React.FC<{ assignedAt: string, timeoutMinutes: number }> = ({ assignedAt, timeoutMinutes }) => {
  const [timeLeft, setTimeLeft] = useState('');
  useEffect(() => {
    const timer = setInterval(() => {
      const assigned = new Date(assignedAt).getTime();
      const now = new Date().getTime();
      const diff = (timeoutMinutes * 60000) - (now - assigned);
      if (diff <= 0) setTimeLeft('EXPIRADO');
      else {
        const mins = Math.floor(diff / 60000);
        const secs = Math.floor((diff % 60000) / 1000);
        setTimeLeft(`${mins}:${secs.toString().padStart(2, '0')}`);
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [assignedAt, timeoutMinutes]);
  return (
    <div className="flex items-center gap-1.5 px-3 py-1 bg-amber-50 dark:bg-amber-900/20 rounded-full border border-amber-100 dark:border-amber-800">
      <div className="w-1.5 h-1.5 bg-amber-500 rounded-full animate-pulse" />
      <span className="text-[9px] font-black text-amber-600 dark:text-amber-400 uppercase tracking-widest">Expira em: {timeLeft}</span>
    </div>
  );
};

const FleetManagement: React.FC<{ refreshLogistics: () => void }> = ({ refreshLogistics }) => {
  const [drivers, setDrivers] = useState<DeliveryDriver[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingDriver, setEditingDriver] = useState<DeliveryDriver | null>(null);
  const [formData, setFormData] = useState({
    name: '', phone: '', email: '', address: '', plate: '', model: '', brand: '', type: 'Moto' as any
  });
  const [alertConfig, setAlertConfig] = useState<{ isOpen: boolean, title: string, message: string, type: 'SUCCESS' | 'ERROR' | 'DANGER', onConfirm?: () => void }>({
    isOpen: false, title: '', message: '', type: 'SUCCESS'
  });

  const refresh = async () => setDrivers(await db.getDrivers());
  useEffect(() => { refresh(); }, []);

  const openModal = (driver?: DeliveryDriver) => {
    if (driver) {
      setEditingDriver(driver);
      setFormData({
        name: driver.name, phone: driver.phone, email: driver.email || '', address: driver.address || '',
        plate: driver.vehiclePlate === 'N/A' ? '' : driver.vehiclePlate,
        model: driver.vehicleModel, brand: driver.vehicleBrand, type: driver.vehicleType
      });
    } else {
      setEditingDriver(null);
      setFormData({ name: '', phone: '', email: '', address: '', plate: '', model: '', brand: '', type: 'Moto' });
    }
    setIsModalOpen(true);
  };

  const saveDriver = async (e: React.FormEvent) => {
    e.preventDefault();
    const driver: DeliveryDriver = {
      id: editingDriver?.id || `DRV-${Date.now()}`,
      name: formData.name, phone: formData.phone, email: formData.email, address: formData.address,
      vehiclePlate: formData.type === 'Bicicleta' ? 'N/A' : (formData.plate || '---'),
      vehicleModel: formData.model, vehicleBrand: formData.brand, vehicleType: formData.type,
      status: editingDriver?.status || 'AVAILABLE',
      active: editingDriver?.active ?? true
    };
    await db.saveDriver(driver);
    refresh();
    refreshLogistics();
    setIsModalOpen(false);
  };

  const handleToggleStatus = async (driver: DeliveryDriver) => {
    const action = driver.active ? 'inativar' : 'ativar';
    setAlertConfig({
      isOpen: true,
      title: `${action.toUpperCase()} ENTREGADOR`,
      message: `Tem certeza que deseja ${action} o acesso de ${driver.name}?`,
      type: driver.active ? 'DANGER' : 'INFO',
      onConfirm: async () => {
        await db.toggleDriverStatus(driver.id, !driver.active);
        refresh();
        refreshLogistics();
        setAlertConfig(prev => ({ ...prev, isOpen: false }));
      }
    });
  };

  const handleResetDriver = async (driver: DeliveryDriver) => {
    setAlertConfig({
      isOpen: true,
      title: 'RESET DE SEGURANÇA',
      message: `A senha de ${driver.name} será resetada para '123' e um novo código de recuperação será gerado. Prosseguir?`,
      type: 'DANGER',
      onConfirm: async () => {
        await db.resetDriver(driver.id);
        setAlertConfig(prev => ({ ...prev, isOpen: false }));
      }
    });
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <CustomAlert
        isOpen={alertConfig.isOpen}
        title={alertConfig.title}
        message={alertConfig.message}
        type={alertConfig.type}
        onConfirm={alertConfig.onConfirm || (() => setAlertConfig(prev => ({ ...prev, isOpen: false })))}
        onCancel={() => setAlertConfig(prev => ({ ...prev, isOpen: false }))}
      />
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-xl font-black text-slate-800 dark:text-white uppercase tracking-tighter">Frota de Entregadores</h3>
          <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Base de entregadores cadastrados no sistema</p>
        </div>
        <button onClick={() => openModal()} className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-lg shadow-blue-100 dark:shadow-blue-900/20 transition-all">+ Novo Entregador</button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {drivers.map(driver => (
          <div key={driver.id} className={`bg-white dark:bg-slate-900 p-6 rounded-[2.5rem] border border-slate-100 dark:border-slate-800 flex flex-col group hover:shadow-xl transition-all relative overflow-hidden ${!driver.active ? 'opacity-50 grayscale' : ''}`}>
            <div className="flex items-center gap-4 mb-4">
              <div className="w-12 h-12 bg-slate-900 dark:bg-slate-800 text-white dark:text-slate-200 rounded-2xl flex items-center justify-center font-black uppercase tracking-widest text-sm relative">
                {driver.name.substring(0, 2)}
                {!driver.active && <div className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full border-2 border-white dark:border-slate-900"></div>}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="font-black text-slate-800 dark:text-white uppercase text-xs truncate">{driver.name} {driver.vehicleType === 'Bicicleta' && '🚲'}</p>
                  {!driver.active && <span className="text-[7px] bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-400 font-black px-1.5 py-0.5 rounded-full uppercase tracking-widest shrink-0">Inativo</span>}
                </div>
                <p className="text-[10px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-widest">{driver.vehicleBrand} {driver.vehicleModel}</p>
              </div>
            </div>
            <div className="flex justify-between items-center pt-4 border-t border-slate-50 dark:border-slate-800">
              <div className="flex flex-col">
                <span className="text-[8px] font-black text-slate-300 dark:text-slate-600 uppercase tracking-[0.2em] mb-1">Placa / Whats</span>
                <span className="font-mono text-[10px] font-black text-slate-600 dark:text-slate-400 uppercase">{driver.vehiclePlate === 'N/A' ? driver.phone : driver.vehiclePlate}</span>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => handleResetDriver(driver)}
                  title="Resetar Segurança"
                  className="p-3 bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400 rounded-xl hover:bg-amber-600 dark:hover:bg-amber-500 hover:text-white transition-all outline-none"
                >
                  <Icons.Clock size={16} />
                </button>
                <button
                  onClick={() => openModal(driver)}
                  title="Editar Dados"
                  className="p-3 bg-slate-50 dark:bg-slate-800 text-blue-600 dark:text-blue-400 rounded-xl hover:bg-blue-600 dark:hover:bg-blue-500 hover:text-white transition-all outline-none"
                >
                  <Icons.Edit size={16} />
                </button>
                <button
                  onClick={() => handleToggleStatus(driver)}
                  title={driver.active ? 'Inativar Entregador' : 'Ativar Entregador'}
                  className={`p-3 rounded-xl transition-all outline-none ${driver.active ? 'bg-red-50 dark:bg-red-900/40 text-red-600 dark:text-red-400 hover:bg-red-600 hover:text-white' : 'bg-emerald-50 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-600 hover:text-white'}`}
                >
                  {driver.active ? <Icons.Delete size={16} /> : <Icons.User size={16} />}
                </button>
              </div>
            </div>
          </div>
        ))}
        {drivers.length === 0 && (
          <div className="col-span-full py-20 text-center bg-white dark:bg-slate-900 rounded-3xl border-2 border-dashed border-slate-50 dark:border-slate-800 italic text-slate-300 dark:text-slate-700 text-xs font-black uppercase tracking-widest">
            Nenhum entregador cadastrado
          </div>
        )}
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 rounded-[3rem] shadow-2xl w-full max-w-2xl overflow-hidden animate-in zoom-in duration-200 border border-transparent dark:border-slate-800">
            <div className="p-10 pb-0 flex justify-between items-start">
              <div>
                <h3 className="text-2xl font-black text-slate-800 dark:text-white uppercase tracking-tighter mb-1">{editingDriver ? 'Editar Entregador' : 'Novo Entregador'}</h3>
                <p className="text-[10px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-widest">Base de entregadores cadastrados no sistema</p>
              </div>
              <button onClick={() => setIsModalOpen(false)} className="p-3 bg-slate-50 dark:bg-slate-800 text-slate-400 dark:text-slate-500 rounded-2xl hover:text-red-500 transition-all">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
              </button>
            </div>
            <form onSubmit={saveDriver} className="p-10 space-y-8">
              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest ml-1">Nome Completo</label>
                  <input type="text" required value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} className="w-full p-4 bg-slate-100 dark:bg-slate-800 border-none rounded-2xl outline-none font-bold text-sm text-slate-800 dark:text-white" placeholder="Ex: Roberto Carlos" />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest ml-1">Celular / Whats</label>
                  <input type="text" required value={formData.phone} onChange={e => setFormData({ ...formData, phone: e.target.value })} className="w-full p-4 bg-slate-100 dark:bg-slate-800 border-none rounded-2xl outline-none font-bold text-sm text-slate-800 dark:text-white" placeholder="(00) 00000-0000" />
                </div>
                <div className="space-y-1 col-span-2">
                  <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest ml-1">Email <span className="text-blue-500 dark:text-blue-400 font-bold">(Obrigatório para login no App)</span></label>
                  <input type="email" value={formData.email} onChange={e => setFormData({ ...formData, email: e.target.value })} className="w-full p-4 bg-slate-100 dark:bg-slate-800 border-none rounded-2xl outline-none font-bold text-sm text-slate-800 dark:text-white" placeholder="moto@exemplo.com" />
                </div>
              </div>
              <div className="pt-6 border-t border-slate-100 dark:border-slate-800">
                <h4 className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-6">Informações do Veículo</h4>
                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest ml-1">Tipo de Veículo</label>
                    <select value={formData.type} onChange={e => setFormData({ ...formData, type: e.target.value as any })} className="w-full p-4 bg-slate-100 dark:bg-slate-800 border-none rounded-2xl outline-none font-bold text-sm text-slate-800 dark:text-white">
                      <option value="Moto">Moto</option>
                      <option value="Carro">Carro</option>
                      <option value="Bicicleta">Bicicleta</option>
                    </select>
                  </div>
                  <div className={`space-y-1 ${formData.type === 'Bicicleta' ? 'opacity-30 pointer-events-none' : ''}`}>
                    <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest ml-1">Identificação / Placa</label>
                    <input
                      type="text"
                      value={formData.type === 'Bicicleta' ? 'N/A' : formData.plate}
                      onChange={e => setFormData({ ...formData, plate: e.target.value.toUpperCase() })}
                      className="w-full p-4 bg-slate-100 dark:bg-slate-800 border-none rounded-2xl outline-none font-bold text-sm font-mono uppercase text-slate-800 dark:text-white"
                      placeholder={formData.type === 'Bicicleta' ? 'N/A' : 'ABC-1234'}
                      disabled={formData.type === 'Bicicleta'}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest ml-1">Modelo / Cor</label>
                    <input type="text" value={formData.model} onChange={e => setFormData({ ...formData, model: e.target.value })} className="w-full p-4 bg-slate-100 dark:bg-slate-800 border-none rounded-2xl outline-none font-bold text-sm text-slate-800 dark:text-white" placeholder="Ex: CB 500 / Azul" />
                  </div>
                </div>
              </div>
              <button type="submit" className="w-full py-5 bg-blue-600 text-white rounded-2xl font-black uppercase text-xs tracking-widest shadow-xl shadow-blue-100 dark:shadow-blue-900/20 hover:bg-blue-700 transition-all">Confirmar Registro</button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

const Logistics: React.FC = () => {
  const [drivers, setDrivers] = useState<DeliveryDriver[]>([]);
  const [readyOrders, setReadyOrders] = useState<Order[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [businessSettings, setBusinessSettings] = useState<BusinessSettings | null>(null);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [printingOrder, setPrintingOrder] = useState<Order | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const [activeTab, setActiveTab] = useState<'PENDING' | 'HISTORY' | 'FROTA' | 'CHAT'>('PENDING');
  const [historyOrders, setHistoryOrders] = useState<Order[]>([]);
  const [historyStartDate, setHistoryStartDate] = useState(getLocalIsoDate());
  const [historyEndDate, setHistoryEndDate] = useState(getLocalIsoDate());
  const [historyDriverId, setHistoryDriverId] = useState<string>('TODOS');
  const [printingHistoryOrder, setPrintingHistoryOrder] = useState<Order | null>(null);
  const [viewingHistoryOrder, setViewingHistoryOrder] = useState<Order | null>(null);

  // Chat States
  const [selectedDriver, setSelectedDriver] = useState<DeliveryDriver | null>(null);
  const [chatMessages, setChatMessages] = useState<any[]>([]);
  const [newChatMessage, setNewChatMessage] = useState('');
  const [unreadDrivers, setUnreadDrivers] = useState<Set<string>>(chatUnreadManager.getUnreads());
  const chatEndRef = React.useRef<HTMLDivElement>(null);

  useEffect(() => {
    refreshData();
    const session = db.getCurrentSession();
    if (session) setCurrentUser(session.user);

    const interval = setInterval(refreshData, 10000); // 10s para Render Free

    const handleNewMessage = (msg: any) => {
      if (activeTab === 'CHAT' && selectedDriver?.id === msg.driverId) {
        setChatMessages(prev => [...prev.filter(m => m.id !== msg.id), msg]);
      }
    };

    socket.on('drivers_updated', refreshData);
    socket.on('order_auto_rejected_global', refreshData);
    socket.on('new_message', handleNewMessage);

    return () => {
      clearInterval(interval);
      socket.off('drivers_updated');
      socket.off('order_auto_rejected_global');
      socket.off('new_message', handleNewMessage);
    };
  }, [activeTab, selectedDriver]);

  useEffect(() => {
    const unsubscribe = chatUnreadManager.subscribe((unreads) => {
      setUnreadDrivers(new Set(unreads));
    });
    setUnreadDrivers(new Set(chatUnreadManager.getUnreads()));
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (selectedDriver) {
      loadChatHistory(selectedDriver.id);
      chatUnreadManager.removeUnread(selectedDriver.id);
      setUnreadDrivers(new Set(chatUnreadManager.getUnreads()));
    }
  }, [selectedDriver]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  const loadChatHistory = async (driverId: string) => {
    const history = await db.getChatHistory(driverId);
    setChatMessages(history);
  };

  const handleSendChatMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newChatMessage.trim() || !selectedDriver || !currentUser) return;

    try {
      const msgData = {
        driverId: selectedDriver.id,
        content: newChatMessage,
        senderName: 'Atendimento',
        isFromDriver: false
      };
      const savedMsg = await db.sendChatMessage(msgData);
      socket.emit('send_message', savedMsg);
      setNewChatMessage('');
      loadChatHistory(selectedDriver.id);
    } catch (e) {
      console.error("Erro ao enviar mensagem para motorista:", e);
    }
  };

  const refreshData = async () => {
    setIsLoading(true);
    try {
      const [allDrivers, allOrders, allProds, settings] = await Promise.all([
        db.getDrivers(),
        db.getOrders(),
        db.getProducts(),
        db.getSettings()
      ]);
      setDrivers(allDrivers);
      setProducts(allProds);
      setBusinessSettings(settings);
      setReadyOrders(allOrders.filter(o =>
        o.type === SaleType.OWN_DELIVERY &&
        ([OrderStatus.READY, OrderStatus.OUT_FOR_DELIVERY] as OrderStatus[]).includes(o.status)
      ).sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
      setHistoryOrders(allOrders.filter(o => o.type === SaleType.OWN_DELIVERY && o.status === OrderStatus.DELIVERED));
    } catch (error) {
      console.error("Error refreshing Logistics data:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const assignDriver = async (orderId: string, driverId: string) => {
    if (!currentUser) return;
    // O status continua Ready (Pronto), apenas atribuímos o motorista para que ele possa aceitar/recusar no APP
    await db.updateOrderStatus(orderId, OrderStatus.READY, currentUser, driverId);
    refreshData();
  };

  const getDriverName = (driverId?: string) => {
    if (!driverId) return 'Desconhecido';
    return drivers.find(d => d.id === driverId)?.name || 'Removido';
  };

  // Agrupamento para o cupom de entrega
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

  return (
    <div className="flex flex-col h-full gap-6 relative">
      {isLoading && (
        <div className="absolute top-0 left-0 w-full h-1 bg-indigo-100 dark:bg-blue-900/20 overflow-hidden z-50">
          <div className="h-full bg-indigo-600 dark:bg-blue-600 animate-[loading_2s_infinite]"></div>
        </div>
      )}
      <style>{`
                @keyframes loading {
                    0% { transform: translateX(-100%); }
                    100% { transform: translateX(100%); }
                }
            `}</style>
      <BlinkCSS />
      <div className="flex items-center gap-4 bg-white dark:bg-slate-900 p-2 rounded-3xl w-max shadow-sm border border-slate-100 dark:border-slate-800 flex-shrink-0">
        <button
          onClick={() => setActiveTab('PENDING')}
          className={`px-6 py-3 rounded-2xl text-[11px] font-black uppercase tracking-widest transition-all ${activeTab === 'PENDING' ? 'bg-slate-900 dark:bg-blue-600 text-white shadow-xl' : 'text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'}`}
        >
          Entregas
        </button>
        <button
          onClick={() => setActiveTab('HISTORY')}
          className={`px-6 py-3 rounded-2xl text-[11px] font-black uppercase tracking-widest transition-all ${activeTab === 'HISTORY' ? 'bg-slate-900 dark:bg-blue-600 text-white shadow-xl' : 'text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'}`}
        >
          Histórico
        </button>
        <button
          onClick={() => setActiveTab('FROTA')}
          className={`px-6 py-3 rounded-2xl text-[11px] font-black uppercase tracking-widest transition-all ${activeTab === 'FROTA' ? 'bg-slate-900 dark:bg-blue-600 text-white shadow-xl' : 'text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'}`}
        >
          Frota
        </button>
        <button
          onClick={() => setActiveTab('CHAT')}
          className={`px-6 py-3 rounded-2xl text-[11px] font-black uppercase tracking-widest transition-all relative ${activeTab === 'CHAT' ? 'bg-slate-900 dark:bg-blue-600 text-white shadow-xl' : 'text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'}`}
        >
          Chat Entregadores
          {unreadDrivers.size > 0 && <span className="absolute -top-1 -right-1 w-3 h-3 bg-rose-500 rounded-full animate-pulse shadow-sm border-2 border-white dark:border-slate-800" />}
        </button>
      </div>

      {activeTab === 'PENDING' ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6 overflow-y-auto pb-8 flex-1 flex flex-col">
          {readyOrders.length > 0 ? readyOrders.map(order => (
            <div key={order.id} className="bg-white dark:bg-slate-900 p-6 rounded-3xl shadow-sm border border-slate-100 dark:border-slate-800 flex flex-col gap-4 group hover:shadow-xl transition-all h-max">
              <div className="flex justify-between items-start">
                <div>
                  <h4 className="font-black text-slate-800 dark:text-white uppercase text-lg">{order.id.split('-')[1] || order.id}</h4>
                  <p className="text-[10px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-widest">{order.clientName}</p>
                </div>
                <div className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase text-white shadow-sm ${order.status === OrderStatus.READY ? 'bg-emerald-500' :
                  order.status === OrderStatus.OUT_FOR_DELIVERY ? 'bg-blue-600' : 'bg-slate-900'
                  }`}>
                  {OrderStatusLabels[order.status]}
                </div>
              </div>

              <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-2xl flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <Icons.Logistics className="w-5 h-5 text-slate-400 dark:text-slate-500 flex-shrink-0" />
                  <p className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">Destino:</p>
                </div>
                <p className="text-xs font-bold text-slate-700 dark:text-slate-300 leading-tight">{order.clientAddress || 'Endereço não informado'}</p>
              </div>

              <div className="flex justify-between items-center text-sm font-black text-slate-900 border-t border-slate-50 dark:border-slate-800 pt-3">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-slate-400 dark:text-slate-500 uppercase">Total:</span>
                  <span className="text-slate-900 dark:text-white">R$ {order.total.toFixed(2)}</span>
                </div>
                <button
                  onClick={() => setPrintingOrder(order)}
                  className="p-2 text-slate-300 dark:text-slate-600 hover:text-blue-500 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-xl transition-all"
                  title="Imprimir Cupom de Entrega"
                >
                  <Icons.Print />
                </button>
              </div>

              {order.status === OrderStatus.READY && !order.driverId ? (
                <div className="mt-4 space-y-3">
                  <p className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">Vincular Entregador:</p>
                  <div className="flex flex-col gap-2 max-h-40 overflow-y-auto pr-1">
                    {drivers.length > 0 ? drivers.map(driver => (
                      <button
                        key={driver.id}
                        onClick={() => assignDriver(order.id, driver.id)}
                        className="flex items-center gap-3 p-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl text-left hover:border-blue-500 dark:hover:border-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-all group/btn"
                      >
                        <div className="w-8 h-8 bg-slate-900 dark:bg-slate-700 rounded-lg flex items-center justify-center text-white text-[10px] font-black">{driver.name.charAt(0)}</div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[11px] font-black text-slate-800 dark:text-slate-200 truncate">{driver.name}</p>
                        </div>
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-slate-200 group-hover/btn:text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M9 5l7 7-7 7" /></svg>
                      </button>
                    )) : (
                      <p className="text-[10px] text-slate-400 dark:text-slate-500 font-bold text-center italic py-2">Nenhum entregador online.</p>
                    )}
                  </div>
                </div>
              ) : (order.status === OrderStatus.OUT_FOR_DELIVERY || (order.status === OrderStatus.READY && order.driverId)) ? (
                <div className="mt-4 space-y-4">
                  <div className="flex items-center gap-3 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800 rounded-2xl">
                    <div className="w-10 h-10 bg-blue-600 rounded-full flex items-center justify-center text-white font-black uppercase shadow-md">{getDriverName(order.driverId).charAt(0)}</div>
                    <div className="flex-1">
                      <p className="text-xs font-black text-blue-900 dark:text-blue-300 truncate">Com: {getDriverName(order.driverId)}</p>
                      <p className="text-[9px] text-blue-400 dark:text-blue-500 font-black uppercase mt-0.5">Veículo: {drivers.find(d => d.id === order.driverId)?.vehiclePlate || 'N/A'}</p>
                    </div>
                  </div>
                  {order.status === OrderStatus.READY && order.driverId ? (
                    <div className="mt-4 space-y-3">
                      <CheckoutTimer assignedAt={order.assignedAt!} timeoutMinutes={businessSettings?.orderTimeoutMinutes || 5} />
                      <div className="p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-100 dark:border-amber-800 rounded-xl text-center">
                        <p className="text-[9px] font-black text-amber-600 dark:text-amber-400 uppercase tracking-widest">Aguardando aceite do entregador no APP...</p>
                      </div>
                    </div>
                  ) : (
                    <div className="p-3 bg-blue-100 dark:bg-blue-900/40 border border-blue-200 dark:border-blue-800 rounded-xl text-center">
                      <p className="text-[9px] font-black text-blue-800 dark:text-blue-300 uppercase tracking-widest">Entregador em Rota...</p>
                    </div>
                  )}
                </div>
              ) : (
                <div className="mt-4 p-4 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-100 dark:border-emerald-800 rounded-2xl text-center">
                  <p className="text-[10px] font-black text-emerald-700 dark:text-emerald-400 uppercase tracking-widest">Entrega Finalizada</p>
                  <p className="text-[9px] text-emerald-400 dark:text-emerald-500 font-bold uppercase mt-1">Por: {getDriverName(order.driverId)}</p>
                </div>
              )}
            </div>
          )) : (
            <div className="col-span-full py-20 text-center bg-white dark:bg-slate-900 rounded-3xl border-2 border-dashed border-slate-100 dark:border-slate-800 flex-1 h-full flex flex-col items-center justify-center">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 mx-auto text-slate-200 dark:text-slate-800 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              <p className="text-slate-400 dark:text-slate-600 font-bold uppercase tracking-widest text-xs">Sem entregas pendentes no momento...</p>
            </div>
          )}
        </div>
      ) : activeTab === 'FROTA' ? (
        <FleetManagement refreshLogistics={refreshData} />
      ) : activeTab === 'CHAT' ? (
        <div className="flex-1 min-h-0 bg-white dark:bg-slate-900 rounded-[2.5rem] border border-slate-100 dark:border-slate-800 shadow-sm flex overflow-hidden animate-in slide-in-from-right duration-500">
          {/* Sidebar de Chats */}
          <div className="w-80 border-r border-slate-50 dark:border-slate-800 flex flex-col bg-slate-50/30 dark:bg-slate-800/10">
            <div className="p-6 border-b border-slate-100 dark:border-slate-800">
              <h3 className="text-xs font-black text-slate-800 dark:text-white uppercase tracking-widest">Chat Entregadores:</h3>
            </div>
            <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-2 custom-scrollbar">
              {drivers.length > 0 ? drivers.map(driver => (
                <button
                  key={driver.id}
                  onClick={() => setSelectedDriver(driver)}
                  className={`flex items-center gap-3 p-4 rounded-3xl transition-all relative ${selectedDriver?.id === driver.id ? 'bg-white dark:bg-slate-800 shadow-md border border-slate-100 dark:border-slate-700 scale-[1.02]' : 'hover:bg-white/50 dark:hover:bg-slate-800'}`}
                >
                  {unreadDrivers.has(driver.id) && <span className="absolute top-3 right-3 w-3 h-3 bg-rose-500 rounded-full animate-pulse border-2 border-white dark:border-slate-900 shadow-sm" />}
                  <div className={`w-10 h-10 rounded-2xl flex items-center justify-center text-white font-black uppercase text-sm ${selectedDriver?.id === driver.id ? 'bg-slate-900 dark:bg-blue-600 shadow-lg shadow-slate-500/20 dark:shadow-blue-900/40' : 'bg-slate-300 dark:bg-slate-700'} shrink-0`}>
                    {driver.name.charAt(0)}
                  </div>
                  <div className="flex-1 text-left min-w-0 pr-4">
                    <p className="text-sm font-black text-slate-800 dark:text-white truncate">{driver.name}</p>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <div className={`w-1.5 h-1.5 rounded-full ${driver.active ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-600'}`} />
                      <span className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest whitespace-nowrap">{driver.active ? 'Online' : 'Offline'} / {driver.vehiclePlate}</span>
                    </div>
                  </div>
                </button>
              )) : (
                <p className="text-center text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase py-10 opacity-50">Nenhum entregador cadastrado</p>
              )}
            </div>
          </div>

          {/* Área de Chat */}
          <div className="flex-1 flex flex-col bg-white dark:bg-slate-900">
            {selectedDriver ? (
              <>
                <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50/10 dark:bg-slate-800/10">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-2xl flex items-center justify-center text-white font-black uppercase text-sm shadow-xl bg-slate-900 dark:bg-blue-600 shadow-slate-500/10 dark:shadow-blue-900/40">
                      {selectedDriver.name.charAt(0)}
                    </div>
                    <div>
                      <h4 className="text-sm font-black text-slate-800 dark:text-white">{selectedDriver.name}</h4>
                      <p className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">
                        Entregador / {selectedDriver.vehicleType}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto p-8 flex flex-col gap-4 custom-scrollbar bg-slate-50/20 dark:bg-slate-800/10">
                  {chatMessages.length === 0 && (
                    <div className="flex flex-col items-center justify-center h-full py-20 grayscale opacity-40">
                      <Icons.Message className="w-16 h-16 mb-4 text-slate-200 dark:text-slate-700" />
                      <p className="text-xs font-black uppercase tracking-widest text-slate-300 dark:text-slate-600">Nenhuma mensagem neste chat</p>
                    </div>
                  )}
                  {chatMessages.map((msg, i) => (
                    <div key={msg.id || i} className={`flex ${msg.isFromDriver ? 'justify-start' : 'justify-end'}`}>
                      <div className={`max-w-[70%] p-5 rounded-[2rem] shadow-sm text-sm ${msg.isFromDriver ? 'bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-800 text-slate-800 dark:text-slate-200 rounded-tl-none' : 'bg-slate-900 dark:bg-blue-600 text-white rounded-tr-none'}`}>
                        <div className="flex justify-between items-center mb-1 gap-4">
                          <span className={`text-[8px] font-black uppercase tracking-widest ${msg.isFromDriver ? 'text-indigo-600 dark:text-indigo-400' : 'opacity-50'}`}>
                            {msg.isFromDriver ? (msg.senderName || selectedDriver?.name || 'Entregador') : 'Você'}
                          </span>
                          <span className="text-[8px] font-black opacity-30 uppercase tracking-tighter">
                            {new Date(msg.timestamp).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                        <p className="font-bold leading-relaxed">{msg.content}</p>
                      </div>
                    </div>
                  ))}
                  <div ref={chatEndRef} />
                </div>

                <form onSubmit={handleSendChatMessage} className="p-6 bg-white dark:bg-slate-900 border-t border-slate-100 dark:border-slate-800 flex gap-4">
                  <input
                    type="text"
                    value={newChatMessage}
                    onChange={e => setNewChatMessage(e.target.value)}
                    placeholder="Digite sua mensagem para o entregador..."
                    className="flex-1 bg-slate-50 dark:bg-slate-800 border-none rounded-2xl px-6 text-sm font-bold focus:ring-4 focus:ring-slate-500/10 dark:focus:ring-blue-500/10 transition-all outline-none text-slate-800 dark:text-white"
                  />
                  <button type="submit" className="px-8 bg-slate-900 dark:bg-blue-600 text-white rounded-2xl font-black uppercase text-xs tracking-widest shadow-xl shadow-slate-500/20 dark:shadow-blue-900/40 active:scale-95 transition-all">
                    Enviar
                  </button>
                </form>
              </>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-slate-300 dark:text-slate-700 p-12 text-center">
                <div className="w-24 h-24 bg-slate-50 dark:bg-slate-800/50 rounded-full flex items-center justify-center mb-6 transform rotate-12">
                  <Icons.Message className="w-12 h-12 text-slate-200 dark:text-slate-700" />
                </div>
                <h3 className="text-lg font-black text-slate-800 dark:text-white uppercase tracking-tighter mb-2">Comunicação com Frota</h3>
                <p className="text-xs font-bold text-slate-400 dark:text-slate-500 max-w-xs leading-relaxed uppercase">Selecione um entregador ao lado para enviar mensagens e coordenar entregas em tempo real.</p>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-6 h-full overflow-hidden flex-1">
          <div className="bg-white dark:bg-slate-900 p-6 rounded-3xl shadow-sm border border-slate-100 dark:border-slate-800 flex justify-between items-center">
            <div>
              <h3 className="text-lg font-black text-slate-800 dark:text-white uppercase tracking-tighter">Histórico de Entregas</h3>
              <p className="text-[10px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-widest">Registros de entregas finalizadas pelo sistema</p>
            </div>
          </div>

          <div className="flex-1 overflow-auto bg-white dark:bg-slate-900 rounded-[2.5rem] border border-slate-100 dark:border-slate-800 shadow-sm custom-scrollbar">
            <table className="w-full text-left border-collapse min-w-[900px]">
              <thead>
                <tr className="bg-slate-50/50 dark:bg-slate-800/30 border-b border-slate-100 dark:border-slate-800">
                  <th className="px-8 py-5 text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">Status</th>
                  <th className="px-8 py-5 text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">Cliente / Pedido</th>
                  <th className="px-8 py-5 text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">Entregador</th>
                  <th className="px-8 py-5 text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">Data / Hora</th>
                  <th className="px-8 py-5 text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">Total</th>
                  <th className="px-8 py-5 text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
                {historyOrders.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map(order => (
                  <tr key={order.id} className="hover:bg-slate-50/30 dark:hover:bg-slate-800/20 group transition-colors">
                    <td className="px-8 py-5 text-center">
                      <span className="px-3 py-1.5 rounded-xl text-[9px] font-black uppercase text-white shadow-sm bg-emerald-500">
                        ENTREGUE
                      </span>
                    </td>
                    <td className="px-8 py-5">
                      <p className="font-black text-slate-800 dark:text-white text-[11px] uppercase tracking-tighter">
                        {order.id.split('-')[1] || order.id}
                      </p>
                      <p className="text-[9px] text-slate-400 dark:text-slate-500 font-bold uppercase truncate max-w-[180px]">
                        {order.clientName}
                      </p>
                    </td>
                    <td className="px-8 py-5">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 bg-emerald-100 dark:bg-emerald-900/30 rounded-lg flex items-center justify-center text-[9px] font-black text-emerald-600 dark:text-emerald-400">
                          {getDriverName(order.driverId).charAt(0)}
                        </div>
                        <p className="text-[10px] font-bold text-slate-600 dark:text-slate-400 uppercase">
                          {getDriverName(order.driverId)}
                        </p>
                      </div>
                    </td>
                    <td className="px-8 py-5">
                      <div className="space-y-0.5">
                        <p className="text-[10px] font-bold text-slate-700 dark:text-slate-300">
                          {new Date(order.createdAt).toLocaleDateString('pt-BR')}
                        </p>
                        <p className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase">
                          {new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(new Date(order.createdAt))}
                        </p>
                      </div>
                    </td>
                    <td className="px-8 py-5">
                      <p className="text-[11px] font-black text-blue-600 dark:text-blue-400">
                        R$ {order.total.toFixed(2)}
                      </p>
                    </td>
                    <td className="px-8 py-5">
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => setViewingHistoryOrder(order)}
                          className="p-2.5 text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 bg-slate-50 dark:bg-slate-800/50 rounded-xl transition-all"
                          title="Ver Detalhes / Imprimir"
                        >
                          <Icons.Print size={18} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {historyOrders.length === 0 && (
            <div className="col-span-full py-20 text-center bg-white dark:bg-slate-900 rounded-3xl border-2 border-dashed border-slate-100 dark:border-slate-800 mt-2">
              <Icons.Clock className="w-12 h-12 mx-auto text-slate-200 dark:text-slate-800 mb-4" />
              <p className="text-slate-400 dark:text-slate-600 font-bold uppercase tracking-widest text-xs">Nenhuma entrega no histórico.</p>
            </div>
          )}
        </div>
      )
      }

      {/* DETALHES DA ENTREGA (MODAL) */}
      {viewingHistoryOrder && businessSettings && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 rounded-[3rem] shadow-2xl w-full max-w-2xl overflow-hidden animate-in zoom-in duration-200 border border-transparent dark:border-slate-800">
            <div className="p-10 pb-0 flex justify-between items-start">
              <div>
                <h3 className="text-2xl font-black text-slate-800 dark:text-white uppercase tracking-tighter mb-1">Detalhes da Entrega</h3>
                <p className="text-[10px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-widest px-1">Resumo completo do pedido finalizado</p>
              </div>
              <button
                onClick={() => setViewingHistoryOrder(null)}
                className="p-3 bg-slate-50 dark:bg-slate-800 text-slate-400 dark:text-slate-500 rounded-2xl hover:text-red-500 transition-all shadow-sm"
              >
                <Icons.X size={20} />
              </button>
            </div>

            <div className="p-10 space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-slate-50 dark:bg-slate-800/50 p-5 rounded-[2rem] border border-slate-100 dark:border-slate-800">
                  <p className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em] mb-3">Cliente / Destino</p>
                  <p className="text-sm font-black text-slate-800 dark:text-white uppercase mb-1">{viewingHistoryOrder.clientName}</p>
                  <p className="text-[11px] font-bold text-slate-500 dark:text-slate-400 leading-tight">
                    {viewingHistoryOrder.clientAddress || 'Endereço não informado'}
                  </p>
                </div>
                <div className="bg-slate-50 dark:bg-slate-800/50 p-5 rounded-[2rem] border border-slate-100 dark:border-slate-800">
                  <p className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em] mb-3">Logística</p>
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-emerald-600 rounded-full flex items-center justify-center text-white font-black uppercase text-sm shadow-md">
                      {getDriverName(viewingHistoryOrder.driverId).charAt(0)}
                    </div>
                    <div>
                      <p className="text-[11px] font-black text-slate-800 dark:text-white uppercase">{getDriverName(viewingHistoryOrder.driverId)}</p>
                      <p className="text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase">Entregador</p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <p className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest ml-1">Itens do Pedido</p>
                <div className="bg-slate-50 dark:bg-slate-800/40 rounded-[2rem] border border-slate-100 dark:border-slate-800 overflow-hidden">
                  <div className="max-h-[200px] overflow-y-auto p-4 custom-scrollbar">
                    {viewingHistoryOrder.items.map((item, idx) => {
                      const prod = products.find(p => p.id === item.productId);
                      return (
                        <div key={idx} className="flex justify-between items-center py-3 border-b border-slate-100 dark:border-slate-800 last:border-0 px-2">
                          <div className="flex items-center gap-3">
                            <span className="w-6 h-6 flex items-center justify-center bg-slate-900 dark:bg-blue-600 text-white text-[10px] font-black rounded-lg">
                              {item.quantity}x
                            </span>
                            <span className="text-[11px] font-black text-slate-700 dark:text-slate-200 uppercase">{prod?.name || '...'}</span>
                          </div>
                          <span className="text-[11px] font-black text-slate-400 dark:text-slate-500">R$ {(item.quantity * item.price).toFixed(2)}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div className="pt-6 border-t border-slate-100 dark:border-slate-800 grid grid-cols-2 gap-8 items-end">
                <div className="space-y-2">
                  <div className="flex justify-between text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">
                    <span>Taxa Entrega:</span>
                    <span>R$ {(viewingHistoryOrder.deliveryFee || 0).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">
                    <span>Pagamento:</span>
                    <span className="text-slate-800 dark:text-white font-black">{(paymentLabels[(viewingHistoryOrder.paymentMethod || '').toUpperCase()] || viewingHistoryOrder.paymentMethod || 'PENDENTE').toUpperCase()}</span>
                  </div>
                  <div className="flex justify-between items-center pt-2">
                    <span className="text-xs font-black text-slate-800 dark:text-white uppercase tracking-tighter">Total Geral:</span>
                    <span className="text-xl font-black text-blue-600 dark:text-blue-400">R$ {viewingHistoryOrder.total.toFixed(2)}</span>
                  </div>
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={() => {
                      setPrintingHistoryOrder(viewingHistoryOrder);
                      setViewingHistoryOrder(null);
                    }}
                    className="flex-1 py-4 bg-slate-900 dark:bg-blue-600 text-white rounded-2xl font-black uppercase text-[10px] tracking-widest shadow-xl shadow-slate-500/20 dark:shadow-blue-900/40 hover:scale-[1.02] active:scale-95 transition-all flex items-center justify-center gap-2"
                  >
                    <Icons.Print size={16} /> Imprimir Cupom
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* CUPOM DE ENTREGA AGRUPADO */}
      {printingOrder && businessSettings && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-sm">
          <div className="relative w-full max-w-[58mm] bg-white rounded-[2rem] p-4 border border-dashed shadow-2xl font-receipt text-[10px] text-black print-container is-receipt animate-in zoom-in duration-200">
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
              <p>PAGTO: {(paymentLabels[(printingOrder.paymentMethod || '').toUpperCase()] || printingOrder.paymentMethod || 'PENDENTE').toUpperCase()}</p>
            </div>

            <div className="border-t border-dashed my-3 py-3">
              {Object.entries(printingOrder.items.reduce((acc: Record<string, any>, item) => {
                const prod = products.find(p => p.id === item.productId);
                if (!acc[item.productId]) {
                  acc[item.productId] = { name: prod?.name || '...', quantity: 0, price: item.price };
                }
                acc[item.productId].quantity += item.quantity;
                return acc;
              }, {} as Record<string, any>)).map(([id, data]: [string, any]) => (
                <div key={id} className="flex justify-between font-black uppercase py-0.5">
                  <span>{data.quantity}x {data.name.substring(0, 18)}</span>
                  <span>R$ {(data.quantity * data.price).toFixed(2)}</span>
                </div>
              ))}
            </div>

            <div className="flex justify-between items-center py-1">
              <span className="text-[9px] uppercase font-bold">TAXA ENTREGA:</span>
              <span className="font-bold">R$ {(printingOrder.deliveryFee || 0).toFixed(2)}</span>
            </div>

            <div className="flex justify-between items-end border-t border-dashed pt-4 mb-6">
              <span className="font-black text-[9px] uppercase tracking-widest">TOTAL:</span>
              <span className="text-2xl font-black">R$ {printingOrder.total.toFixed(2)}</span>
            </div>

            <div className="grid grid-cols-2 gap-4 no-print mt-6">
              <button
                onClick={async () => {
                  if (!businessSettings || !printingOrder) return;
                  try {
                    const payload = {
                      printerIp: businessSettings.printerIp,
                      type: businessSettings.printerType || 'EPSON',
                      data: {
                        businessName: businessSettings.name,
                        cnpj: businessSettings.cnpj,
                        date: printingOrder.createdAt,
                        clientName: printingOrder.clientName || 'CONSUMIDOR',
                        clientPhone: printingOrder.clientPhone,
                        clientAddress: printingOrder.clientAddress,
                        status: OrderStatusLabels[printingOrder.status],
                        paymentMethod: printingOrder.paymentMethod,
                        deliveryFee: printingOrder.deliveryFee || 0,
                        total: printingOrder.total,
                        items: printingOrder.items.map((it: any) => {
                          const prod = products.find(p => p.id === it.productId);
                          return {
                            name: (prod?.name || 'Item').substring(0, 22),
                            quantity: it.quantity,
                            total: it.price * it.quantity
                          };
                        })
                      }
                    };

                    if (businessSettings.printerIp) {
                      addToast({ title: 'Impressão', message: 'Enviando cupom de entrega...', type: 'INFO' });
                      const res = await db.printThermalReceipt(payload);
                      if (res.success) {
                        addToast({ title: 'Sucesso', message: 'Cupom impresso!', type: 'SUCCESS' });
                        setPrintingOrder(null);
                      }
                    } else {
                      window.print();
                    }
                  } catch (error: any) {
                    addToast({ title: 'Erro na Impressão', message: error.message || 'Falha ao comunicar com a impressora.', type: 'DANGER' });
                    window.print();
                  }
                }}
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
      )}

      {/* CUPOM DE HISTÓRICO RESUMIDO */}
      {printingHistoryOrder && businessSettings && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-sm">
          <div className="relative w-full max-w-[58mm] bg-white rounded-[2rem] p-4 border border-dashed shadow-2xl font-receipt text-[10px] text-black print-container is-receipt animate-in zoom-in duration-200">
            <div className="text-center mb-6 border-b border-dashed pb-4">
              <h2 className="font-black text-sm uppercase tracking-tighter">{businessSettings.name}</h2>
              <p className="text-[9px] font-bold mt-1 uppercase">Cópia de Comprovante</p>
            </div>

            <div className="space-y-1 mb-4">
              <p>DATA: {new Date(printingHistoryOrder.createdAt).toLocaleString('pt-BR')}</p>
              <p>CLIENTE: {printingHistoryOrder.clientName}</p>
              {printingHistoryOrder.clientPhone && <p>FONE: {printingHistoryOrder.clientPhone}</p>}
              {printingHistoryOrder.clientAddress && (
                <p className="font-bold border-t border-dashed mt-2 pt-1 uppercase leading-tight">ENTREGA: {printingHistoryOrder.clientAddress}</p>
              )}
              <p>PAGTO: {(paymentLabels[(printingHistoryOrder.paymentMethod || '').toUpperCase()] || printingHistoryOrder.paymentMethod || 'PENDENTE').toUpperCase()}</p>
              <p className="font-bold border-t border-dashed mt-2 pt-1 uppercase">ENTREGADOR: {getDriverName(printingHistoryOrder.driverId)}</p>
            </div>

            {groupedPrintingItems.length > 0 && (
              <div className="border-t border-dashed my-3 py-3">
                {groupedPrintingItems.map(([id, data]: [string, any]) => (
                  <div key={id} className="flex justify-between font-black uppercase py-0.5">
                    <span>{data.quantity}x {data.name.substring(0, 18)}</span>
                    <span>R$ {(data.quantity * data.price).toFixed(2)}</span>
                  </div>
                ))}
              </div>
            )}

            <div className="flex justify-between items-center py-1">
              <span className="text-[9px] uppercase font-bold">TAXA ENTREGA:</span>
              <span className="font-bold">R$ {(printingHistoryOrder.deliveryFee || 0).toFixed(2)}</span>
            </div>

            <div className="flex justify-between items-end border-t border-dashed pt-4 mb-6">
              <span className="font-black text-[9px] uppercase tracking-widest">TOTAL:</span>
              <span className="text-2xl font-black">R$ {printingHistoryOrder.total.toFixed(2)}</span>
            </div>

            <div className="grid grid-cols-2 gap-4 no-print mt-6">
              <button
                onClick={async () => {
                  if (!businessSettings || !printingHistoryOrder) return;
                  try {
                    const payload = {
                      printerIp: businessSettings.printerIp,
                      type: businessSettings.printerType || 'EPSON',
                      data: {
                        businessName: businessSettings.name,
                        cnpj: businessSettings.cnpj,
                        date: printingHistoryOrder.createdAt,
                        clientName: printingHistoryOrder.clientName || 'CONSUMIDOR',
                        clientPhone: printingHistoryOrder.clientPhone,
                        clientAddress: printingHistoryOrder.clientAddress,
                        status: 'ENTREGUE',
                        paymentMethod: printingHistoryOrder.paymentMethod,
                        deliveryFee: printingHistoryOrder.deliveryFee || 0,
                        total: printingHistoryOrder.total,
                        items: printingHistoryOrder.items.map((it: any) => {
                          const prod = products.find(p => p.id === it.productId);
                          return {
                            name: (prod?.name || 'Item').substring(0, 22),
                            quantity: it.quantity,
                            total: it.price * it.quantity
                          };
                        })
                      }
                    };

                    if (businessSettings.printerIp) {
                      addToast({ title: 'Impressão', message: 'Enviando cupom de histórico...', type: 'INFO' });
                      const res = await db.printThermalReceipt(payload);
                      if (res.success) {
                        addToast({ title: 'Sucesso', message: 'Cupom impresso!', type: 'SUCCESS' });
                        setPrintingHistoryOrder(null);
                      }
                    } else {
                      window.print();
                    }
                  } catch (error: any) {
                    addToast({ title: 'Erro na Impressão', message: error.message || 'Falha ao comunicar com a impressora.', type: 'DANGER' });
                    window.print();
                  }
                }}
                className="bg-slate-900 text-white py-4 rounded-[22px] font-receipt font-black uppercase text-[11px] shadow-xl hover:bg-black active:scale-95 transition-all flex items-center justify-center"
              >
                IMPRIMIR
              </button>
              <button
                onClick={() => setPrintingHistoryOrder(null)}
                className="bg-slate-50 text-slate-400 py-4 rounded-[22px] font-receipt font-black uppercase text-[11px] hover:bg-slate-100 active:scale-95 transition-all flex items-center justify-center"
              >
                FECHAR
              </button>
            </div>
          </div>
        </div>
      )}
    </div >
  );
};

export default Logistics;
