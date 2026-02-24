
import React, { useState, useEffect } from 'react';
import { db, BusinessSettings } from '../services/db';
import { User, Waiter, DeliveryDriver } from '../types';
import { Icons } from '../constants';
import CustomAlert from '../components/CustomAlert';
import AuditLogs from './AuditLogs';

// Sub-componente para Gestão de Garçons
const WaiterManagement: React.FC = () => {
    const [waiters, setWaiters] = useState<Waiter[]>([]);
    const [formData, setFormData] = useState({ name: '', phone: '' });
    const [alertConfig, setAlertConfig] = useState<{ isOpen: boolean, title: string, message: string, type: 'SUCCESS' | 'ERROR' | 'DANGER', onConfirm?: () => void }>({
        isOpen: false, title: '', message: '', type: 'SUCCESS'
    });

    const refresh = async () => setWaiters(await db.getWaiters());
    useEffect(() => { refresh(); }, []);

    const handleAdd = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!formData.name) return;
        await db.saveWaiter({ id: `wa-${Date.now()}`, ...formData });
        setFormData({ name: '', phone: '' });
        refresh();
    };

    const deleteWaiter = async (id: string) => {
        setAlertConfig({
            isOpen: true,
            title: 'EXCLUIR GARÇOM',
            message: 'Tem certeza que deseja remover este garçom da equipe?',
            type: 'DANGER',
            onConfirm: async () => {
                await db.deleteWaiter(id);
                refresh();
                setAlertConfig(prev => ({ ...prev, isOpen: false }));
            }
        });
    };

    return (
        <div className="space-y-6">
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
                    <h3 className="text-xl font-black text-slate-800 uppercase tracking-tighter">Cadastro de Garçons</h3>
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Gerencie a equipe de atendimento do salão</p>
                </div>
            </div>
            <form onSubmit={handleAdd} className="flex gap-4 p-6 bg-slate-50 rounded-[2rem] border border-slate-100">
                <input type="text" placeholder="Nome Completo" value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} className="flex-1 p-4 bg-white border-none rounded-2xl shadow-sm font-bold text-sm" />
                <input type="text" placeholder="Telefone" value={formData.phone} onChange={e => setFormData({ ...formData, phone: e.target.value })} className="w-48 p-4 bg-white border-none rounded-2xl shadow-sm font-bold text-sm" />
                <button type="submit" className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-4 rounded-2xl font-black uppercase text-[10px] tracking-widest shadow-lg shadow-blue-100 transition-all">Cadastrar</button>
            </form>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {waiters.map(w => (
                    <div key={w.id} className="bg-white p-5 rounded-[2rem] border border-slate-100 flex justify-between items-center group hover:shadow-xl transition-all">
                        <div className="flex items-center gap-4">
                            <div className="w-10 h-10 bg-slate-100 rounded-xl flex items-center justify-center text-slate-400 font-black uppercase text-xs">{w.name.substring(0, 2)}</div>
                            <div>
                                <p className="font-black text-slate-800 uppercase text-xs tracking-tight">{w.name}</p>
                                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">{w.phone}</p>
                            </div>
                        </div>
                        <button onClick={() => deleteWaiter(w.id)} className="p-2 text-slate-200 hover:text-red-500 transition-all">
                            <Icons.Delete />
                        </button>
                    </div>
                ))}
            </div>
        </div>
    );
};

