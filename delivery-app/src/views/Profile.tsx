import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../services/api';
import { Icons } from '../constants';

const Profile: React.FC = () => {
    const navigate = useNavigate();
    const [isLoading, setIsLoading] = useState(true);
    const [isSavingDetails, setIsSavingDetails] = useState(false);
    const [isSavingPassword, setIsSavingPassword] = useState(false);
    const [client, setClient] = useState<any>(null);
    const [showCurrentPassword, setShowCurrentPassword] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);
    const [isEditingAddress, setIsEditingAddress] = useState(false);

    const [detailsError, setDetailsError] = useState('');
    const [detailsSuccess, setDetailsSuccess] = useState('');
    const [isFetchingCep, setIsFetchingCep] = useState(false);
    const [passwordError, setPasswordError] = useState('');
    const [passwordSuccess, setPasswordSuccess] = useState('');

    const [formData, setFormData] = useState({
        name: '',
        email: '',
        cep: '',
        street: '',
        addressNumber: '',
        neighborhood: '',
        city: '',
        state: '',
        complement: '',
        currentPassword: '',
        password: '',
        confirmPassword: ''
    });

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
                cep: data.cep || '',
                street: data.street || '',
                addressNumber: data.addressNumber || '',
                neighborhood: data.neighborhood || '',
                city: data.city || '',
                state: data.state || '',
                complement: data.complement || '',
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
        const handleCepBlur = async () => {
            const cleanCep = formData.cep.replace(/\D/g, '');
            if (cleanCep.length !== 8) return;

            setIsFetchingCep(true);
            try {
                const response = await fetch(`https://viacep.com.br/ws/${cleanCep}/json/`);
                const data = await response.json();

                if (!data.erro) {
                    setFormData(prev => ({
                        ...prev,
                        street: data.logradouro || '',
                        neighborhood: data.bairro || '',
                        city: data.localidade || '',
                        state: data.uf || ''
                    }));
                }
            } catch (err) {
                console.error('ViaCEP Error:', err);
            } finally {
                setIsFetchingCep(false);
            }
        };

        const handleSavePersonalInfo = async () => {
            setDetailsError('');
            setDetailsSuccess('');

            setIsSavingDetails(true);
            try {
                const updateData = {
                    name: formData.name,
                    email: formData.email,
                    cep: formData.cep.replace(/\D/g, ''),
                    street: formData.street,
                    addressNumber: formData.addressNumber,
                    neighborhood: formData.neighborhood,
                    city: formData.city,
                    state: formData.state,
                    complement: formData.complement,
                };

                const updatedClient = await api.updateClient(client.id, updateData);
                localStorage.setItem('delivery_app_client', JSON.stringify(updatedClient));
                setClient(updatedClient);
                setDetailsSuccess('Dados pessoais e endereço atualizados!');
            } catch (err: any) {
                setDetailsError(err.response?.data?.error || err.message || 'Erro ao atualizar dados.');
            } finally {
                setIsSavingDetails(false);
            }
        };

        const handleSavePassword = async () => {
            setPasswordError('');
            setPasswordSuccess('');

            if (!formData.currentPassword || !formData.password || !formData.confirmPassword) {
                setPasswordError('Preencha os três campos para atualizar sua senha.');
                return;
            }

            if (formData.password !== formData.confirmPassword) {
                setPasswordError('As novas senhas não coincidem.');
                return;
            }

            setIsSavingPassword(true);
            try {
                const updateData = {
                    currentPassword: formData.currentPassword,
                    password: formData.password
                };

                const updatedClient = await api.updateClient(client.id, updateData);
                localStorage.setItem('delivery_app_client', JSON.stringify(updatedClient));
                setClient(updatedClient);
                setPasswordSuccess('Senha substituída com sucesso!');
                setFormData(prev => ({ ...prev, currentPassword: '', password: '', confirmPassword: '' }));
            } catch (err: any) {
                setPasswordError(err.response?.data?.error || err.message || 'Erro ao trocar senha. Verifique sua senha atual.');
            } finally {
                setIsSavingPassword(false);
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
                    <div className="space-y-6">
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

                                    <div className="flex items-center justify-between p-5 bg-slate-50 border border-slate-100 rounded-[2rem] shadow-sm transition-all hover:border-indigo-100 group">
                                        <div className="flex-1 pr-4 flex items-center gap-4">
                                            <div className="w-12 h-12 bg-emerald-50 rounded-[1.25rem] flex items-center justify-center shrink-0">
                                                <Icons.Smartphone className="w-5 h-5 text-emerald-500" />
                                            </div>
                                            <div className="flex-1">
                                                <span className="text-[9px] font-black uppercase text-emerald-500 tracking-[0.1em] block leading-none mb-1.5">Entregar em:</span>
                                                <p className="text-[13px] font-bold text-slate-800 leading-tight">
                                                    {formData.street ? `${formData.street}, ${formData.addressNumber}${formData.complement ? ` - ${formData.complement}` : ''} - ${formData.neighborhood}, ${formData.city}-${formData.state}` : 'Nenhum endereço cadastrado'}
                                                </p>
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

                                    {isEditingAddress && (
                                        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 animate-in fade-in duration-300">
                                            <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setIsEditingAddress(false)}></div>

                                            <div className="bg-slate-50 w-full max-w-sm rounded-[2.5rem] p-8 shadow-2xl relative animate-in zoom-in-95 duration-300 border border-white">
                                                <button
                                                    type="button"
                                                    onClick={() => setIsEditingAddress(false)}
                                                    className="absolute top-6 right-6 w-10 h-10 bg-white rounded-full flex items-center justify-center text-slate-400 hover:text-rose-500 transition-all shadow-sm border border-slate-100 active:scale-95"
                                                >
                                                    <Icons.X className="w-5 h-5" />
                                                </button>

                                                <div className="mb-6 px-2">
                                                    <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Editar Endereço</h3>
                                                </div>

                                                <div className="bg-white rounded-[1.5rem] p-4 shadow-sm border border-slate-100 mb-6 space-y-3 max-h-[60vh] overflow-y-auto">
                                                    <div className="relative">
                                                        <input
                                                            type="text"
                                                            placeholder="CEP"
                                                            maxLength={10}
                                                            value={formData.cep}
                                                            onBlur={handleCepBlur}
                                                            onChange={e => {
                                                                const val = e.target.value.replace(/\D/g, '');
                                                                let masked = val;
                                                                if (val.length > 2) masked = `${val.slice(0, 2)}.${val.slice(2)}`;
                                                                if (val.length > 5) masked = `${val.slice(0, 2)}.${val.slice(2, 5)}-${val.slice(5, 8)}`;
                                                                setFormData({ ...formData, cep: masked });
                                                            }}
                                                            className="w-full p-3 bg-slate-50 border border-slate-100 rounded-xl font-bold text-sm outline-none"
                                                        />
                                                        {isFetchingCep && <div className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>}
                                                    </div>
                                                    <input
                                                        type="text"
                                                        placeholder="Rua"
                                                        value={formData.street}
                                                        onChange={e => setFormData({ ...formData, street: e.target.value })}
                                                        className="w-full p-3 bg-slate-50 border border-slate-100 rounded-xl font-bold text-sm outline-none"
                                                    />
                                                    <div className="grid grid-cols-2 gap-3">
                                                        <input
                                                            type="text"
                                                            placeholder="Número"
                                                            value={formData.addressNumber}
                                                            onChange={e => setFormData({ ...formData, addressNumber: e.target.value })}
                                                            className="w-full p-3 bg-slate-50 border border-slate-100 rounded-xl font-bold text-sm outline-none"
                                                        />
                                                        <input
                                                            type="text"
                                                            placeholder="Bairro"
                                                            value={formData.neighborhood}
                                                            onChange={e => setFormData({ ...formData, neighborhood: e.target.value })}
                                                            className="w-full p-3 bg-slate-50 border border-slate-100 rounded-xl font-bold text-sm outline-none"
                                                        />
                                                    </div>
                                                    <input
                                                        type="text"
                                                        placeholder="Complemento"
                                                        value={formData.complement}
                                                        onChange={e => setFormData({ ...formData, complement: e.target.value })}
                                                        className="w-full p-3 bg-slate-50 border border-slate-100 rounded-xl font-bold text-sm outline-none"
                                                    />
                                                    <div className="grid grid-cols-3 gap-3">
                                                        <input
                                                            type="text"
                                                            placeholder="Cidade"
                                                            value={formData.city}
                                                            className="col-span-2 w-full p-3 bg-slate-50 border border-slate-100 rounded-xl font-bold text-sm outline-none"
                                                            onChange={e => setFormData({ ...formData, city: e.target.value })}
                                                        />
                                                        <input
                                                            type="text"
                                                            placeholder="UF"
                                                            maxLength={2}
                                                            value={formData.state}
                                                            className="w-full p-3 bg-slate-50 border border-slate-100 rounded-xl font-bold text-sm outline-none uppercase"
                                                            onChange={e => setFormData({ ...formData, state: e.target.value.toUpperCase() })}
                                                        />
                                                    </div>
                                                </div>

                                                <button
                                                    type="button"
                                                    onClick={() => setIsEditingAddress(false)}
                                                    className="w-full py-5 bg-indigo-600 text-white rounded-[1.5rem] font-black uppercase text-[12px] tracking-widest shadow-xl shadow-indigo-200 active:scale-95 transition-all"
                                                >
                                                    Confirmar Endereço
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {detailsError && (
                                    <div className="bg-rose-50 text-rose-600 p-4 rounded-2xl text-[10px] font-black uppercase tracking-widest border border-rose-100 animate-in fade-in duration-300">
                                        {detailsError}
                                    </div>
                                )}
                                {detailsSuccess && (
                                    <div className="bg-emerald-50 text-emerald-600 p-4 rounded-2xl text-[10px] font-black uppercase tracking-widest border border-emerald-100 animate-in fade-in duration-300">
                                        {detailsSuccess}
                                    </div>
                                )}

                                <button
                                    type="button"
                                    onClick={handleSavePersonalInfo}
                                    disabled={isSavingDetails}
                                    className="w-full py-4 bg-blue-600 text-white rounded-2xl font-black uppercase text-[11px] tracking-widest shadow-lg shadow-blue-200 active:scale-95 transition-all disabled:opacity-50 mt-4"
                                >
                                    {isSavingDetails ? 'Salvando...' : 'Salvar Dados e Endereço'}
                                </button>
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
                                    Para trocar o número de WhatsApp, envie seu <span className="font-black">Nome, e-mail, número atual e novo número</span> para:
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

                                {passwordError && (
                                    <div className="bg-rose-50 text-rose-600 p-4 rounded-2xl text-[10px] font-black uppercase tracking-widest border border-rose-100 animate-in fade-in duration-300">
                                        {passwordError}
                                    </div>
                                )}
                                {passwordSuccess && (
                                    <div className="bg-emerald-50 text-emerald-600 p-4 rounded-2xl text-[10px] font-black uppercase tracking-widest border border-emerald-100 animate-in fade-in duration-300">
                                        {passwordSuccess}
                                    </div>
                                )}

                                <button
                                    type="button"
                                    onClick={handleSavePassword}
                                    disabled={isSavingPassword}
                                    className="w-full py-4 bg-indigo-600 text-white rounded-2xl font-black uppercase text-[11px] tracking-widest shadow-lg shadow-indigo-200 active:scale-95 transition-all disabled:opacity-50 mt-2"
                                >
                                    {isSavingPassword ? 'Atualizando...' : 'Alterar Senha'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        );
    };

    export default Profile;
