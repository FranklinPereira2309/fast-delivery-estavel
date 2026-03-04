import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../services/api';
import { Icons } from '../constants';

const Profile: React.FC = () => {
    const navigate = useNavigate();
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [client, setClient] = useState<any>(null);
    const [showCurrentPassword, setShowCurrentPassword] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);
    const [isEditingAddress, setIsEditingAddress] = useState(false);

    const [formData, setFormData] = useState({
        name: '',
        email: '',
        address: '',
        currentPassword: '',
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

            // Consolidate address from various possible sources
            let initialAddress = data.address || '';
            if (!initialAddress && data.addresses && data.addresses.length > 0) {
                initialAddress = data.addresses[0];
            }
            if (!initialAddress && data.street) {
                initialAddress = `${data.street}, ${data.addressNumber || ''}, ${data.neighborhood || ''}`;
            }

            setFormData({
                name: data.name || '',
                email: data.email || '',
                address: initialAddress,
                currentPassword: '',
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
            setError('As novas senhas não coincidem.');
            return;
        }

        if ((formData.name !== client.name || formData.email !== client.email || formData.address !== client.address || formData.password) && !formData.currentPassword) {
            setError('Por favor, informe sua senha atual para salvar as alterações.');
            return;
        }

        setIsSaving(true);
        try {
            const updateData: any = {
                name: formData.name,
                email: formData.email,
                address: formData.address,
                currentPassword: formData.currentPassword
            };
            if (formData.password) {
                updateData.password = formData.password;
            }

            const updatedClient = await api.updateClient(client.id, updateData);
            localStorage.setItem('delivery_app_client', JSON.stringify(updatedClient));
            setClient(updatedClient);
            setSuccess('Perfil atualizado com sucesso!');
            setFormData(prev => ({ ...prev, currentPassword: '', password: '', confirmPassword: '' }));
        } catch (err: any) {
            setError(err.response?.data?.error || 'Erro ao atualizar perfil. Verifique sua senha atual.');
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
                                <h2 className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2 flex items-center gap-2 mb-4">
                                    <span className="w-2 h-2 rounded-full bg-blue-600"></span> Endereço para Entregas
                                </h2>

                                {!isEditingAddress ? (
                                    <div className="flex items-center justify-between p-5 bg-slate-50 border border-slate-100 rounded-[2rem] shadow-sm transition-all hover:border-indigo-100 group">
                                        <div className="flex-1 pr-4 flex items-center gap-4">
                                            <div className="w-12 h-12 bg-emerald-50 rounded-[1.25rem] flex items-center justify-center shrink-0">
                                                <Icons.Smartphone className="w-5 h-5 text-emerald-500" />
                                            </div>
                                            <div className="flex-1">
                                                <span className="text-[9px] font-black uppercase text-emerald-500 tracking-[0.1em] block leading-none mb-1.5">Entregar em:</span>
                                                <p className="text-[13px] font-bold text-slate-800 leading-tight">{formData.address || 'Nenhum endereço cadastrado'}</p>
                                            </div>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => setIsEditingAddress(true)}
                                            className="text-[10px] font-black uppercase text-blue-600 tracking-widest px-6 py-3 bg-blue-50 rounded-full hover:bg-blue-100 transition-all shrink-0 active:scale-95 shadow-sm shadow-blue-100/50"
                                        >
                                            Alterar
                                        </button>
                                    </div>
                                ) : (
                                    <div className="p-6 bg-slate-50 border border-slate-100 rounded-[2rem] space-y-4 animate-in fade-in slide-in-from-top-4 duration-300">
                                        <div className="flex justify-between items-center mb-2">
                                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Editar Endereço</span>
                                            <button
                                                type="button"
                                                onClick={() => setIsEditingAddress(false)}
                                                className="p-2 bg-white text-slate-400 rounded-full hover:bg-rose-50 hover:text-rose-500 transition-all shadow-sm"
                                            >
                                                <Icons.X className="w-4 h-4" />
                                            </button>
                                        </div>
                                        <textarea
                                            required
                                            rows={2}
                                            value={formData.address}
                                            onChange={e => setFormData({ ...formData, address: e.target.value })}
                                            className="w-full p-4 bg-white border border-slate-100 rounded-2xl font-bold text-sm focus:ring-4 focus:ring-indigo-50 focus:border-indigo-200 transition-all outline-none resize-none"
                                            placeholder="Ex: Rua, Número, Bairro, CEP..."
                                        />
                                        <button
                                            type="button"
                                            onClick={() => setIsEditingAddress(false)}
                                            className="w-full py-4 bg-indigo-600 text-white rounded-2xl font-black uppercase text-[10px] tracking-widest shadow-lg shadow-indigo-100"
                                        >
                                            Confirmar Endereço
                                        </button>
                                    </div>
                                )}
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
                                Para trocar o número de WhatsApp, envie seus <span className="font-black">Nome, e-mail, número atual e novo número</span> para:
                                <span className="font-black text-amber-700 underline block mt-1">fransoft.developer.2026@gmail.com</span>
                            </p>
                        </div>
                    </div>

                    <div className="bg-white p-6 rounded-[2.5rem] shadow-sm border border-slate-100 space-y-4">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-4 mb-2 block">Alterar Senha (Opcional)</label>
                        <div className="space-y-3">
                            <div className="relative">
                                <input
                                    type={showCurrentPassword ? "text" : "password"}
                                    placeholder="Senha Atual"
                                    value={formData.currentPassword}
                                    onChange={e => setFormData({ ...formData, currentPassword: e.target.value })}
                                    className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl font-bold text-sm focus:ring-4 focus:ring-indigo-50 transition-all outline-none"
                                />
                                <button type="button" onClick={() => setShowCurrentPassword(!showCurrentPassword)} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-indigo-500 transition-colors">
                                    {showCurrentPassword ? <Icons.EyeOff className="w-5 h-5" /> : <Icons.Eye className="w-5 h-5" />}
                                </button>
                            </div>
                            <div className="relative">
                                <input
                                    type={showPassword ? "text" : "password"}
                                    placeholder="Nova Senha"
                                    value={formData.password}
                                    onChange={e => setFormData({ ...formData, password: e.target.value })}
                                    className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl font-bold text-sm focus:ring-4 focus:ring-indigo-50 transition-all outline-none"
                                />
                                <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-indigo-500 transition-colors">
                                    {showPassword ? <Icons.EyeOff className="w-5 h-5" /> : <Icons.Eye className="w-5 h-5" />}
                                </button>
                            </div>
                            <div className="relative">
                                <input
                                    type={showConfirmPassword ? "text" : "password"}
                                    placeholder="Confirmar Nova Senha"
                                    value={formData.confirmPassword}
                                    onChange={e => setFormData({ ...formData, confirmPassword: e.target.value })}
                                    className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl font-bold text-sm focus:ring-4 focus:ring-indigo-50 transition-all outline-none"
                                />
                                <button type="button" onClick={() => setShowConfirmPassword(!showConfirmPassword)} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-indigo-500 transition-colors">
                                    {showConfirmPassword ? <Icons.EyeOff className="w-5 h-5" /> : <Icons.Eye className="w-5 h-5" />}
                                </button>
                            </div>
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