// Sub-componente para Gestão de Usuários
const UserManagementInternal: React.FC = () => {
    const [users, setUsers] = useState<User[]>([]);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingUser, setEditingUser] = useState<User | null>(null);
    const [formData, setFormData] = useState({ name: '', email: '', password: '', permissions: [] as string[] });

    const availableModules = [
        { id: 'dashboard', label: 'Dashboard' },
        { id: 'pos', label: 'PDV / Vendas' },
        { id: 'sales-monitor', label: 'Monitor de Vendas' },
        { id: 'tables', label: 'Gestão de Mesas' },
        { id: 'kitchen', label: 'Cozinha' },
        { id: 'crm', label: 'Clientes (CRM)' },
        { id: 'inventory', label: 'Estoque / Cardápio' },
        { id: 'logistics', label: 'Logística' },
        { id: 'driver', label: 'Entregador' },
        { id: 'qrcodes', label: 'QR Codes das Mesas' },
        { id: 'reports', label: 'Relatórios' },
        { id: 'settings', label: 'Configurações' }
    ];

    const refresh = async () => setUsers(await db.getUsers());
    useEffect(() => { refresh(); }, []);

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        const userData: User = {
            id: editingUser?.id || `user-${Date.now()}`,
            ...formData,
            createdAt: editingUser?.createdAt || new Date().toISOString()
        };
        await db.saveUser(userData);
        setIsModalOpen(false);
        refresh();
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <h3 className="text-xl font-black text-slate-800 uppercase tracking-tighter">Controle de Acesso (ACL)</h3>
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Defina permissões e usuários do sistema</p>
                </div>
                <button onClick={() => { setEditingUser(null); setFormData({ name: '', email: '', password: '', permissions: ['dashboard'] }); setIsModalOpen(true); }} className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-lg shadow-blue-100 transition-all">+ Novo Usuário</button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {users.map(u => (
                    <div key={u.id} className="bg-white p-6 rounded-[2rem] border border-slate-100 flex justify-between items-center group hover:shadow-xl transition-all">
                        <div>
                            <p className="font-black text-slate-800 uppercase text-xs">{u.name}</p>
                            <p className="text-[9px] text-slate-400 font-black uppercase tracking-widest mt-1">{u.permissions.join(' • ')}</p>
                        </div>
                        <button onClick={() => {
                            setEditingUser(u);
                            setFormData({ name: u.name, email: u.email, password: u.password, permissions: u.permissions });
                            setIsModalOpen(true);
                        }} className="p-3 bg-slate-50 text-blue-600 rounded-xl hover:bg-blue-600 hover:text-white transition-all">
                            <Icons.Edit />
                        </button>
                    </div>
                ))}
            </div>

            {isModalOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
                    <div className="bg-white rounded-[3rem] shadow-2xl p-10 w-full max-w-lg border border-white/20 animate-in zoom-in duration-200">
                        <h4 className="text-2xl font-black text-slate-800 uppercase tracking-tighter mb-8">{editingUser ? 'Editar' : 'Novo'} Usuário</h4>
                        <form onSubmit={handleSave} className="space-y-6">
                            <input type="text" placeholder="Nome" value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} className="w-full p-4 bg-slate-100 border-none rounded-2xl outline-none font-bold text-sm" />
                            <input type="email" placeholder="E-mail" value={formData.email} onChange={e => setFormData({ ...formData, email: e.target.value })} className="w-full p-4 bg-slate-100 border-none rounded-2xl outline-none font-bold text-sm" />
                            <input type="password" placeholder="Senha" value={formData.password} onChange={e => setFormData({ ...formData, password: e.target.value })} className="w-full p-4 bg-slate-100 border-none rounded-2xl outline-none font-bold text-sm" />

                            <div className="pt-6 border-t border-slate-100">
                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">Módulos Permitidos:</p>
                                <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto pr-2 custom-scrollbar">
                                    {availableModules.map(m => (
                                        <label key={m.id} className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl cursor-pointer hover:bg-slate-100 transition-all border border-transparent has-[:checked]:border-blue-100 has-[:checked]:bg-blue-50/50">
                                            <input
                                                type="checkbox"
                                                className="w-4 h-4 rounded-lg border-none bg-white text-blue-600"
                                                checked={formData.permissions.includes(m.id)}
                                                onChange={() => {
                                                    const next = formData.permissions.includes(m.id)
                                                        ? formData.permissions.filter(p => p !== m.id)
                                                        : [...formData.permissions, m.id];
                                                    setFormData({ ...formData, permissions: next });
                                                }}
                                            />
                                            <span className="text-[10px] font-black text-slate-600 uppercase tracking-tight">{m.label}</span>
                                        </label>
                                    ))}
                                </div>
                            </div>

                            <div className="flex gap-4 pt-6">
                                <button type="button" onClick={() => setIsModalOpen(false)} className="flex-1 py-4 font-black uppercase text-[10px] tracking-widest text-slate-400 hover:bg-slate-50 rounded-2xl">Cancelar</button>
                                <button type="submit" className="flex-1 py-4 bg-blue-600 text-white rounded-2xl font-black uppercase text-[10px] tracking-widest shadow-xl shadow-blue-100">Salvar Alterações</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

