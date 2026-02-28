
import React, { useState, useEffect, useMemo } from 'react';
import { DeliveryDriver, Order, OrderStatus, OrderStatusLabels, SaleType, User, Product } from '../types';
import { db, BusinessSettings } from '../services/db';
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

const CheckoutTimer: React.FC<{ assignedAt: string, timeoutMinutes: number }> = ({ assignedAt, timeoutMinutes }) => {
  const [timeLeft, setTimeLeft] = useState<string>('--:--');

  useEffect(() => {
    const calculate = () => {
      const start = new Date(assignedAt).getTime();
      const limit = start + timeoutMinutes * 60 * 1000;
      const now = new Date().getTime();
      const diff = limit - now;

      if (diff <= 0) return setTimeLeft('00:00');

      const mins = Math.floor(diff / 60000);
      const secs = Math.floor((diff % 60000) / 1000);
      setTimeLeft(`${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`);
    };

    calculate();
    const interval = setInterval(calculate, 1000);
    return () => clearInterval(interval);
  }, [assignedAt, timeoutMinutes]);

  return (
    <div className="flex items-center gap-1.5 px-3 py-1 bg-amber-50 rounded-full border border-amber-100">
      <div className="w-1.5 h-1.5 bg-amber-500 rounded-full animate-pulse" />
      <span className="text-[9px] font-black text-amber-600 uppercase tracking-widest">Expira em: {timeLeft}</span>
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
      status: editingDriver?.status || 'AVAILABLE'
    };
    await db.saveDriver(driver);
    refresh();
    refreshLogistics();
    setIsModalOpen(false);
  };

  const deleteDriver = async (id: string) => {
    setAlertConfig({
      isOpen: true,
      title: 'REMOVER ENTREGADOR',
      message: 'Deseja remover este entregador da frota ativa? Esta ação não pode ser desfeita.',
      type: 'DANGER',
      onConfirm: async () => {
        await db.deleteDriver(id);
        refresh();
        refreshLogistics();
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
          <h3 className="text-xl font-black text-slate-800 uppercase tracking-tighter">Frota de Entregadores</h3>
          <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Base de entregadores cadastrados no sistema</p>
        </div>
        <button onClick={() => openModal()} className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-lg shadow-blue-100 transition-all">+ Novo Entregador</button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {drivers.map(driver => (
          <div key={driver.id} className="bg-white p-6 rounded-[2rem] border border-slate-100 group hover:shadow-xl transition-all relative overflow-hidden">
            <div className="flex items-center gap-4 mb-4">
              <div className="w-12 h-12 bg-slate-900 text-white rounded-2xl flex items-center justify-center font-black uppercase tracking-widest text-sm">{driver.name.substring(0, 2)}</div>
              <div className="flex-1 min-w-0">
                <p className="font-black text-slate-800 uppercase text-xs truncate">{driver.name} {driver.vehicleType === 'Bicicleta' && '🚲'}</p>
                <p className="text-[9px] text-slate-400 font-bold uppercase tracking-widest">{driver.vehicleBrand} {driver.vehicleModel}</p>
              </div>
            </div>
            <div className="flex justify-between items-center pt-4 border-t border-slate-50">
              <div className="flex flex-col">
                <span className="text-[8px] font-black text-slate-300 uppercase tracking-[0.2em] mb-1">Identificação / Placa</span>
                <span className="font-mono text-[10px] font-black text-slate-600 uppercase">{driver.vehiclePlate || 'N/A'}</span>
              </div>
              <div className="flex gap-1">
                <button onClick={() => openModal(driver)} className="p-2 text-slate-200 hover:text-blue-500 transition-all"><Icons.Edit /></button>
                <button onClick={() => deleteDriver(driver.id)} className="p-2 text-slate-200 hover:text-red-500 transition-all"><Icons.Delete /></button>
              </div>
            </div>
          </div>
        ))}
        {drivers.length === 0 && (
          <div className="col-span-full py-20 text-center bg-white rounded-3xl border-2 border-dashed border-slate-50 italic text-slate-300 text-xs font-black uppercase tracking-widest">
            Nenhum entregador cadastrado
          </div>
        )}
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white rounded-[3rem] shadow-2xl w-full max-w-2xl overflow-hidden animate-in zoom-in duration-200">
            <div className="p-8 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
              <h3 className="text-2xl font-black text-slate-800 uppercase tracking-tighter">{editingDriver ? 'Editar Entregador' : 'Novo Entregador'}</h3>
              <button onClick={() => setIsModalOpen(false)} className="p-3 text-slate-400 hover:text-slate-600 transition-all"><Icons.Delete /></button>
            </div>
            <form onSubmit={saveDriver} className="p-10 space-y-8">
              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Nome Completo</label>
                  <input type="text" required value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} className="w-full p-4 bg-slate-100 border-none rounded-2xl outline-none font-bold text-sm" placeholder="Ex: Roberto Carlos" />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Celular / Whats</label>
                  <input type="text" required value={formData.phone} onChange={e => setFormData({ ...formData, phone: e.target.value })} className="w-full p-4 bg-slate-100 border-none rounded-2xl outline-none font-bold text-sm" placeholder="(00) 00000-0000" />
                </div>
                <div className="space-y-1 col-span-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Email <span className="text-blue-500 font-bold">(Obrigatório para login no App)</span></label>
                  <input type="email" value={formData.email} onChange={e => setFormData({ ...formData, email: e.target.value })} className="w-full p-4 bg-slate-100 border-none rounded-2xl outline-none font-bold text-sm" placeholder="moto@exemplo.com" />
                </div>
              </div>
              <div className="pt-6 border-t border-slate-100">
                <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-6">Informações do Veículo</h4>
                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Tipo de Veículo</label>
                    <select value={formData.type} onChange={e => setFormData({ ...formData, type: e.target.value as any })} className="w-full p-4 bg-slate-100 border-none rounded-2xl outline-none font-bold text-sm">
                      <option value="Moto">Moto</option>
                      <option value="Carro">Carro</option>
                      <option value="Bicicleta">Bicicleta</option>
                    </select>
                  </div>
                  <div className={`space-y-1 ${formData.type === 'Bicicleta' ? 'opacity-30 pointer-events-none' : ''}`}>
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Identificação / Placa</label>
                    <input
                      type="text"
                      value={formData.type === 'Bicicleta' ? 'N/A' : formData.plate}
                      onChange={e => setFormData({ ...formData, plate: e.target.value.toUpperCase() })}
                      className="w-full p-4 bg-slate-100 border-none rounded-2xl outline-none font-bold text-sm font-mono uppercase"
                      placeholder={formData.type === 'Bicicleta' ? 'N/A' : 'ABC-1234'}
                      disabled={formData.type === 'Bicicleta'}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px) font-black text-slate-400 uppercase tracking-widest ml-1">Modelo / Cor</label>
                    <input type="text" value={formData.model} onChange={e => setFormData({ ...formData, model: e.target.value })} className="w-full p-4 bg-slate-100 border-none rounded-2xl outline-none font-bold text-sm" placeholder="Ex: CB 500 / Azul" />
                  </div>
                </div>
              </div>
              <button type="submit" className="w-full py-5 bg-blue-600 text-white rounded-2xl font-black uppercase text-xs tracking-widest shadow-xl shadow-blue-100 hover:bg-blue-700 transition-all">Confirmar Registro</button>
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

  const [activeTab, setActiveTab] = useState<'PENDING' | 'HISTORY' | 'CHAT' | 'FROTA'>('PENDING');
  const [historyOrders, setHistoryOrders] = useState<Order[]>([]);
  const [historyStartDate, setHistoryStartDate] = useState(getLocalIsoDate());
  const [historyEndDate, setHistoryEndDate] = useState(getLocalIsoDate());
  const [historyDriverId, setHistoryDriverId] = useState<string>('TODOS');
  const [printingHistoryOrder, setPrintingHistoryOrder] = useState<Order | null>(null);

  // Chat States
  const [selectedDriver, setSelectedDriver] = useState<DeliveryDriver | null>(null);
  const [unreadDrivers, setUnreadDrivers] = useState<Set<string>>(chatUnreadManager.getUnreads());
  const [messages, setMessages] = useState<any[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const chatEndRef = React.useRef<HTMLDivElement>(null);

  useEffect(() => {
    refreshData();
    const session = db.getCurrentSession();
    if (session) setCurrentUser(session.user);

    const interval = setInterval(refreshData, 5000);

    socket.on('new_message', (msg: any) => {
      if (selectedDriver && msg.driverId === selectedDriver.id) {
        setMessages(prev => [...prev, msg]);
        chatUnreadManager.removeUnread(msg.driverId);
      }
    });

    const unsubscribe = chatUnreadManager.subscribe(setUnreadDrivers);

    socket.on('drivers_updated', refreshData);
    socket.on('order_auto_rejected_global', refreshData);

    return () => {
      clearInterval(interval);
      socket.off('new_message');
      socket.off('drivers_updated');
      socket.off('order_auto_rejected_global');
      unsubscribe();
    };
  }, [selectedDriver]);

  useEffect(() => {
    // Entrar em todas as salas de chat para receber notificações globais
    drivers.forEach(d => {
      socket.emit('join_chat', d.id);
    });
  }, [drivers]);

  useEffect(() => {
    if (selectedDriver) {
      loadChatHistory(selectedDriver.id);
      chatUnreadManager.removeUnread(selectedDriver.id);
    }
  }, [selectedDriver]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const loadChatHistory = async (driverId: string) => {
    const history = await db.getChatHistory(driverId);
    setMessages(history);
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !selectedDriver || !currentUser) return;

    const msgData = {
      driverId: selectedDriver.id,
      content: newMessage,
      senderName: 'Logística',
      isFromDriver: false
    };

    try {
      const savedMsg = await db.sendChatMessage(msgData);
      socket.emit('send_message', savedMsg);
      setNewMessage('');
    } catch (e) {
      console.error("Erro ao enviar mensagem:", e);
    }
  };

  const refreshData = async () => {
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
      [OrderStatus.READY, OrderStatus.OUT_FOR_DELIVERY, OrderStatus.DELIVERED].includes(o.status)
    ).sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
    setHistoryOrders(allOrders.filter(o => o.type === SaleType.OWN_DELIVERY && o.status === OrderStatus.DELIVERED));
  };

  const assignDriver = async (orderId: string, driverId: string) => {
    if (!currentUser) return;
    // O status continua Ready (Pronto), apenas atribuímos o motorista para que ele possa aceitar/recusar no APP
    await db.updateOrderStatus(orderId, OrderStatus.READY, currentUser, driverId);
    refreshData();
  };

  const updateDeliveryStatus = async (orderId: string, status: OrderStatus) => {
    if (!currentUser) return;
    await db.updateOrderStatus(orderId, status, currentUser);
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
    <div className="flex flex-col h-full gap-6">
      <BlinkCSS />
      <div className="flex items-center gap-4 bg-white p-2 rounded-3xl w-max shadow-sm border border-slate-100 flex-shrink-0">
        <button
          onClick={() => setActiveTab('PENDING')}
          className={`px-6 py-3 rounded-2xl text-[11px] font-black uppercase tracking-widest transition-all ${activeTab === 'PENDING' ? 'bg-slate-900 text-white shadow-xl' : 'text-slate-400 hover:bg-slate-50'}`}
        >
          Entregas
        </button>
        <button
          onClick={() => setActiveTab('CHAT')}
          className={`px-6 py-3 rounded-2xl text-[11px] font-black uppercase tracking-widest transition-all ${activeTab === 'CHAT' ? 'bg-slate-900 text-white shadow-xl' : 'text-slate-400 hover:bg-slate-50'} ${unreadDrivers.size > 0 && activeTab !== 'CHAT' ? 'animate-blink bg-amber-100 !text-amber-600' : ''}`}
        >
          Chat
        </button>
        <button
          onClick={() => setActiveTab('HISTORY')}
          className={`px-6 py-3 rounded-2xl text-[11px] font-black uppercase tracking-widest transition-all ${activeTab === 'HISTORY' ? 'bg-slate-900 text-white shadow-xl' : 'text-slate-400 hover:bg-slate-50'}`}
        >
          Histórico
        </button>
        <button
          onClick={() => setActiveTab('FROTA')}
          className={`px-6 py-3 rounded-2xl text-[11px] font-black uppercase tracking-widest transition-all ${activeTab === 'FROTA' ? 'bg-slate-900 text-white shadow-xl' : 'text-slate-400 hover:bg-slate-50'}`}
        >
          Frota
        </button>
      </div>

      {activeTab === 'PENDING' ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6 overflow-y-auto pb-8">
          {readyOrders.length > 0 ? readyOrders.map(order => (
            <div key={order.id} className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 flex flex-col gap-4 group hover:shadow-xl transition-all h-max">
              <div className="flex justify-between items-start">
                <div>
                  <h4 className="font-black text-slate-800 uppercase text-lg">{order.id.split('-')[1] || order.id}</h4>
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">{order.clientName}</p>
                </div>
                <div className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase text-white shadow-sm ${order.status === OrderStatus.READY ? 'bg-emerald-500' :
                  order.status === OrderStatus.OUT_FOR_DELIVERY ? 'bg-blue-600' : 'bg-slate-900'
                  }`}>
                  {OrderStatusLabels[order.status]}
                </div>
              </div>

              <div className="bg-slate-50 p-4 rounded-2xl flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <Icons.Logistics />
                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Destino:</p>
                </div>
                <p className="text-xs font-bold text-slate-700 leading-tight">{order.clientAddress || 'Endereço não informado'}</p>
              </div>

              <div className="flex justify-between items-center text-sm font-black text-slate-900 border-t border-slate-50 pt-3">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-slate-400 uppercase">Total:</span>
                  <span>R$ {order.total.toFixed(2)}</span>
                </div>
                <button
                  onClick={() => setPrintingOrder(order)}
                  className="p-2 text-slate-300 hover:text-blue-500 hover:bg-blue-50 rounded-xl transition-all"
                  title="Imprimir Cupom de Entrega"
                >
                  <Icons.Print />
                </button>
              </div>

              {order.status === OrderStatus.READY && !order.driverId ? (
                <div className="mt-4 space-y-3">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Vincular Entregador:</p>
                  <div className="flex flex-col gap-2 max-h-40 overflow-y-auto pr-1">
                    {drivers.length > 0 ? drivers.map(driver => (
                      <button
                        key={driver.id}
                        onClick={() => assignDriver(order.id, driver.id)}
                        className="flex items-center gap-3 p-3 bg-white border border-slate-200 rounded-2xl text-left hover:border-blue-500 hover:bg-blue-50 transition-all group/btn"
                      >
                        <div className="w-8 h-8 bg-slate-900 rounded-lg flex items-center justify-center text-white text-[10px] font-black">{driver.name.charAt(0)}</div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[11px] font-black text-slate-800 truncate">{driver.name}</p>
                          <p className="text-[9px] text-slate-400 uppercase font-bold">{driver.vehicle.model}</p>
                        </div>
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-slate-200 group-hover/btn:text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M9 5l7 7-7 7" /></svg>
                      </button>
                    )) : (
                      <p className="text-[10px] text-slate-400 font-bold text-center italic py-2">Nenhum entregador online.</p>
                    )}
                  </div>
                </div>
              ) : (order.status === OrderStatus.OUT_FOR_DELIVERY || (order.status === OrderStatus.READY && order.driverId)) ? (
                <div className="mt-4 space-y-4">
                  <div className="flex items-center gap-3 p-4 bg-blue-50 border border-blue-100 rounded-2xl">
                    <div className="w-10 h-10 bg-blue-600 rounded-full flex items-center justify-center text-white font-black uppercase shadow-md">{getDriverName(order.driverId).charAt(0)}</div>
                    <div className="flex-1">
                      <p className="text-xs font-black text-blue-900 truncate">Com: {getDriverName(order.driverId)}</p>
                      <p className="text-[9px] text-blue-400 font-black uppercase mt-0.5">Veículo: {drivers.find(d => d.id === order.driverId)?.vehiclePlate || 'N/A'}</p>
                    </div>
                  </div>
                  {order.status === OrderStatus.READY && order.driverId ? (
                    <div className="mt-4 space-y-3">
                      <CheckoutTimer assignedAt={order.assignedAt!} timeoutMinutes={businessSettings?.orderTimeoutMinutes || 5} />
                      <div className="p-3 bg-amber-50 border border-amber-100 rounded-xl text-center">
                        <p className="text-[9px] font-black text-amber-600 uppercase tracking-widest">Aguardando aceite do entregador no APP...</p>
                      </div>
                    </div>
                  ) : (
                    <div className="p-3 bg-blue-100 border border-blue-200 rounded-xl text-center">
                      <p className="text-[9px] font-black text-blue-800 uppercase tracking-widest">Entregador em Rota...</p>
                    </div>
                  )}
                </div>
              ) : (
                <div className="mt-4 p-4 bg-emerald-50 border border-emerald-100 rounded-2xl text-center">
                  <p className="text-[10px] font-black text-emerald-700 uppercase tracking-widest">Entrega Finalizada</p>
                  <p className="text-[9px] text-emerald-400 font-bold uppercase mt-1">Por: {getDriverName(order.driverId)}</p>
                </div>
              )}
            </div>
          )) : (
            <div className="col-span-full py-20 text-center bg-white rounded-3xl border-2 border-dashed border-slate-100">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 mx-auto text-slate-200 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              <p className="text-slate-400 font-bold uppercase tracking-widest text-xs">Sem entregas pendentes no momento...</p>
            </div>
          )}
        </div>
      ) : activeTab === 'CHAT' ? (
        <div className="flex-1 flex bg-white rounded-[2rem] shadow-sm border border-slate-100 overflow-hidden mb-8 animate-in fade-in duration-300 h-full">
          {/* Sidebar de Motoristas */}
          <div className="w-80 border-r border-slate-100 flex flex-col bg-slate-50/30">
            <div className="p-6 border-b border-slate-100">
              <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest">Entregadores ({drivers.length})</h3>
            </div>
            <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-2 custom-scrollbar">
              {drivers.map(driver => (
                <button
                  key={driver.id}
                  onClick={() => setSelectedDriver(driver)}
                  className={`flex items-center gap-3 p-4 rounded-3xl transition-all ${selectedDriver?.id === driver.id ? 'bg-white shadow-md border border-slate-100 scale-[1.02]' : 'hover:bg-white/50'} ${unreadDrivers.has(driver.id) ? 'animate-blink border-amber-200 bg-amber-50/50' : ''}`}
                >
                  <div className={`w-10 h-10 rounded-2xl flex items-center justify-center text-white font-black uppercase text-sm ${selectedDriver?.id === driver.id ? 'bg-blue-600 shadow-lg shadow-blue-500/20' : 'bg-slate-300'}`}>
                    {driver.name.charAt(0)}
                  </div>
                  <div className="flex-1 text-left min-w-0">
                    <p className="text-sm font-black text-slate-800 truncate">{driver.name}</p>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                      <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest whitespace-nowrap">Conectado / {driver.vehiclePlate}</span>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Área de Chat */}
          <div className="flex-1 flex flex-col bg-white">
            {selectedDriver ? (
              <>
                <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/10">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-blue-600 rounded-2xl flex items-center justify-center text-white font-black uppercase text-sm shadow-xl shadow-blue-500/10">
                      {selectedDriver.name.charAt(0)}
                    </div>
                    <div>
                      <h4 className="text-sm font-black text-slate-800">{selectedDriver.name}</h4>
                      <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Conversa Privada</p>
                    </div>
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto p-8 flex flex-col gap-4 custom-scrollbar bg-slate-50/20">
                  {messages.length === 0 && (
                    <div className="flex flex-col items-center justify-center h-full opacity-20 py-20">
                      <Icons.Table className="w-16 h-16 mb-4" />
                      <p className="text-xs font-black uppercase tracking-widest">Nenhuma mensagem neste chat</p>
                    </div>
                  )}
                  {messages.map((msg, i) => (
                    <div key={msg.id || i} className={`flex ${msg.isFromDriver ? 'justify-start' : 'justify-end'}`}>
                      <div className={`max-w-[70%] p-5 rounded-[2rem] shadow-sm text-sm ${msg.isFromDriver ? 'bg-white border border-slate-100 text-slate-800 rounded-tl-none' : 'bg-slate-900 text-white rounded-tr-none'}`}>
                        <p className="font-bold leading-relaxed">{msg.content}</p>
                        <span className={`text-[9px] uppercase font-black tracking-widest opacity-50 block mt-2 ${msg.isFromDriver ? 'text-left' : 'text-right'}`}>
                          {new Date(msg.timestamp).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                    </div>
                  ))}
                  <div ref={chatEndRef} />
                </div>

                <form onSubmit={handleSendMessage} className="p-6 bg-white border-t border-slate-100 flex gap-4">
                  <input
                    type="text"
                    value={newMessage}
                    onChange={e => setNewMessage(e.target.value)}
                    placeholder={`Mensagem para ${selectedDriver.name}...`}
                    className="flex-1 bg-slate-50 border-none rounded-2xl px-6 text-sm font-bold focus:ring-4 focus:ring-blue-500/10 transition-all outline-none"
                  />
                  <button type="submit" className="px-8 bg-blue-600 text-white rounded-2xl font-black uppercase text-xs tracking-widest shadow-xl shadow-blue-500/20 active:scale-95 transition-all">
                    Enviar
                  </button>
                </form>
              </>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-slate-300 p-12 text-center">
                <div className="w-24 h-24 bg-slate-50 rounded-full flex items-center justify-center mb-6">
                  <Icons.CRM className="w-12 h-12 text-slate-200" />
                </div>
                <h3 className="text-lg font-black text-slate-800 uppercase tracking-tighter mb-2">Central de Mensagens</h3>
                <p className="text-xs font-bold text-slate-400 max-w-xs leading-relaxed uppercase">Selecione um entregador ao lado para iniciar ou retomar uma conversa em tempo real.</p>
              </div>
            )}
          </div>
        </div>
      ) : activeTab === 'FROTA' ? (
        <FleetManagement refreshLogistics={refreshData} />
      ) : (
        <div className="flex flex-col gap-6 h-full overflow-hidden">
          <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 flex gap-4 items-end flex-wrap">
            <div className="space-y-2 flex-1 min-w-[200px] relative">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Data Início</label>
              <input type="date" value={historyStartDate} onChange={e => setHistoryStartDate(e.target.value)} className="w-full p-4 bg-slate-50 border-none rounded-2xl font-bold text-sm" />
            </div>
            <div className="space-y-2 flex-1 min-w-[200px] relative">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Data Fim</label>
              <input type="date" value={historyEndDate} onChange={e => setHistoryEndDate(e.target.value)} className="w-full p-4 bg-slate-50 border-none rounded-2xl font-bold text-sm" />
            </div>
            <div className="space-y-2 flex-1 min-w-[200px] relative">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Entregador</label>
              <select value={historyDriverId} onChange={e => setHistoryDriverId(e.target.value)} className="w-full p-4 bg-slate-50 border-none rounded-2xl font-bold text-sm">
                <option value="TODOS">TODOS OS ENTREGADORES</option>
                {drivers.map(d => (
                  <option key={d.id} value={d.id}>{d.name} ({d.vehicle.plate})</option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6 pb-8">
            {historyOrders.filter(o => {
              const orderDate = o.createdAt.split('T')[0];
              const inDate = orderDate >= historyStartDate && orderDate <= historyEndDate;
              const inDriver = historyDriverId === 'TODOS' || o.driverId === historyDriverId;
              return inDate && inDriver;
            }).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map(order => (
              <div key={order.id} className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 flex flex-col gap-4 group hover:shadow-xl transition-all h-max">
                <div className="flex justify-between items-start">
                  <div>
                    <h4 className="font-black text-slate-800 uppercase text-lg">{order.id.split('-')[1] || order.id}</h4>
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">{order.clientName}</p>
                    <p className="text-[10px] text-slate-400 font-bold uppercase mt-1">Data: {new Date(order.createdAt).toLocaleDateString('pt-BR')}</p>
                  </div>
                  <div className="px-3 py-1.5 rounded-xl text-[10px] font-black uppercase text-white shadow-sm bg-emerald-500">
                    FINALIZADA
                  </div>
                </div>

                <div className="bg-slate-50 p-4 rounded-2xl flex flex-col gap-2">
                  <div className="flex items-center gap-2">
                    <Icons.Logistics />
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Entregue por:</p>
                  </div>
                  <p className="text-xs font-bold text-slate-700 leading-tight">{getDriverName(order.driverId)}</p>
                </div>

                <div className="flex justify-between items-center text-sm font-black text-slate-900 border-t border-slate-50 pt-3">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-slate-400 uppercase">Total:</span>
                    <span>R$ {order.total.toFixed(2)}</span>
                  </div>
                  <button
                    onClick={() => setPrintingHistoryOrder(order)}
                    className="p-2 text-slate-300 hover:text-blue-500 hover:bg-blue-50 rounded-xl transition-all"
                    title="Imprimir Cópia de Comprovante"
                  >
                    <Icons.Print />
                  </button>
                </div>
              </div>
            ))}
            {historyOrders.filter(o => {
              const orderDate = o.createdAt.split('T')[0];
              const inDate = orderDate >= historyStartDate && orderDate <= historyEndDate;
              const inDriver = historyDriverId === 'TODOS' || o.driverId === historyDriverId;
              return inDate && inDriver;
            }).length === 0 && (
                <div className="col-span-full py-20 text-center bg-white rounded-3xl border-2 border-dashed border-slate-100 mt-2">
                  <p className="text-slate-400 font-bold uppercase tracking-widest text-xs">Nenhum histórico encontrado para os filtros.</p>
                </div>
              )}
          </div>
        </div>
      )
      }

      {/* CUPOM DE ENTREGA AGRUPADO */}
      {
        printingOrder && businessSettings && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-md">
            <div className="relative w-full max-w-[80mm] bg-white p-8 border border-dashed shadow-2xl font-receipt text-[11px] text-black print-container is-receipt animate-in zoom-in duration-200">
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

              <div className="flex gap-2 no-print">
                <button onClick={() => window.print()} className="flex-1 bg-slate-900 text-white py-4 rounded-2xl font-black uppercase text-[10px] shadow-xl">Imprimir</button>
                <button onClick={() => setPrintingOrder(null)} className="flex-1 bg-slate-100 text-slate-600 py-4 rounded-2xl font-black uppercase text-[10px]">Fechar</button>
              </div>
            </div>
          </div>
        )
      }

      {/* CUPOM DE HISTÓRICO RESUMIDO */}
      {
        printingHistoryOrder && businessSettings && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-md">
            <div className="relative w-full max-w-[80mm] bg-white p-8 border border-dashed shadow-2xl font-receipt text-[11px] text-black print-container is-receipt animate-in zoom-in duration-200">
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
                <p>MÉTODO: {printingHistoryOrder.paymentMethod || 'DINHEIRO'}</p>
                <p className="font-bold border-t border-dashed mt-2 pt-1 uppercase">ENTREGADOR: {getDriverName(printingHistoryOrder.driverId)}</p>
              </div>

              <div className="flex justify-between items-center py-1">
                <span className="text-[9px] uppercase font-bold">TAXA ENTREGA:</span>
                <span className="font-bold">R$ {(printingHistoryOrder.deliveryFee || 0).toFixed(2)}</span>
              </div>

              <div className="flex justify-between items-end border-t border-dashed pt-4 mb-6">
                <span className="font-black text-[9px] uppercase tracking-widest">TOTAL:</span>
                <span className="text-2xl font-black">R$ {printingHistoryOrder.total.toFixed(2)}</span>
              </div>

              <div className="flex gap-2 no-print">
                <button onClick={() => window.print()} className="flex-1 bg-slate-900 text-white py-4 rounded-2xl font-black uppercase text-[10px] shadow-xl">Imprimir</button>
                <button onClick={() => setPrintingHistoryOrder(null)} className="flex-1 bg-slate-100 text-slate-600 py-4 rounded-2xl font-black uppercase text-[10px]">Fechar</button>
              </div>
            </div>
          </div>
        )
      }
    </div >
  );
};

export default Logistics;
