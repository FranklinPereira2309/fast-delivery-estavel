import React, { useState, useEffect, useRef } from 'react';
import { DeliveryDriver, Order, OrderStatus, OrderStatusLabels, SaleType, User, Product } from '../types';
import { db, BusinessSettings } from '../services/db';
import { Icons } from '../constants';
import CustomAlert from '../components/CustomAlert';

interface EntregadorProps {
    currentUser: User | null;
}

const Entregador: React.FC<EntregadorProps> = ({ currentUser }) => {
    const [driver, setDriver] = useState<DeliveryDriver | null>(null);
    const [myOrders, setMyOrders] = useState<Order[]>([]);
    const [products, setProducts] = useState<Product[]>([]);
    const [businessSettings, setBusinessSettings] = useState<BusinessSettings | null>(null);
    const [isAlertOpen, setIsAlertOpen] = useState(false);

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

        // Filter only OUT_FOR_DELIVERY assigned to this driver
        const driverOrders = allOrders.filter(o =>
            o.type === SaleType.OWN_DELIVERY &&
            o.status === OrderStatus.OUT_FOR_DELIVERY &&
            o.driverId === currentDriver.id
        ).sort((a, b) => b.createdAt.localeCompare(a.createdAt));

        setMyOrders(driverOrders);

        // Notification logic
        if (previousOrderCount.current > -1 && driverOrders.length > previousOrderCount.current) {
            setIsAlertOpen(true);
        }
        previousOrderCount.current = driverOrders.length;
    };

    const updateDeliveryStatus = async (orderId: string, status: OrderStatus) => {
        if (!currentUser) return;
        await db.updateOrderStatus(orderId, status, currentUser);
        refreshData();
    };

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
        <div className="flex flex-col h-full gap-6">
            <CustomAlert
                isOpen={isAlertOpen}
                title="NOVA ENTREGA!"
                message="Você recebeu uma nova rota de entrega. Verifique os painéis abaixo."
                type="SUCCESS"
                onConfirm={() => setIsAlertOpen(false)}
            />

            <div className="flex justify-between items-center bg-white p-6 rounded-3xl shadow-sm border border-slate-100">
                <div>
                    <h2 className="text-2xl font-black text-slate-800 uppercase tracking-tighter">Minhas Entregas</h2>
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">Olá, {driver.name}</p>
                </div>
                <div className="flex items-center gap-2 px-4 py-2 bg-emerald-50 rounded-2xl border border-emerald-100">
                    <span className="w-2.5 h-2.5 bg-emerald-500 rounded-full animate-pulse"></span>
                    <span className="text-[10px] font-black text-emerald-700 uppercase tracking-widest">Online</span>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6 overflow-y-auto pb-8">
                {myOrders.length > 0 ? myOrders.map(order => (
                    <div key={order.id} className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 flex flex-col gap-4 group hover:shadow-xl transition-all relative overflow-hidden">
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

                        <div className="bg-slate-50 p-5 rounded-2xl flex flex-col gap-3 z-10 border border-slate-100">
                            <div className="flex items-center gap-2">
                                <Icons.Logistics />
                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Local de Destino:</p>
                            </div>
                            <p className="text-sm font-bold text-slate-700 leading-tight">{order.clientAddress || 'Endereço não informado'}</p>

                            {order.clientPhone && (
                                <div className="flex items-center gap-2 mt-2 pt-3 border-t border-slate-200">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                                    </svg>
                                    <p className="text-xs font-black text-blue-600 tracking-wider hover:underline cursor-pointer">{order.clientPhone}</p>
                                </div>
                            )}
                        </div>

                        <div className="flex justify-between items-center text-sm font-black text-slate-900 border-t border-slate-50 pt-4 z-10">
                            <div className="flex items-center gap-2">
                                <span className="text-[10px] text-slate-400 uppercase tracking-widest">Cobrança/Total:</span>
                                <span className="text-xl">R$ {order.total.toFixed(2)}</span>
                            </div>
                        </div>

                        <div className="mt-2 border-t border-slate-50 pt-4 z-10">
                            <button
                                onClick={() => updateDeliveryStatus(order.id, OrderStatus.DELIVERED)}
                                className="w-full py-5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-2xl text-[11px] font-black uppercase tracking-widest transition-all shadow-xl shadow-emerald-500/20 active:scale-95 flex items-center justify-center gap-2"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                </svg>
                                Confirmar Entrega Realizada
                            </button>
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
        </div>
    );
};

export default Entregador;