// Sub-componente para Gestão da Frota de Entregadores (Movido da Logística)
const FleetManagement: React.FC = () => {
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
                plate: driver.vehicle.plate === 'N/A' ? '' : driver.vehicle.plate,
                model: driver.vehicle.model, brand: driver.vehicle.brand, type: driver.vehicle.type
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
            vehicle: {
                plate: formData.type === 'Bicicleta' ? (formData.plate || 'N/A') : formData.plate,
                model: formData.model, brand: formData.brand, type: formData.type
            },
            status: editingDriver?.status || 'AVAILABLE'
        };
        await db.saveDriver(driver);
        refresh();
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
                setAlertConfig(prev => ({ ...prev, isOpen: false }));
            }
        });
    };

    return (
        <div className="space-y-6">
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
                    <h3 className="text-xl font-black text-slate-800 uppercase tracking-tighter">Gestão da Frota</h3>
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Base de entregadores cadastrados</p>
                </div>
                <button onClick={() => openModal()} className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-lg shadow-blue-100 transition-all">+ Novo Entregador</button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {drivers.map(driver => (
                    <div key={driver.id} className="bg-white p-6 rounded-[2rem] border border-slate-100 group hover:shadow-xl transition-all relative overflow-hidden">
                        <div className="flex items-center gap-4 mb-4">
                            <div className="w-12 h-12 bg-slate-900 text-white rounded-2xl flex items-center justify-center font-black uppercase tracking-widest text-sm">{driver.name.substring(0, 2)}</div>
                            <div className="flex-1 min-w-0">
                                <p className="font-black text-slate-800 uppercase text-xs truncate">{driver.name}</p>
                                <p className="text-[9px] text-slate-400 font-bold uppercase tracking-widest">{driver.vehicle.brand} {driver.vehicle.model}</p>
                            </div>
                        </div>
                        <div className="flex justify-between items-center pt-4 border-t border-slate-50">
                            <div className="flex flex-col">
                                <span className="text-[8px] font-black text-slate-300 uppercase tracking-[0.2em] mb-1">Identificação / Placa</span>
                                <span className="font-mono text-[10px] font-black text-slate-600">{driver.vehicle.plate || 'N/A'}</span>
                            </div>
                            <div className="flex gap-1">
                                <button onClick={() => openModal(driver)} className="p-2 text-slate-200 hover:text-blue-500 transition-all"><Icons.Edit /></button>
                                <button onClick={() => deleteDriver(driver.id)} className="p-2 text-slate-200 hover:text-red-500 transition-all"><Icons.Delete /></button>
                            </div>
                        </div>
                    </div>
                ))}
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
                                <div className="grid grid-cols-4 gap-4">
                                    <div className="space-y-1">
                                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Tipo</label>
                                        <select value={formData.type} onChange={e => setFormData({ ...formData, type: e.target.value as any })} className="w-full p-4 bg-slate-100 border-none rounded-2xl outline-none font-bold text-sm">
                                            <option value="Moto">Moto</option>
                                            <option value="Carro">Carro</option>
                                            <option value="Bicicleta">Bicicleta</option>
                                        </select>
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Placa</label>
                                        <input type="text" value={formData.plate} onChange={e => setFormData({ ...formData, plate: e.target.value.toUpperCase() })} className="w-full p-4 bg-slate-100 border-none rounded-2xl outline-none font-bold text-sm font-mono uppercase" placeholder="ABC-1234" />
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Marca</label>
                                        <input type="text" value={formData.brand} onChange={e => setFormData({ ...formData, brand: e.target.value })} className="w-full p-4 bg-slate-100 border-none rounded-2xl outline-none font-bold text-sm" placeholder="Ex: Honda" />
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Modelo</label>
                                        <input type="text" value={formData.model} onChange={e => setFormData({ ...formData, model: e.target.value })} className="w-full p-4 bg-slate-100 border-none rounded-2xl outline-none font-bold text-sm" placeholder="Ex: CB 500" />
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

