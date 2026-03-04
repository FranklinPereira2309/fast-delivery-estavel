
import React, { useState, useEffect } from 'react';
import { db, BusinessSettings } from '../services/db';
import { User, Waiter, DeliveryDriver } from '../types';
import { Icons } from '../constants';
import CustomAlert from '../components/CustomAlert';
import AuditLogs from './AuditLogs';

// Sub-componente para Gestão de Garçons
const WaiterManagement: React.FC = () => {
    const [waiters, setWaiters] = useState<Waiter[]>([]);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingWaiter, setEditingWaiter] = useState<Waiter | null>(null);
    const [formData, setFormData] = useState({ name: '', phone: '', email: '' });
    const [loading, setLoading] = useState(false);

    const [alertConfig, setAlertConfig] = useState<{ isOpen: boolean, title: string, message: string, type: 'SUCCESS' | 'ERROR' | 'DANGER', onConfirm?: () => void }>({
        isOpen: false, title: '', message: '', type: 'SUCCESS'
    });

    const refresh = async () => setWaiters(await db.getWaiters());
    useEffect(() => { refresh(); }, []);

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        try {
            await db.saveWaiter({
                id: editingWaiter?.id || `wa-${Date.now()}`,
                ...formData
            });
            setIsModalOpen(false);
            refresh();
            setFormData({ name: '', phone: '', email: '' });
        } catch (error) {
            alert('Erro ao salvar garçom');
        } finally {
            setLoading(false);
        }
    };

    const handleToggleStatus = async (waiter: Waiter) => {
        const action = waiter.active ? 'inativar' : 'ativar';
        setAlertConfig({
            isOpen: true,
            title: `${action.toUpperCase()} GARÇOM`,
            message: `Tem certeza que deseja ${action} o acesso de ${waiter.name}?`,
            type: waiter.active ? 'DANGER' : 'INFO',
            onConfirm: async () => {
                await db.toggleWaiterStatus(waiter.id, !waiter.active);
                refresh();
                setAlertConfig(prev => ({ ...prev, isOpen: false }));
            }
        });
    };

    const handleResetWaiter = async (waiter: Waiter) => {
        setAlertConfig({
            isOpen: true,
            title: 'RESET DE SEGURANÇA',
            message: `A senha de ${waiter.name} será resetada para '123' e um novo código de recuperação será gerado. Prosseguir?`,
            type: 'DANGER',
            onConfirm: async () => {
                await db.resetWaiter(waiter.id);
                refresh();
                setAlertConfig(prev => ({ ...prev, isOpen: false }));
            }
        });
    };

    const applyPhoneMask = (value: string) => {
        const v = value.replace(/\D/g, '').slice(0, 11);
        if (v.length <= 2) return v;
        if (v.length <= 3) return `(${v.slice(0, 2)}) ${v.slice(2)}`;
        if (v.length <= 7) return `(${v.slice(0, 2)}) ${v.slice(2, 3)} ${v.slice(3)}`;
        return `(${v.slice(0, 2)}) ${v.slice(2, 3)} ${v.slice(3, 7)}-${v.slice(7)}`;
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

            <div className="flex justify-between items-center bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm">
                <div>
                    <h3 className="text-xl font-black text-slate-800 uppercase tracking-tighter">Equipe de Garçons</h3>
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Colaboradores com acesso ao App Garçom</p>
                </div>
                <button
                    onClick={() => { setEditingWaiter(null); setFormData({ name: '', phone: '', email: '' }); setIsModalOpen(true); }}
                    className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-4 rounded-2xl font-black uppercase text-[10px] tracking-widest shadow-lg shadow-blue-100 transition-all flex items-center gap-2"
                >
                    <Icons.User size={16} />
                    Novo Garçom
                </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {waiters.map(w => (
                    <div key={w.id} className={`bg-white p-6 rounded-[2.5rem] border border-slate-100 flex flex-col group hover:shadow-xl transition-all relative overflow-hidden ${!w.active ? 'opacity-50 grayscale' : ''}`}>
                        <div className="flex items-center gap-4 mb-4">
                            <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center font-black uppercase text-sm shadow-inner relative">
                                {w.name.substring(0, 2)}
                                {!w.active && <div className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full border-2 border-white"></div>}
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                    <p className="font-black text-slate-800 uppercase text-xs tracking-tight truncate">{w.name}</p>
                                    {!w.active && <span className="text-[7px] bg-red-100 text-red-600 font-black px-1.5 py-0.5 rounded-full uppercase tracking-widest shrink-0">Inativo</span>}
                                </div>
                                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest truncate">{w.email || 'Sem e-mail'}</p>
                            </div>
                        </div>

                        <div className="flex items-center justify-between pt-4 border-t border-slate-50">
                            <div className="flex flex-col">
                                <span className="text-[8px] font-black text-slate-300 uppercase tracking-widest">Whatsapp</span>
                                <span className="text-[10px] font-bold text-slate-600 tracking-tight">{w.phone}</span>
                            </div>
                            <div className="flex gap-2">
                                <button
                                    onClick={() => handleResetWaiter(w)}
                                    title="Resetar Segurança"
                                    className="p-3 bg-amber-50 text-amber-600 rounded-xl hover:bg-amber-600 hover:text-white transition-all outline-none"
                                >
                                    <Icons.Clock size={16} />
                                </button>
                                <button
                                    onClick={() => {
                                        setEditingWaiter(w);
                                        setFormData({ name: w.name, phone: w.phone, email: w.email || '' });
                                        setIsModalOpen(true);
                                    }}
                                    title="Editar Dados"
                                    className="p-3 bg-slate-50 text-blue-600 rounded-xl hover:bg-blue-600 hover:text-white transition-all outline-none"
                                >
                                    <Icons.Edit size={16} />
                                </button>
                                <button
                                    onClick={() => handleToggleStatus(w)}
                                    title={w.active ? 'Inativar Garçom' : 'Ativar Garçom'}
                                    className={`p-3 rounded-xl transition-all outline-none ${w.active ? 'bg-red-50 text-red-600 hover:bg-red-600 hover:text-white' : 'bg-emerald-50 text-emerald-600 hover:bg-emerald-600 hover:text-white'}`}
                                >
                                    {w.active ? <Icons.Delete size={16} /> : <Icons.User size={16} />}
                                </button>
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            {isModalOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="bg-white rounded-[3rem] shadow-2xl w-full max-w-xl border border-white/20 overflow-hidden animate-in zoom-in duration-300">
                        <div className="p-10 pb-0 flex justify-between items-start">
                            <div>
                                <h4 className="text-2xl font-black text-slate-800 uppercase tracking-tighter mb-1">
                                    {editingWaiter ? 'Editar Garçom' : 'Cadastrar Garçom'}
                                </h4>
                                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Preencha os dados para acesso ao sistema</p>
                            </div>
                            <button onClick={() => setIsModalOpen(false)} className="p-3 bg-slate-50 text-slate-400 rounded-2xl hover:text-red-500 transition-all">
                                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                            </button>
                        </div>

                        <form onSubmit={handleSave} className="p-10 space-y-8">
                            <div className="grid grid-cols-2 gap-6">
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Nome Completo</label>
                                    <input
                                        type="text"
                                        required
                                        value={formData.name}
                                        onChange={e => setFormData({ ...formData, name: e.target.value })}
                                        className="w-full p-5 bg-slate-50 border-none rounded-[1.5rem] outline-none font-bold text-sm shadow-inner focus:ring-4 focus:ring-blue-100 transition-all"
                                        placeholder="Ex: Miguel Falabela"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Celular / Whats</label>
                                    <input
                                        type="text"
                                        required
                                        value={formData.phone}
                                        onChange={e => setFormData({ ...formData, phone: applyPhoneMask(e.target.value) })}
                                        className="w-full p-5 bg-slate-50 border-none rounded-[1.5rem] outline-none font-bold text-sm shadow-inner focus:ring-4 focus:ring-blue-100 transition-all"
                                        placeholder="(00) 0 0000-0000"
                                    />
                                </div>
                            </div>

                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-blue-600 uppercase tracking-widest ml-2 flex items-center gap-2">
                                    E-mail <span className="text-[8px] bg-blue-100 px-2 py-0.5 rounded-full">(Obrigatório para login no app)</span>
                                </label>
                                <input
                                    type="email"
                                    required
                                    value={formData.email}
                                    onChange={e => setFormData({ ...formData, email: e.target.value.toLowerCase() })}
                                    className="w-full p-5 bg-slate-50 border-none rounded-[1.5rem] outline-none font-bold text-sm shadow-inner focus:ring-4 focus:ring-blue-100 transition-all"
                                    placeholder="exemplo@gmail.com"
                                />
                                <p className="text-[9px] text-slate-400 font-medium ml-2 mt-2">A senha padrão para novos usuários é: <span className="font-black text-blue-600">123</span></p>
                            </div>

                            <div className="pt-6 border-t border-slate-50 flex gap-4">
                                <button
                                    type="button"
                                    onClick={() => setIsModalOpen(false)}
                                    className="flex-1 py-5 font-black uppercase text-[11px] tracking-widest text-slate-400 hover:bg-slate-50 rounded-[1.5rem] transition-all"
                                >
                                    Cancelar
                                </button>
                                <button
                                    type="submit"
                                    disabled={loading}
                                    className="flex-1 py-5 bg-blue-600 text-white rounded-[1.5rem] font-black uppercase text-[11px] tracking-widest shadow-2xl shadow-blue-500/30 hover:bg-blue-700 active:scale-95 transition-all"
                                >
                                    {loading ? 'Salvando...' : 'Confirmar Registro'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

// Sub-componente para Gestão de Usuários
const UserManagementInternal: React.FC = () => {
    const [users, setUsers] = useState<User[]>([]);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingUser, setEditingUser] = useState<User | null>(null);
    const [formData, setFormData] = useState({ name: '', email: '', password: '', phone: '', permissions: [] as string[] });
    const [alertConfig, setAlertConfig] = useState<{ isOpen: boolean, title: string, message: string, type: 'SUCCESS' | 'ERROR' | 'DANGER' | 'INFO', onConfirm?: () => void }>({
        isOpen: false, title: '', message: '', type: 'SUCCESS'
    });

    const applyPhoneMask = (value: string) => {
        const v = value.replace(/\D/g, '').slice(0, 11);
        if (v.length <= 2) return v;
        if (v.length <= 3) return `(${v.slice(0, 2)}) ${v.slice(2)}`;
        if (v.length <= 7) return `(${v.slice(0, 2)}) ${v.slice(2, 3)} ${v.slice(3)}`;
        return `(${v.slice(0, 2)}) ${v.slice(2, 3)} ${v.slice(3, 7)}-${v.slice(7)}`;
    };

    const availableModules = [
        { id: 'dashboard', label: 'Dashboard' },
        { id: 'pos', label: 'PDV / Vendas' },
        { id: 'sales-monitor', label: 'Monitor de Vendas' },
        { id: 'tables', label: 'Gestão de Mesas' },
        { id: 'kitchen', label: 'Cozinha' },
        { id: 'crm', label: 'Clientes (CRM)' },
        { id: 'inventory', label: 'Estoque / Cardápio' },
        { id: 'logistics', label: 'Logística' },
        { id: 'waiter', label: 'App Garçom' },
        { id: 'driver', label: 'Entregador' },
        { id: 'receivables', label: 'Recebimentos (Fiado)' },
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

    const handleToggleStatus = async (user: User) => {
        const action = user.active ? 'inativar' : 'ativar';
        setAlertConfig({
            isOpen: true,
            title: `${action.toUpperCase()} USUÁRIO`,
            message: `Tem certeza que deseja ${action} o acesso do usuário ${user.name}?`,
            type: user.active ? 'DANGER' : 'INFO',
            onConfirm: async () => {
                await db.toggleUserStatus(user.id, !user.active);
                refresh();
                setAlertConfig(prev => ({ ...prev, isOpen: false }));
            }
        });
    };

    const handleResetUser = async (user: User) => {
        setAlertConfig({
            isOpen: true,
            title: 'RESET DE SEGURANÇA',
            message: `O código de recuperação de ${user.name} será reiniciado e será exigida uma nova senha no próximo login. Prosseguir?`,
            type: 'DANGER',
            onConfirm: async () => {
                await db.resetUser(user.id);
                refresh();
                setAlertConfig(prev => ({ ...prev, isOpen: false }));
            }
        });
    };

    const handleDeleteUser = async (id: string) => {
        setAlertConfig({
            isOpen: true,
            title: 'EXCLUIR USUÁRIO',
            message: 'Tem certeza que deseja remover permanentemente este usuário? Isso pode causar erros se ele possuir registros vinculados (Auditoria, etc). Recomendamos INATIVAR.',
            type: 'DANGER',
            onConfirm: async () => {
                try {
                    await db.deleteUser(id);
                    refresh();
                    setAlertConfig(prev => ({ ...prev, isOpen: false }));
                } catch (e: any) {
                    setAlertConfig({
                        isOpen: true,
                        title: 'ERRO NA EXCLUSÃO',
                        message: 'Não foi possível excluir o usuário pois ele possui históricos vinculados. Use a opção INATIVAR.',
                        type: 'ERROR'
                    });
                }
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
                    <h3 className="text-xl font-black text-slate-800 uppercase tracking-tighter">Controle de Acesso (ACL)</h3>
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Defina permissões e usuários do sistema</p>
                </div>
                <button onClick={() => { setEditingUser(null); setFormData({ name: '', email: '', password: '', phone: '', permissions: ['dashboard'] }); setIsModalOpen(true); }} className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-lg shadow-blue-100 transition-all">+ Novo Usuário</button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {users.map(u => (
                    <div key={u.id} className={`bg-white p-6 rounded-[2rem] border border-slate-100 flex justify-between items-center group hover:shadow-xl transition-all ${!u.active ? 'opacity-50 grayscale' : ''}`}>
                        <div>
                            <div className="flex items-center gap-2">
                                <p className="font-black text-slate-800 uppercase text-xs">{u.name}</p>
                                {!u.active && <span className="text-[8px] bg-red-100 text-red-600 font-black px-2 py-0.5 rounded-full uppercase tracking-widest">Inativo</span>}
                            </div>
                            <p className="text-[9px] text-slate-400 font-black uppercase tracking-widest mt-1">{u.permissions.join(' • ')}</p>
                            {u.phone && <p className="text-[9px] text-blue-500 font-bold mt-1">{u.phone}</p>}
                        </div>
                        <div className="flex gap-2">
                            <button onClick={() => handleResetUser(u)} title="Resetar Segurança" className="p-3 bg-amber-50 text-amber-600 rounded-xl hover:bg-amber-600 hover:text-white transition-all">
                                <Icons.Clock />
                            </button>
                            <button onClick={() => {
                                setEditingUser(u);
                                setFormData({ name: u.name, email: u.email, password: '', phone: u.phone || '', permissions: u.permissions });
                                setIsModalOpen(true);
                            }} title="Editar Dados" className="p-3 bg-slate-50 text-blue-600 rounded-xl hover:bg-blue-600 hover:text-white transition-all">
                                <Icons.Edit />
                            </button>
                            <button onClick={() => handleToggleStatus(u)} title={u.active ? 'Inativar Usuário' : 'Ativar Usuário'} className={`p-3 rounded-xl transition-all ${u.active ? 'bg-red-50 text-red-600 hover:bg-red-600 hover:text-white' : 'bg-emerald-50 text-emerald-600 hover:bg-emerald-600 hover:text-white'}`}>
                                {u.active ? <Icons.Delete /> : <Icons.User />}
                            </button>
                        </div>
                    </div>
                ))}
            </div>

            {isModalOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
                    <div className="bg-white rounded-[3rem] shadow-2xl p-10 w-full max-w-lg border border-white/20 animate-in zoom-in duration-200">
                        <h4 className="text-2xl font-black text-slate-800 uppercase tracking-tighter mb-8">{editingUser ? 'Editar' : 'Novo'} Usuário</h4>
                        <form onSubmit={handleSave} className="space-y-6">
                            <input type="text" placeholder="Nome" value={formData.name} required onChange={e => setFormData({ ...formData, name: e.target.value })} className="w-full p-4 bg-slate-100 border-none rounded-2xl outline-none font-bold text-sm" />
                            <input type="email" placeholder="E-mail" value={formData.email} required onChange={e => setFormData({ ...formData, email: e.target.value })} className="w-full p-4 bg-slate-100 border-none rounded-2xl outline-none font-bold text-sm" />
                            <input type="text" placeholder="Telefone: (00) 9 0000-0000" value={formData.phone} required onChange={e => setFormData({ ...formData, phone: applyPhoneMask(e.target.value) })} className="w-full p-4 bg-slate-100 border-none rounded-2xl outline-none font-bold text-sm" />
                            {!editingUser && (
                                <input type="password" placeholder="Senha" value={formData.password} required onChange={e => setFormData({ ...formData, password: e.target.value })} className="w-full p-4 bg-slate-100 border-none rounded-2xl outline-none font-bold text-sm" />
                            )}
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

const Settings: React.FC<SettingsProps> = ({ settings, setSettings, onReset }) => {
    const [activeSubTab, setActiveSubTab] = useState<'EMPRESA' | 'HORARIOS' | 'FISCAL' | 'GARCONS' | 'USUARIOS' | 'AUDITORIA' | 'AVANCADO'>('EMPRESA');
    const [isSavedAlertOpen, setIsSavedAlertOpen] = useState(false);
    const [storeStatus, setStoreStatus] = useState<{ status: string, is_manually_closed: boolean } | null>(null);

    useEffect(() => {
        const fetchStatus = async () => {
            try {
                const s = await db.getStoreOperationalStatus();
                setStoreStatus(s);
            } catch (e) {
                console.error("Error fetching store status in Settings:", e);
            }
        };
        fetchStatus();
        const interval = setInterval(fetchStatus, 30000);
        return () => clearInterval(interval);
    }, []);

    const handleSaveSettings = async (e: React.FormEvent) => {
        e.preventDefault();
        await db.saveSettings(settings);
        setIsSavedAlertOpen(true);
    };

    const handleBackup = () => {
        const apiUrl = (import.meta as any).env.VITE_API_URL || '';
        const baseUrl = apiUrl.replace('/api', '');
        window.open(`${baseUrl}/api/backup/generate`, '_blank');
    };

    const menuItems = [
        { id: 'EMPRESA', label: 'Empresa', icon: Icons.Dashboard },
        { id: 'HORARIOS', label: 'Horários', icon: Icons.Clock },
        { id: 'FISCAL', label: 'Fiscal (NFC-e)', icon: Icons.View },
        { id: 'GARCONS', label: 'Garçons', icon: Icons.CRM },
        { id: 'USUARIOS', label: 'Usuários', icon: Icons.POS },
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
                            {storeStatus && (
                                <div className={`flex items-center gap-3 px-6 py-3 rounded-2xl border transition-all ${storeStatus.status === 'online' ? 'bg-emerald-50 border-emerald-100' : 'bg-red-50 border-red-100'}`}>
                                    <div className={`w-2 h-2 rounded-full ${storeStatus.status === 'online' ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'}`}></div>
                                    <span className={`text-[10px] font-black uppercase tracking-widest ${storeStatus.status === 'online' ? 'text-emerald-600' : 'text-red-600'}`}>
                                        Loja {storeStatus.status === 'online' ? 'Online' : 'Offline'}
                                    </span>
                                </div>
                            )}
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
                                    <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Quantidade de Mesas</h4>
                                    <input type="number" className="w-full p-4 bg-slate-50 border-none rounded-2xl focus:ring-4 focus:ring-blue-50 transition-all font-bold text-sm" value={settings.tableCount} onChange={e => setSettings({ ...settings, tableCount: parseInt(e.target.value) || 0 })} />
                                </div>
                                <div className="space-y-2">
                                    <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Taxa de Entrega (Ex: R$ 8,00)</h4>
                                    <input type="text" className="w-full p-4 bg-slate-50 border-none rounded-2xl focus:ring-4 focus:ring-blue-50 transition-all font-bold text-sm" value={settings.deliveryFee} onChange={e => setSettings({ ...settings, deliveryFee: e.target.value })} />
                                </div>
                                <div className="space-y-2">
                                    <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Tempo de Rejeição Automática (Minutos)</h4>
                                    <input type="number" className="w-full p-4 bg-slate-50 border-none rounded-2xl focus:ring-4 focus:ring-blue-50 transition-all font-bold text-sm" value={settings.orderTimeoutMinutes} onChange={e => setSettings({ ...settings, orderTimeoutMinutes: parseInt(e.target.value) || 0 })} />
                                </div>
                                <div className="space-y-2">
                                    <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Troco Máximo (R$)</h4>
                                    <input type="number" className="w-full p-4 bg-slate-50 border-none rounded-2xl focus:ring-4 focus:ring-blue-50 transition-all font-bold text-sm" value={settings.maxChange || 191} onChange={e => setSettings({ ...settings, maxChange: parseFloat(e.target.value) || 0 })} />
                                </div>
                                <div className="space-y-2 col-span-2 p-6 bg-slate-50 rounded-2xl border border-slate-100 flex items-center justify-between">
                                    <div>
                                        <h4 className="text-[12px] font-black text-slate-800 uppercase tracking-widest">Cobrar Taxa de Serviço Opcional</h4>
                                        <p className="text-[10px] font-bold text-slate-400 mt-1 uppercase">Aplica % de comissão na venda pelo PDV de Mesas e Menu Digital</p>
                                    </div>
                                    <div className="flex items-center gap-4">
                                        <div className="flex items-center gap-2">
                                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">%</span>
                                            <input
                                                type="number"
                                                className={`w-20 p-3 bg-white border border-slate-200 rounded-xl focus:ring-4 focus:ring-blue-50 transition-all font-black text-sm text-center ${!settings.serviceFeeStatus && 'opacity-50 cursor-not-allowed'}`}
                                                value={settings.serviceFeePercentage !== undefined ? settings.serviceFeePercentage : 10}
                                                disabled={!settings.serviceFeeStatus}
                                                onChange={e => setSettings({ ...settings, serviceFeePercentage: parseFloat(e.target.value) || 0 })}
                                            />
                                        </div>
                                        <button
                                            type="button"
                                            className={`w-14 h-8 rounded-full transition-all relative ${settings.serviceFeeStatus !== false ? 'bg-emerald-500' : 'bg-slate-200'}`}
                                            onClick={() => setSettings({ ...settings, serviceFeeStatus: settings.serviceFeeStatus === false ? true : false })}
                                        >
                                            <div className={`absolute top-1 w-6 h-6 rounded-full bg-white transition-all ${settings.serviceFeeStatus !== false ? 'left-7' : 'left-1'}`}></div>
                                        </button>
                                    </div>
                                </div>
                                <div className="space-y-2 col-span-2">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Endereço Completo</label>
                                    <input type="text" className="w-full p-4 bg-slate-50 border-none rounded-2xl focus:ring-4 focus:ring-blue-50 transition-all font-bold text-sm" value={settings.address} onChange={e => setSettings({ ...settings, address: e.target.value })} />
                                </div>
                            </div>

                            <div className="pt-8 border-t border-slate-100">
                                <div className="flex justify-between items-center mb-6">
                                    <div>
                                        <h4 className="text-sm font-black text-slate-800 uppercase tracking-tighter">Módulos e Aplicativos Adicionais</h4>
                                        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Habilite ou desabilite os aplicativos para sua loja</p>
                                    </div>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                                    <div className="p-6 bg-slate-50 rounded-2xl border border-slate-100 flex flex-col justify-between gap-4">
                                        <div>
                                            <h4 className="text-[12px] font-black text-slate-800 uppercase tracking-widest">App Delivery</h4>
                                            <p className="text-[10px] font-bold text-slate-400 mt-1 uppercase">Clientes fazem pedidos via app próprio (pedidos online).</p>
                                        </div>
                                        <div className="flex justify-end">
                                            <button
                                                type="button"
                                                className={`w-14 h-8 rounded-full transition-all relative ${settings.enableDeliveryApp !== false ? 'bg-emerald-500' : 'bg-slate-200'}`}
                                                onClick={() => setSettings({ ...settings, enableDeliveryApp: settings.enableDeliveryApp === false ? true : false })}
                                            >
                                                <div className={`absolute top-1 w-6 h-6 rounded-full bg-white transition-all ${settings.enableDeliveryApp !== false ? 'left-7' : 'left-1'}`}></div>
                                            </button>
                                        </div>
                                    </div>

                                    <div className="p-6 bg-slate-50 rounded-2xl border border-slate-100 flex flex-col justify-between gap-4">
                                        <div>
                                            <h4 className="text-[12px] font-black text-slate-800 uppercase tracking-widest">Menu Digital</h4>
                                            <p className="text-[10px] font-bold text-slate-400 mt-1 uppercase">Cardápio via QR Code para clientes nas mesas.</p>
                                        </div>
                                        <div className="flex justify-end">
                                            <button
                                                type="button"
                                                className={`w-14 h-8 rounded-full transition-all relative ${settings.enableDigitalMenu !== false ? 'bg-emerald-500' : 'bg-slate-200'}`}
                                                onClick={() => setSettings({ ...settings, enableDigitalMenu: settings.enableDigitalMenu === false ? true : false })}
                                            >
                                                <div className={`absolute top-1 w-6 h-6 rounded-full bg-white transition-all ${settings.enableDigitalMenu !== false ? 'left-7' : 'left-1'}`}></div>
                                            </button>
                                        </div>
                                    </div>

                                    <div className="p-6 bg-slate-50 rounded-2xl border border-slate-100 flex flex-col justify-between gap-4">
                                        <div>
                                            <h4 className="text-[12px] font-black text-slate-800 uppercase tracking-widest">App Garçom</h4>
                                            <p className="text-[10px] font-bold text-slate-400 mt-1 uppercase">Acesso ao sistema para garçons lançarem pedidos.</p>
                                        </div>
                                        <div className="flex justify-end">
                                            <button
                                                type="button"
                                                className={`w-14 h-8 rounded-full transition-all relative ${settings.enableWaiterApp !== false ? 'bg-emerald-500' : 'bg-slate-200'}`}
                                                onClick={() => setSettings({ ...settings, enableWaiterApp: settings.enableWaiterApp === false ? true : false })}
                                            >
                                                <div className={`absolute top-1 w-6 h-6 rounded-full bg-white transition-all ${settings.enableWaiterApp !== false ? 'left-7' : 'left-1'}`}></div>
                                            </button>
                                        </div>
                                    </div>

                                    <div className="p-6 bg-slate-50 rounded-2xl border border-slate-100 flex flex-col justify-between gap-4">
                                        <div>
                                            <h4 className="text-[12px] font-black text-slate-800 uppercase tracking-widest">App Entregador</h4>
                                            <p className="text-[10px] font-bold text-slate-400 mt-1 uppercase">Acesso ao aplicativo para motoboys e entregas.</p>
                                        </div>
                                        <div className="flex justify-end">
                                            <button
                                                type="button"
                                                className={`w-14 h-8 rounded-full transition-all relative ${settings.enableDriverApp !== false ? 'bg-emerald-500' : 'bg-slate-200'}`}
                                                onClick={() => setSettings({ ...settings, enableDriverApp: settings.enableDriverApp === false ? true : false })}
                                            >
                                                <div className={`absolute top-1 w-6 h-6 rounded-full bg-white transition-all ${settings.enableDriverApp !== false ? 'left-7' : 'left-1'}`}></div>
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="pt-8 border-t border-slate-100">
                                <div className="flex justify-between items-center mb-6">
                                    <div>
                                        <h4 className="text-sm font-black text-slate-800 uppercase tracking-tighter">Segurança do App Garçom</h4>
                                        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Configure a tela de privacidade contra inatividade</p>
                                    </div>
                                </div>
                                <div className="p-6 bg-slate-50 rounded-2xl border border-slate-100 space-y-6">
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <h4 className="text-[12px] font-black text-slate-800 uppercase tracking-widest">Ativar Tela de Privacidade</h4>
                                            <p className="text-[10px] font-bold text-slate-400 mt-1 uppercase">Bloqueia automaticamente o App Garçom após período de inatividade.</p>
                                        </div>
                                        <button
                                            type="button"
                                            className={`w-14 h-8 rounded-full transition-all relative ${settings.waiterPrivacyEnabled ? 'bg-emerald-500' : 'bg-slate-200'}`}
                                            onClick={() => setSettings({ ...settings, waiterPrivacyEnabled: !settings.waiterPrivacyEnabled })}
                                        >
                                            <div className={`absolute top-1 w-6 h-6 rounded-full bg-white transition-all ${settings.waiterPrivacyEnabled ? 'left-7' : 'left-1'}`}></div>
                                        </button>
                                    </div>

                                    <div className={`transition-all duration-300 ${settings.waiterPrivacyEnabled ? 'opacity-100' : 'opacity-40 pointer-events-none'}`}>
                                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Tempo de Inatividade para Bloqueio (Segundos)</label>
                                        <input
                                            type="number"
                                            className="w-full xl:w-1/3 mt-2 p-4 bg-white border border-slate-200 rounded-2xl focus:ring-4 focus:ring-blue-50 transition-all font-bold text-sm"
                                            value={settings.waiterPrivacyTimer}
                                            onChange={e => setSettings({ ...settings, waiterPrivacyTimer: parseInt(e.target.value) || 60 })}
                                            disabled={!settings.waiterPrivacyEnabled}
                                        />
                                    </div>
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
                                        <div className="flex justify-between items-center ml-1">
                                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Raio Permitido (Metros)</label>
                                            <span className="text-[8px] font-black text-blue-500 uppercase tracking-widest">(0 = Desativar)</span>
                                        </div>
                                        <input type="number" className="w-full p-4 bg-slate-50 border-none rounded-2xl focus:ring-4 focus:ring-blue-50 transition-all font-bold text-sm" value={settings.geofenceRadius || 0} onChange={e => setSettings({ ...settings, geofenceRadius: parseInt(e.target.value) || 0 })} placeholder="Recomendado: 150" />
                                        <p className="text-[8px] text-slate-400 font-bold uppercase tracking-widest ml-1 opacity-60">Sugestão: 150m cobre a maioria das oscilações de GPS interno.</p>
                                    </div>
                                </div>
                            </div>

                            <button type="submit" className="w-full md:w-auto bg-blue-600 text-white px-12 py-5 rounded-2xl font-black uppercase text-xs tracking-widest hover:bg-blue-700 transition-all shadow-2xl shadow-blue-100">Salvar Dados da Empresa</button>
                        </form>
                    </div>
                )}

                {activeSubTab === 'HORARIOS' && <OperatingHoursSettings settings={settings} setSettings={setSettings} onSave={handleSaveSettings} />}

                {activeSubTab === 'FISCAL' && (
                    <div className="bg-white p-10 rounded-[3rem] shadow-sm border border-slate-100 max-w-4xl animate-in fade-in">
                        <div className="mb-10">
                            <h3 className="text-2xl font-black text-slate-800 uppercase tracking-tighter">Configurações Fiscais</h3>
                            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Credenciais para emissão de NFC-e (Nota Fiscal de Consumidor Eletrônica)</p>
                        </div>
                        <form onSubmit={handleSaveSettings} className="space-y-8">
                            <div className="p-6 bg-slate-50 rounded-3xl border border-slate-100 flex items-center justify-between mb-8">
                                <div>
                                    <h4 className="text-[12px] font-black text-slate-800 uppercase tracking-widest">Habilitar Opção de NFC-e no PDV</h4>
                                    <p className="text-[10px] font-bold text-slate-400 mt-1 uppercase">Quando desativado, o sistema emitirá apenas o cupom simples padrão.</p>
                                </div>
                                <button
                                    type="button"
                                    className={`w-14 h-8 rounded-full transition-all relative ${settings.enableNfcEmission ? 'bg-emerald-500' : 'bg-slate-200'}`}
                                    onClick={() => setSettings({ ...settings, enableNfcEmission: !settings.enableNfcEmission })}
                                >
                                    <div className={`absolute top-1 w-6 h-6 rounded-full bg-white transition-all ${settings.enableNfcEmission ? 'left-7' : 'left-1'}`}></div>
                                </button>
                            </div>

                            <div className={`grid grid-cols-2 gap-8 ${!settings.enableNfcEmission ? 'opacity-40 pointer-events-none' : ''}`}>
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Inscrição Estadual (IE)</label>
                                    <input type="text" className="w-full p-4 bg-slate-50 border-none rounded-2xl focus:ring-4 focus:ring-blue-50 transition-all font-bold text-sm" value={settings.ie || ''} onChange={e => setSettings({ ...settings, ie: e.target.value })} placeholder="Isento ou Número da IE" />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Ambiente de Emissão</label>
                                    <select className="w-full p-4 bg-slate-50 border-none rounded-2xl focus:ring-4 focus:ring-blue-50 transition-all font-bold text-sm" value={settings.isNfeProduction ? 'true' : 'false'} onChange={e => setSettings({ ...settings, isNfeProduction: e.target.value === 'true' })}>
                                        <option value="false">Homologação (Testes)</option>
                                        <option value="true">Produção (Valor Fiscal)</option>
                                    </select>
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">ID do Código de Segurança (CSC ID)</label>
                                    <input type="text" className="w-full p-4 bg-slate-50 border-none rounded-2xl focus:ring-4 focus:ring-blue-50 transition-all font-bold text-sm" value={settings.cscId || ''} onChange={e => setSettings({ ...settings, cscId: e.target.value })} placeholder="000001" />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Token CSC</label>
                                    <input type="text" className="w-full p-4 bg-slate-50 border-none rounded-2xl focus:ring-4 focus:ring-blue-50 transition-all font-bold text-sm" value={settings.cscToken || ''} onChange={e => setSettings({ ...settings, cscToken: e.target.value })} placeholder="ABC-123-..." />
                                </div>
                            </div>
                            <div className="p-6 bg-blue-50 rounded-3xl border border-blue-100 flex items-start gap-4">
                                <div className="mt-1 text-blue-600"><Icons.View className="w-5 h-5" /></div>
                                <div>
                                    <p className="text-[10px] font-black text-blue-800 uppercase tracking-widest mb-1">Aviso Importante</p>
                                    <p className="text-[11px] text-blue-700 font-bold leading-relaxed">Para emitir NFC-e, sua empresa deve estar credenciada na SEFAZ do seu estado e possuir um Certificado Digital (A1) instalado no servidor de mensageria.</p>
                                </div>
                            </div>
                            <button type="submit" className="w-full md:w-auto bg-blue-600 text-white px-12 py-5 rounded-2xl font-black uppercase text-xs tracking-widest hover:bg-blue-700 transition-all shadow-2xl shadow-blue-100">Salvar Dados Fiscais</button>
                        </form>
                    </div>
                )}

                {activeSubTab === 'GARCONS' && <WaiterManagement />}
                {activeSubTab === 'USUARIOS' && <UserManagementInternal />}
                {activeSubTab === 'AUDITORIA' && <div className="bg-white p-8 rounded-[3rem] border border-slate-100"><AuditLogs /></div>}

                {activeSubTab === 'AVANCADO' && (
                    <div className="max-w-4xl space-y-8">
                        <div className="bg-white p-10 rounded-[3rem] shadow-sm border border-slate-100">
                            <h3 className="text-2xl font-black mb-2 text-blue-600 uppercase tracking-tighter">Manutenção e Backup</h3>
                            <p className="text-xs text-slate-400 font-bold uppercase tracking-widest mb-10">Gerencie a segurança dos seus dados</p>

                            <div className="p-8 bg-blue-50 rounded-3xl border border-blue-100 flex items-center justify-between">
                                <div>
                                    <p className="text-sm font-black text-blue-900 uppercase tracking-tight">Cópia de Segurança (Backup):</p>
                                    <p className="text-[10px] text-blue-700/60 font-bold mt-1 uppercase">Baixe um arquivo contendo todos os dados do sistema (pedidos, clientes, produtos).</p>
                                </div>
                                <button
                                    onClick={handleBackup}
                                    className="bg-blue-600 text-white px-8 py-4 rounded-2xl font-black uppercase text-[10px] tracking-widest hover:bg-blue-700 transition-all shadow-xl shadow-blue-200 flex items-center gap-3"
                                >
                                    <Icons.Download className="w-4 h-4" />
                                    Baixar Backup (.sql)
                                </button>
                            </div>
                        </div>

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
