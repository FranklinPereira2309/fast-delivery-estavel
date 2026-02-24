import React, { useState, useEffect, useRef, useMemo } from 'react';
import { DeliveryDriver, Order, OrderStatus, OrderStatusLabels, SaleType, User, Product } from '../types';
import { db, BusinessSettings } from '../services/db';
import { Icons } from '../constants';
import CustomAlert from '../components/CustomAlert';
import { useDigitalAlert } from '../hooks/useDigitalAlert';

interface EntregadorProps {
    currentUser: User | null;
}

const Entregador: React.FC<EntregadorProps> = ({ currentUser }) => {
    const { isAlerting, dismissAlert } = useDigitalAlert();
    const [driver, setDriver] = useState<DeliveryDriver | null>(null);
    const [myOrders, setMyOrders] = useState<Order[]>([]);
    const [products, setProducts] = useState<Product[]>([]);
    const [businessSettings, setBusinessSettings] = useState<BusinessSettings | null>(null);
    const [isAlertOpen, setIsAlertOpen] = useState(false);
    const [printingOrder, setPrintingOrder] = useState<Order | null>(null);

    const [activeTab, setActiveTab] = useState<'PENDING' | 'HISTORY'>('PENDING');
    const [historyOrders, setHistoryOrders] = useState<Order[]>([]);
    const [historyStartDate, setHistoryStartDate] = useState(new Date().toISOString().split('T')[0]);
    const [historyEndDate, setHistoryEndDate] = useState(new Date().toISOString().split('T')[0]);
    const [printingHistoryOrder, setPrintingHistoryOrder] = useState<Order | null>(null);

    const previousOrderCount = useRef(-1);

    useEffect(() => {
        refreshData();
        const interval = setInterval(refreshData, 3000);
        return () => clearInterval(interval);
    }, [currentUser]);

    const refreshData = async () => {
        if (!currentUser) return;

        // Find driver profile by email
        const allDrivers = await db.getDrivers();
        const currentDriver = allDrivers.find(d => d.email?.toLowerCase() === currentUser.email.toLowerCase());

        if (!currentDriver) {
            setDriver(null);
            return; // Early return if no driver profile linked
        }

        setDriver(currentDriver);

        const [allOrders, allProds, settings] = await Promise.all([
            db.getOrders(),
            db.getProducts(),
            db.getSettings()
        ]);

        setProducts(allProds);
        setBusinessSettings(settings);

        // Filter OUT_FOR_DELIVERY AND READY assigned to this driver
        const driverOrders = allOrders.filter(o =>
            o.type === SaleType.OWN_DELIVERY &&
            (o.status === OrderStatus.OUT_FOR_DELIVERY || o.status === OrderStatus.READY) &&
            o.driverId === currentDriver.id
        ).sort((a, b) => b.createdAt.localeCompare(a.createdAt));

        setMyOrders(driverOrders);

        // Filter DELIVERED assigned to this driver
        const histOrders = allOrders.filter(o =>
            o.type === SaleType.OWN_DELIVERY &&
            o.status === OrderStatus.DELIVERED &&
            o.driverId === currentDriver.id
        ).sort((a, b) => b.createdAt.localeCompare(a.createdAt));

        setHistoryOrders(histOrders);

        // Notification logic
        if (previousOrderCount.current > -1 && driverOrders.length > previousOrderCount.current) {
            setIsAlertOpen(true);
        }
        previousOrderCount.current = driverOrders.length;
    };

    const updateDeliveryStatus = async (orderId: string, status: OrderStatus, forceDriverId?: string | null) => {
        if (!currentUser) return;
        await db.updateOrderStatus(orderId, status, currentUser, forceDriverId !== undefined ? forceDriverId : currentUser.id);
        refreshData();
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

    if (!currentUser) return null;

    if (!driver) {
        return (
            <div className="flex flex-col items-center justify-center h-full text-slate-400">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-16 w-16 mb-4 opacity-20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                </svg>
                <h2 className="text-xl font-bold mt-4 text-slate-800">Perfil Não Encontrado</h2>
                <p className="mt-2 text-center max-w-sm text-sm">
                    O seu email de login (<span className="font-bold text-slate-600">{currentUser?.email}</span>) não está vinculado a nenhum Entregador na frota ativa do sistema.
                    <br /><br />
                    Solicite ao administrador que edite seu cadastro de Entregador em <span className="font-bold text-slate-600">Configurações &gt; Frota</span> e insira esse email.
                </p>
            </div>
        );
    }

    return (
        <div className={`flex flex-col h-full gap-6 rounded-[2rem] p-2 transition-all duration-300 ${isAlerting ? 'animate-pulse ring-8 ring-fuchsia-500 bg-fuchsia-50/30' : ''}`} onClick={() => { if (isAlerting) dismissAlert(); }}>
            <CustomAlert
                isOpen={isAlertOpen}
                title="NOVA ENTREGA!"
                message="Você recebeu uma nova rota de entrega. Verifique os painéis abaixo."
                type="SUCCESS"
                onConfirm={() => setIsAlertOpen(false)}
            />

            <div className="flex justify-between items-center bg-white p-4 md:p-6 rounded-3xl shadow-sm border border-slate-100 mb-2">
                <div>
                    <h2 className="text-xl md:text-2xl font-black text-slate-800 uppercase tracking-tighter">Minhas Entregas</h2>
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">Olá, {driver.name}</p>
                </div>
                <div className="flex items-center gap-2 px-4 py-2 bg-emerald-50 rounded-2xl border border-emerald-100">
                    <span className="w-2.5 h-2.5 bg-emerald-500 rounded-full animate-pulse"></span>
                    <span className="text-[10px] font-black text-emerald-700 uppercase tracking-widest">Online</span>
                </div>
            </div>

            <div className="flex items-center gap-4 bg-white p-2 rounded-3xl w-max shadow-sm border border-slate-100 flex-shrink-0">
                <button
                    onClick={() => setActiveTab('PENDING')}
                    className={`px-6 py-3 rounded-2xl text-[11px] font-black uppercase tracking-widest transition-all ${activeTab === 'PENDING' ? 'bg-slate-900 text-white shadow-xl' : 'text-slate-400 hover:bg-slate-50'}`}
                >
                    Pendentes
                </button>
                <button
                    onClick={() => setActiveTab('HISTORY')}
                    className={`px-6 py-3 rounded-2xl text-[11px] font-black uppercase tracking-widest transition-all ${activeTab === 'HISTORY' ? 'bg-slate-900 text-white shadow-xl' : 'text-slate-400 hover:bg-slate-50'}`}
                >
                    Histórico
                </button>
            </div>

            {activeTab === 'PENDING' ? (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 overflow-y-auto pb-8">
                    {myOrders.length > 0 ? myOrders.map(order => (
                        <div key={order.id} className="bg-white p-4 md:p-6 rounded-3xl shadow-sm border border-slate-100 flex flex-col gap-4 group hover:shadow-xl transition-all relative overflow-hidden">
                            <div className="absolute top-0 right-0 w-16 h-16 bg-blue-50 rounded-bl-full -z-0"></div>

                            <div className="flex justify-between items-start z-10">
                                <div>
                                    <h4 className="font-black text-slate-800 uppercase text-lg">{order.id.split('-')[1] || order.id}</h4>
                                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">{order.clientName}</p>
                                </div>
                                <div className="px-4 py-2 rounded-xl text-[10px] font-black uppercase text-white shadow-lg bg-blue-600">
                                    {OrderStatusLabels[order.status]}
                                </div>
                            </div>

                            <div className="bg-slate-50 p-4 rounded-xl flex flex-col gap-2 z-10 border border-slate-100 flex-1 overflow-y-auto min-h-0">
                                <div className="flex items-center gap-2">
                                    <Icons.Logistics />
                                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Local de Destino:</p>
                                </div>
                                <a
                                    href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(order.clientAddress || '')}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-sm font-bold text-slate-700 leading-tight hover:text-blue-600 hover:underline cursor-pointer flex items-start gap-1"
                                    title="Abrir no Google Maps"
                                >
                                    {order.clientAddress || 'Endereço não informado'}
                                    {order.clientAddress && (
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-slate-400 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                                        </svg>
                                    )}
                                </a>

                                {order.clientPhone && (
                                    <div className="flex items-center gap-2 mt-2 pt-3 border-t border-slate-200">
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                                        </svg>
                                        <p className="text-xs font-black text-blue-600 tracking-wider hover:underline cursor-pointer">{order.clientPhone}</p>
                                    </div>
                                )}
                            </div>

                            <div className="flex justify-between items-center text-sm font-black text-slate-900 border-t border-slate-50 pt-3 z-10 mt-auto">
                                <div className="flex items-center gap-2">
                                    <span className="text-[10px] text-slate-400 uppercase tracking-widest">Total:</span>
                                    <span className="text-xl">R$ {order.total.toFixed(2)}</span>
                                </div>
                                <button
                                    onClick={() => setPrintingOrder(order)}
                                    className="p-3 text-blue-500 hover:text-white hover:bg-blue-600 bg-blue-50 rounded-xl transition-all flex items-center gap-2 shadow-sm"
                                    title="Visualizar Cupom do Pedido"
                                >
                                    <Icons.Print />
                                    <span className="text-[10px] font-black uppercase hidden sm:block">Cupom</span>
                                </button>
                            </div>

                            <div className="mt-2 z-10 shrink-0">
                                {order.status === OrderStatus.READY ? (
                                    <div className="flex gap-2">
                                        <button
                                            onClick={() => updateDeliveryStatus(order.id, OrderStatus.OUT_FOR_DELIVERY, order.driverId)}
                                            className="flex-1 py-4 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all shadow-xl shadow-blue-500/20 active:scale-95 flex items-center justify-center gap-1"
                                        >
                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                            </svg>
                                            Aceitar
                                        </button>
                                        <button
                                            onClick={() => updateDeliveryStatus(order.id, OrderStatus.READY, '')}
                                            className="flex-1 py-4 bg-red-100 hover:bg-red-200 text-red-600 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all active:scale-95 flex items-center justify-center gap-1"
                                        >
                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" />
                                            </svg>
                                            Recusar
                                        </button>
                                    </div>
                                ) : (
                                    <button
                                        onClick={() => updateDeliveryStatus(order.id, OrderStatus.DELIVERED)}
                                        className="w-full py-4 bg-emerald-500 hover:bg-emerald-600 text-white rounded-2xl text-[11px] font-black uppercase tracking-widest transition-all shadow-xl shadow-emerald-500/20 active:scale-95 flex items-center justify-center gap-2"
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                        </svg>
                                        Confirmar Entrega Realizada
                                    </button>
                                )}
                            </div>
                        </div>
                    )) : (
                        <div className="col-span-full py-24 text-center bg-white rounded-[3rem] border-2 border-dashed border-slate-100 flex flex-col items-center justify-center">
                            <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center mb-6">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                            </div>
                            <p className="text-slate-400 font-bold uppercase tracking-widest text-sm">Você não possui entregas pendentes...</p>
                            <p className="text-[10px] text-slate-300 font-bold mt-2 uppercase tracking-tight">Aguarde novas atribuições da Logística</p>
                        </div>
                    )}
                </div>
            ) : (
                <div className="flex flex-col gap-6 h-full overflow-hidden">
                    <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 flex gap-4 items-end flex-wrap shrink-0">
                        <div className="space-y-2 flex-1 min-w-[200px] relative">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Data Início</label>
                            <input type="date" value={historyStartDate} onChange={e => setHistoryStartDate(e.target.value)} className="w-full p-4 bg-slate-50 border-none rounded-2xl font-bold text-sm" />
                        </div>
                        <div className="space-y-2 flex-1 min-w-[200px] relative">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Data Fim</label>
                            <input type="date" value={historyEndDate} onChange={e => setHistoryEndDate(e.target.value)} className="w-full p-4 bg-slate-50 border-none rounded-2xl font-bold text-sm" />
                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6 pb-8">
                        {historyOrders.filter(o => {
                            const orderDate = o.createdAt.split('T')[0];
                            return orderDate >= historyStartDate && orderDate <= historyEndDate;
                        }).map(order => (
                            <div key={order.id} className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 flex flex-col gap-4 group hover:shadow-xl transition-all h-max relative overflow-hidden">
                                <div className="flex justify-between items-start z-10">
                                    <div>
                                        <h4 className="font-black text-slate-800 uppercase text-lg">{order.id.split('-')[1] || order.id}</h4>
                                        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">{order.clientName}</p>
                                        <p className="text-[10px] text-slate-400 font-bold uppercase mt-1">Data: {new Date(order.createdAt).toLocaleDateString('pt-BR')}</p>
                                    </div>
                                    <div className="px-3 py-1.5 rounded-xl text-[10px] font-black uppercase text-white shadow-sm bg-emerald-500">
                                        FINALIZADA
                                    </div>
                                </div>

                                <div className="flex justify-between items-center text-sm font-black text-slate-900 border-t border-slate-50 pt-3 z-10">
                                    <div className="flex items-center gap-2">
                                        <span className="text-[10px] text-slate-400 uppercase">Total:</span>
                                        <span className="text-xl">R$ {order.total.toFixed(2)}</span>
                                    </div>
                                    <button
                                        onClick={() => setPrintingHistoryOrder(order)}
                                        className="p-3 text-emerald-500 hover:text-white hover:bg-emerald-600 bg-emerald-50 rounded-xl transition-all flex items-center gap-2 shadow-sm"
                                        title="Imprimir Cópia de Comprovante"
                                    >
                                        <Icons.Print />
                                        <span className="text-[10px] font-black uppercase hidden sm:block">Comprovante</span>
                                    </button>
                                </div>
                            </div>
                        ))}
                        {historyOrders.filter(o => {
                            const orderDate = o.createdAt.split('T')[0];
                            return orderDate >= historyStartDate && orderDate <= historyEndDate;
                        }).length === 0 && (
                                <div className="col-span-full py-20 text-center bg-white rounded-3xl border-2 border-dashed border-slate-100 mt-2">
                                    <p className="text-slate-400 font-bold uppercase tracking-widest text-xs">Nenhum histórico encontrado para o período.</p>
                                </div>
                            )}
                    </div>
                </div>
            )}

            {/* CUPOM DE ENTREGA AGRUPADO - MODAL DE VISUALIZAÇÃO */}
            {printingOrder && businessSettings && (
                <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-md">
                    <div className="relative w-full max-w-sm bg-white p-6 md:p-8 rounded-3xl shadow-2xl animate-in zoom-in duration-200">
                        <div className="text-center mb-6 border-b border-dashed border-slate-200 pb-4">
                            <h2 className="font-black text-lg md:text-xl uppercase tracking-tighter text-slate-800">{businessSettings.name}</h2>
                            <p className="text-[10px] md:text-xs font-bold mt-1 text-slate-400">RESUMO DO PEDIDO</p>
                            <p className="text-xs font-black mt-2 text-blue-600">ID: {printingOrder.id.split('-')[1] || printingOrder.id}</p>
                        </div>

                        <div className="space-y-4 mb-6">
                            <div>
                                <p className="font-black uppercase text-[10px] text-slate-400">Cliente:</p>
                                <p className="text-sm font-black text-slate-800">{printingOrder.clientName}</p>
                            </div>
                        </div>

                        <div className="border-y border-dashed border-slate-200 py-4 mb-6 max-h-[30vh] overflow-y-auto custom-scrollbar">
                            <p className="font-black uppercase text-[10px] mb-3 text-center text-slate-400">Itens do Pedido</p>
                            {groupedPrintingItems.map(([id, data]) => (
                                <div key={id} className="flex justify-between items-center font-black py-1.5 border-b border-slate-50 last:border-0">
                                    <span className="text-xs text-slate-700 w-2/3">{data.quantity}x {data.name}</span>
                                    <span className="text-xs text-slate-900">R$ {(data.quantity * data.price).toFixed(2)}</span>
                                </div>
                            ))}
                        </div>

                        <div className="flex justify-between items-end border-b border-dashed border-slate-200 pb-4 mb-6">
                            <span className="font-black text-[10px] uppercase text-slate-400">TOTAL DA CONTA:</span>
                            <span className="text-2xl font-black text-slate-900">R$ {printingOrder.total.toFixed(2)}</span>
                        </div>

                        <div className="flex gap-3">
                            <button onClick={() => setPrintingOrder(null)} className="w-full bg-slate-100 text-slate-600 py-4 rounded-2xl font-black uppercase text-xs tracking-widest hover:bg-slate-200 transition-all">Fechar Aba</button>
                        </div>
                    </div>
                </div>
            )}

            {/* CUPOM DE HISTÓRICO RESUMIDO - MODAL DE VISUALIZAÇÃO */}
            {printingHistoryOrder && businessSettings && (
                <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-md">
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
                            <p className="font-bold border-t border-dashed mt-2 pt-1 uppercase">ENTREGADOR: {driver.name}</p>
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
            )}
        </div>
    );
};

export default Entregador;