// Sub-componente para Horário de Funcionamento
const OperatingHoursSettings: React.FC<{ settings: BusinessSettings, setSettings: (s: BusinessSettings) => void, onSave: (e: React.FormEvent) => void }> = ({ settings, setSettings, onSave }) => {
    let hours: any[] = [];
    try {
        hours = JSON.parse(settings.operatingHours);
    } catch { }

    const daysOfWeek = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

    // Inicializar no estado ao montar ou se mudar para vazio
    useEffect(() => {
        let currentHours: any[] = [];
        try {
            currentHours = JSON.parse(settings.operatingHours);
        } catch { }

        if (!Array.isArray(currentHours) || currentHours.length === 0) {
            const defaults = daysOfWeek.map((day, ix) => ({ dayOfWeek: ix, isOpen: true, openTime: '18:00', closeTime: '23:59' }));
            setSettings({ ...settings, operatingHours: JSON.stringify(defaults) });
        }
    }, []);

    const updateHour = (ix: number, field: string, value: any) => {
        const newHours = [...hours];
        newHours[ix] = { ...newHours[ix], [field]: value };
        setSettings({ ...settings, operatingHours: JSON.stringify(newHours) });
    };

    return (
        <form onSubmit={onSave} className="bg-white p-10 rounded-[3rem] shadow-sm border border-slate-100 max-w-4xl space-y-8 animate-in fade-in">
            <div className="flex justify-between items-start mb-10">
                <div>
                    <h3 className="text-2xl font-black text-slate-800 uppercase tracking-tighter">Horário de Funcionamento</h3>
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Defina quando sua loja recebe pedidos</p>
                </div>
            </div>

            <div className={`p-6 rounded-3xl border-2 transition-all flex items-center justify-between ${settings.isManuallyClosed ? 'bg-red-50 border-red-200' : 'bg-blue-50 border-blue-200'}`}>
                <div>
                    <h4 className={`text-lg font-black uppercase tracking-tight ${settings.isManuallyClosed ? 'text-red-800' : 'text-blue-800'}`}>
                        {settings.isManuallyClosed ? 'Loja Fechada Manualmente' : 'Controle Manual: Loja Aberta'}
                    </h4>
                    <p className={`text-[10px] font-bold uppercase tracking-widest ${settings.isManuallyClosed ? 'text-red-500' : 'text-blue-500'}`}>
                        {settings.isManuallyClosed ? 'Nenhum pedido digital será aceito até que você reabra.' : 'Seguindo a programação normal de dias e horários.'}
                    </p>
                </div>
                <button
                    type="button"
                    onClick={() => setSettings({ ...settings, isManuallyClosed: !settings.isManuallyClosed })}
                    className={`px-8 py-4 rounded-2xl font-black uppercase text-[10px] tracking-widest transition-all shadow-xl ${settings.isManuallyClosed ? 'bg-red-600 text-white hover:bg-red-700 shadow-red-200' : 'bg-blue-600 text-white hover:bg-blue-700 shadow-blue-200'}`}
                >
                    {settings.isManuallyClosed ? 'Reabrir Loja Agora' : 'Fechar Loja Temporariamente'}
                </button>
            </div>

            <div className="pt-6 border-t border-slate-100 space-y-4">
                <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">Programação Semanal</h4>
                {hours.map((config, ix) => (
                    <div key={ix} className="flex items-center gap-4 bg-slate-50 p-4 rounded-2xl border border-slate-100">
                        <div className="w-32 flex items-center gap-3">
                            <input type="checkbox" checked={config.isOpen} onChange={e => updateHour(ix, 'isOpen', e.target.checked)} className="w-5 h-5 rounded-md text-blue-600" />
                            <span className={`font-black uppercase text-sm ${config.isOpen ? 'text-slate-800' : 'text-slate-400 line-through'}`}>{daysOfWeek[config.dayOfWeek]}</span>
                        </div>
                        <div className="flex items-center gap-4 flex-1">
                            {config.isOpen ? (
                                <>
                                    <div className="flex items-center gap-2">
                                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Abre:</span>
                                        <input type="time" value={config.openTime} onChange={e => updateHour(ix, 'openTime', e.target.value)} className="p-3 bg-white border-none rounded-xl font-bold text-sm shadow-sm" />
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Fecha:</span>
                                        <input type="time" value={config.closeTime} onChange={e => updateHour(ix, 'closeTime', e.target.value)} className="p-3 bg-white border-none rounded-xl font-bold text-sm shadow-sm" />
                                    </div>
                                </>
                            ) : (
                                <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Fechado o dia todo</span>
                            )}
                        </div>
                    </div>
                ))}
            </div>

            <button type="submit" className="w-full md:w-auto bg-blue-600 text-white px-12 py-5 rounded-2xl font-black uppercase text-xs tracking-widest hover:bg-blue-700 transition-all shadow-2xl shadow-blue-100">Salvar Horários</button>
        </form>
    );
};

interface SettingsProps {
    settings: BusinessSettings;
    setSettings: (s: BusinessSettings) => void;
    onReset: () => void;
    onGoToSalesMonitor: () => void;
}

