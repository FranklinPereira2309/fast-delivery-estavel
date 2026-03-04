import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../services/api';
import { Icons } from '../constants';

const Profile: React.FC = () => {
    const navigate = useNavigate();
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [client, setClient] = useState<any>(null);
    const [formData, setFormData] = useState({
        name: '',
        email: '',
        address: '',
        password: '',
        confirmPassword: ''
    });
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');

    useEffect(() => {
        const clientStr = localStorage.getItem('delivery_app_client');
        if (!clientStr) {
            navigate('/login');
            return;
        }
        try {
            const data = JSON.parse(clientStr);
            setClient(data);
            setFormData({
                name: data.name || '',
                email: data.email || '',
                address: data.address || '',
                password: '',
                confirmPassword: ''
            });
        } catch (e) {
            console.error("Error parsing client data", e);
            navigate('/login');
        } finally {
            setIsLoading(false);
        }
    }, [navigate]);

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setSuccess('');

        if (formData.password && formData.password !== formData.confirmPassword) {
            setError('As senhas não coincidem.');
            return;
        }

        setIsSaving(true);
        try {
            const updateData: any = {
                name: formData.name,
                email: formData.email,
                address: formData.address,
            };
            if (formData.password) {
                updateData.password = formData.password;
            }

            const updatedClient = await api.updateClient(client.id, updateData);
            localStorage.setItem('delivery_app_client', JSON.stringify(updatedClient));
            setClient(updatedClient);
            setSuccess('Perfil atualizado com sucesso!');
            setFormData(prev => ({ ...prev, password: '', confirmPassword: '' }));
        } catch (err: any) {
            setError(err.response?.data?.error || 'Erro ao atualizar perfil.');
        } finally {
            setIsSaving(false);
        }
    };

    if (isLoading) return (
        <div className="h-screen bg-slate-50 flex flex-col items-center justify-center">
            <div className="w-16 h-16 border-4 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin mb-4"></div>
            <div className="font-black text-indigo-500 uppercase tracking-widest text-[10px]">Carregando Perfil...</div>
        </div>
    );

    return (
        <div className="min-h-screen bg-slate-50 pb-12">
            <div className="bg-white p-6 pb-8 rounded-b-[3.5rem] shadow-xl shadow-slate-200/40 flex items-center gap-4 relative overflow-hidden border-b border-slate-100">
                <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-50 rounded-full mix-blend-multiply filter blur-3xl opacity-50 animate-float"></div>
                <div className="absolute bottom-0 left-0 w-64 h-64 bg-rose-50 rounded-full mix-blend-multiply filter blur-3xl opacity-50 animate-float" style={{ animationDelay: '2s' }}></div>

                <button onClick={() => navigate('/')} className="w-12 h-12 bg-slate-50 rounded-2xl flex items-center justify-center text-slate-400 hover:text-indigo-600 hover:bg-white transition-all shadow-sm border border-slate-100 active:scale-95 z-10">
                    <Icons.ArrowLeft className="w-5 h-5" />
                </button>
                <div className="flex-1 z-10">
                    <h1 className="text-xl font-black text-slate-800 uppercase tracking-tighter italic">Meu Perfil</h1>
                </div>
            </div>

            <div className="p-6 space-y-6 max-w-lg mx-auto">
                <form onSubmit={handleSave} className="space-y-4">
                    <div className="bg-white p-6 rounded-[2.5rem] shadow-sm border border-slate-100 space-y-4">
                        <div className="space-y-4">
                            <div>
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-4 mb-2 block">Nome Completo</label>
                                <input
                                    type="text"
                                    required
                                    value={formData.name}
                                    onChange={e => setFormData({ ...formData, name: e.target.value })}
                                    className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl font-bold text-sm focus:ring-4 focus:ring-indigo-50 focus:border-indigo-200 transition-all outline-none"
                                />
                            </div>

                            <div>
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-4 mb-2 block">E-mail</label>
                                <input
                                    type="email"
                                    required
                                    value={formData.email}
                                    onChange={e => setFormData({ ...formData, email: e.target.value })}
                                    className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl font-bold text-sm focus:ring-4 focus:ring-indigo-50 focus:border-indigo-200 transition-all outline-none"
                                />
                            </div>

                            <div>
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-4 mb-2 block">Endereço Principal</label>
                                <input
                                    type="text"
                                    required
                                    value={formData.address}
                                    onChange={e => setFormData({ ...formData, address: e.target.value })}
                                    className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl font-bold text-sm focus:ring-4 focus:ring-indigo-50 focus:border-indigo-200 transition-all outline-none"
                                />
                            </div>
                        </div>
                    </div>

                    <div className="bg-white p-6 rounded-[2.5rem] shadow-sm border border-slate-100 space-y-4">
                        <div className="flex items-center gap-3 px-2 mb-2">
                            <div className="w-8 h-8 bg-amber-50 rounded-xl flex items-center justify-center text-amber-500">
                                <Icons.Smartphone className="w-4 h-4" />
                            </div>
                            <div>
                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none">WhatsApp</p>
                                <p className="text-xs font-bold text-slate-600 mt-0.5">{client?.phone || 'Não informado'}</p>
                            </div>
                        </div>
                        <div className="bg-amber-50 rounded-2xl p-4 flex gap-3 border border-amber-100">
                            <Icons.Mail className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                            <p className="text-[10px] font-bold text-amber-600 leading-relaxed uppercase tracking-tight">
                                Para trocar o número de WhatsApp, envie um e-mail para: <span className="font-black text-amber-700 underline block mt-1">fransoft.developer.2026@gmail.com</span>
                            </p>
                        </div>
                    </div>

                    <div className="bg-white p-6 rounded-[2.5rem] shadow-sm border border-slate-100 space-y-4">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-4 mb-2 block">Alterar Senha (Opcional)</label>
                        <div className="space-y-3">
                            <input
                                type="password"
                                placeholder="Nova Senha"
                                value={formData.password}
                                onChange={e => setFormData({ ...formData, password: e.target.value })}
                                className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl font-bold text-sm focus:ring-4 focus:ring-indigo-50 transition-all outline-none"
                            />
                            <input
                                type="password"
                                placeholder="Confirmar Nova Senha"
                                value={formData.confirmPassword}
                                onChange={e => setFormData({ ...formData, confirmPassword: e.target.value })}
                                className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl font-bold text-sm focus:ring-4 focus:ring-indigo-50 transition-all outline-none"
                            />
                        </div>
                    </div>

                    {error && (
                        <div className="bg-rose-50 text-rose-600 p-4 rounded-2xl text-[10px] font-black uppercase tracking-widest border border-rose-100 animate-in fade-in duration-300">
                            {error}
                        </div>
                    )}

                    {success && (
                        <div className="bg-emerald-50 text-emerald-600 p-4 rounded-2xl text-[10px] font-black uppercase tracking-widest border border-emerald-100 animate-in fade-in duration-300">
                            {success}
                        </div>
                    )}

                    <button
                        type="submit"
                        disabled={isSaving}
                        className="w-full py-5 bg-indigo-600 text-white rounded-[2rem] font-black uppercase text-[11px] tracking-widest shadow-xl shadow-indigo-100 active:scale-95 transition-all disabled:opacity-50"
                    >
                        {isSaving ? 'Salvando...' : 'Salvar Alterações'}
                    </button>
                </form>
            </div>
        </div>
    );
};

export default Profile;