const Settings: React.FC<SettingsProps> = ({ settings, setSettings, onReset, onGoToSalesMonitor }) => {
    const [activeSubTab, setActiveSubTab] = useState<'EMPRESA' | 'HORARIOS' | 'GARCONS' | 'USUARIOS' | 'FROTA' | 'AUDITORIA' | 'AVANCADO'>('EMPRESA');
    const [isSavedAlertOpen, setIsSavedAlertOpen] = useState(false);

    const handleSaveSettings = async (e: React.FormEvent) => {
        e.preventDefault();
        await db.saveSettings(settings);
        setIsSavedAlertOpen(true);
    };

    const menuItems = [
        { id: 'EMPRESA', label: 'Empresa', icon: Icons.Dashboard },
        { id: 'HORARIOS', label: 'Horários', icon: Icons.Clock },
        { id: 'GARCONS', label: 'Garçons', icon: Icons.CRM },
        { id: 'USUARIOS', label: 'Usuários', icon: Icons.POS },
        { id: 'FROTA', label: 'Frota/Entregadores', icon: Icons.Logistics },
        { id: 'AUDITORIA', label: 'Auditoria', icon: Icons.View },
        { id: 'AVANCADO', label: 'Avançado', icon: Icons.Settings },
    ];

    return (
        <div className="flex flex-col h-full gap-8 animate-in fade-in duration-500 overflow-hidden">
            <CustomAlert
                isOpen={isSavedAlertOpen}
                title="SUCESSO"
                message="As configurações do estabelecimento foram atualizadas com sucesso."
                type="SUCCESS"
                onConfirm={() => setIsSavedAlertOpen(false)}
            />

            <div className="flex gap-4 border-b border-slate-200 shrink-0 overflow-x-auto pb-0.5 custom-scrollbar">
                {menuItems.map(item => (
                    <button
                        key={item.id}
                        onClick={() => setActiveSubTab(item.id as any)}
                        className={`pb-4 px-4 font-black uppercase text-[10px] tracking-widest transition-all whitespace-nowrap flex items-center gap-2 ${activeSubTab === item.id ? 'border-b-4 border-blue-600 text-blue-600' : 'text-slate-400 hover:text-slate-600'}`}
                    >
                        <item.icon />
                        {item.label}
                    </button>
                ))}
            </div>

            <div className="flex-1 overflow-y-auto pr-4 custom-scrollbar">
                {activeSubTab === 'EMPRESA' && (
                    <div className="bg-white p-10 rounded-[3rem] shadow-sm border border-slate-100 max-w-4xl">
                        <div className="flex justify-between items-start mb-10">
                            <div>
                                <h3 className="text-2xl font-black text-slate-800 uppercase tracking-tighter">Identidade do Negócio</h3>
                                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Aparecerá nos cupons e relatórios do sistema</p>
                            </div>
                            <button onClick={onGoToSalesMonitor} className="bg-slate-100 hover:bg-blue-50 text-blue-600 px-6 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all border border-blue-100">Configurar Monitor</button>
                        </div>
                        <form onSubmit={handleSaveSettings} className="space-y-8">
                            <div className="grid grid-cols-2 gap-8">
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Nome Fantasia</label>
                                    <input type="text" className="w-full p-4 bg-slate-50 border-none rounded-2xl focus:ring-4 focus:ring-blue-50 transition-all font-bold text-sm" value={settings.name} onChange={e => setSettings({ ...settings, name: e.target.value })} />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">CNPJ / CPF</label>
                                    <input type="text" className="w-full p-4 bg-slate-50 border-none rounded-2xl focus:ring-4 focus:ring-blue-50 transition-all font-bold text-sm" value={settings.cnpj} onChange={e => setSettings({ ...settings, cnpj: e.target.value })} />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Quantidade de Mesas</label>
                                    <input type="number" className="w-full p-4 bg-slate-50 border-none rounded-2xl focus:ring-4 focus:ring-blue-50 transition-all font-bold text-sm" value={settings.tableCount} onChange={e => setSettings({ ...settings, tableCount: parseInt(e.target.value) || 0 })} />
                                </div>
                                <div className="space-y-2 col-span-2">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Endereço Completo</label>
                                    <input type="text" className="w-full p-4 bg-slate-50 border-none rounded-2xl focus:ring-4 focus:ring-blue-50 transition-all font-bold text-sm" value={settings.address} onChange={e => setSettings({ ...settings, address: e.target.value })} />
                                </div>
                            </div>

                            <div className="pt-8 border-t border-slate-100">
                                <div className="flex justify-between items-center mb-6">
                                    <div>
                                        <h4 className="text-sm font-black text-slate-800 uppercase tracking-tighter">Geolocalização & Bloqueio (Geofencing)</h4>
                                        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Restrinja pedidos do Cardápio Digital para clientes não presentes no local</p>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            if (navigator.geolocation) {
                                                navigator.geolocation.getCurrentPosition(
                                                    (position) => {
                                                        setSettings({
                                                            ...settings,
                                                            restaurantLat: position.coords.latitude,
                                                            restaurantLng: position.coords.longitude
                                                        });
                                                    },
                                                    (error) => {
                                                        alert("Erro ao obter localização: " + error.message);
                                                    }
                                                );
                                            } else {
                                                alert("Geolocalização não suportada pelo seu navegador.");
                                            }
                                        }}
                                        className="bg-slate-100 hover:bg-slate-200 text-slate-700 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all"
                                    >
                                        📍 Usar Localização Atual
                                    </button>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Latitude</label>
                                        <input type="number" step="any" className="w-full p-4 bg-slate-50 border-none rounded-2xl focus:ring-4 focus:ring-blue-50 transition-all font-bold text-sm" value={settings.restaurantLat || ''} onChange={e => setSettings({ ...settings, restaurantLat: parseFloat(e.target.value) || undefined })} placeholder="-23.5505" />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Longitude</label>
                                        <input type="number" step="any" className="w-full p-4 bg-slate-50 border-none rounded-2xl focus:ring-4 focus:ring-blue-50 transition-all font-bold text-sm" value={settings.restaurantLng || ''} onChange={e => setSettings({ ...settings, restaurantLng: parseFloat(e.target.value) || undefined })} placeholder="-46.6333" />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Raio Permitido (Metros)</label>
                                        <input type="number" className="w-full p-4 bg-slate-50 border-none rounded-2xl focus:ring-4 focus:ring-blue-50 transition-all font-bold text-sm" value={settings.geofenceRadius || 0} onChange={e => setSettings({ ...settings, geofenceRadius: parseInt(e.target.value) || 0 })} placeholder="30" />
                                    </div>
                                </div>
                            </div>
                            <button type="submit" className="w-full md:w-auto bg-blue-600 text-white px-12 py-5 rounded-2xl font-black uppercase text-xs tracking-widest hover:bg-blue-700 transition-all shadow-2xl shadow-blue-100">Salvar Dados da Empresa</button>
                        </form>
                    </div>
                )}

                {activeSubTab === 'HORARIOS' && <OperatingHoursSettings settings={settings} setSettings={setSettings} onSave={handleSaveSettings} />}
                {activeSubTab === 'GARCONS' && <WaiterManagement />}
                {activeSubTab === 'USUARIOS' && <UserManagementInternal />}
                {activeSubTab === 'FROTA' && <FleetManagement />}
                {activeSubTab === 'AUDITORIA' && <div className="bg-white p-8 rounded-[3rem] border border-slate-100"><AuditLogs /></div>}

                {activeSubTab === 'AVANCADO' && (
                    <div className="max-w-4xl space-y-8">
                        <div className="bg-white p-10 rounded-[3rem] shadow-sm border border-slate-100">
                            <h3 className="text-2xl font-black mb-2 text-red-600 uppercase tracking-tighter">Zona de Risco Crítico</h3>
                            <p className="text-xs text-slate-400 font-bold uppercase tracking-widest mb-10">Estas ações são irreversíveis e apagam dados permanentemente</p>

                            <div className="p-8 bg-red-50 rounded-3xl border border-red-100">
                                <p className="text-sm font-bold text-red-900 mb-6 uppercase tracking-tight">Reinicialização Total do Sistema:</p>
                                <p className="text-xs text-red-700/60 font-medium mb-8 leading-relaxed">A reinicialização apagará permanentemente todos os pedidos, clientes, estoque e configurações customizadas. O sistema retornará ao estado de instalação inicial.</p>
                                <button
                                    onClick={onReset}
                                    className="bg-red-600 text-white px-8 py-4 rounded-2xl font-black uppercase text-[10px] tracking-widest hover:bg-red-700 transition-all shadow-xl shadow-red-200 flex items-center gap-3"
                                >
                                    <Icons.Delete />
                                    Reiniciar Sistema (Reset de Fábrica)
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default Settings;
