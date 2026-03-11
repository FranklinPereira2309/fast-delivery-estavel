import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../services/api';
import { Icons } from '../constants';
import CustomAlert from '../components/CustomAlert';

const Register: React.FC = () => {
    const [formData, setFormData] = useState({
        name: '',
        email: '',
        phone: '',
        cep: '',
        street: '',
        addressNumber: '',
        neighborhood: '',
        city: '',
        state: '',
        complement: '',
        password: '',
        confirmPassword: ''
    });

    const [isLoadingCep, setIsLoadingCep] = useState(false);
    const [error, setError] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);
    const [showAddress, setShowAddress] = useState(false);
    const [isCheckingPhone, setIsCheckingPhone] = useState(false);
    const [phoneTaken, setPhoneTaken] = useState(false);
    const [alertState, setAlertState] = useState({
        isOpen: false,
        title: '',
        message: '',
        type: 'INFO' as 'INFO' | 'DANGER' | 'SUCCESS',
        onConfirm: () => { },
        onCancel: undefined as (() => void) | undefined
    });

    const navigate = useNavigate();

    // Máscara WhatsApp: (99) 9 9999-9999
    const maskPhone = (value: string) => {
        const numbers = value.replace(/\D/g, '');
        if (numbers.length <= 2) return numbers;
        if (numbers.length <= 3) return `(${numbers.slice(0, 2)}) ${numbers.slice(2)}`;
        if (numbers.length <= 7) return `(${numbers.slice(0, 2)}) ${numbers.slice(2, 3)} ${numbers.slice(3)}`;
        return `(${numbers.slice(0, 2)}) ${numbers.slice(2, 3)} ${numbers.slice(3, 7)}-${numbers.slice(7, 11)}`;
    };

    // Máscara CEP: 99.999-999
    const maskCep = (value: string) => {
        const numbers = value.replace(/\D/g, '');
        if (numbers.length <= 2) return numbers;
        if (numbers.length <= 5) return `${numbers.slice(0, 2)}.${numbers.slice(2)}`;
        return `${numbers.slice(0, 2)}.${numbers.slice(2, 5)}-${numbers.slice(5, 8)}`;
    };
    
    const handlePhoneBlur = async () => {
        const cleanPhone = formData.phone.replace(/\D/g, '');
        if (cleanPhone.length !== 11) return;

        setIsCheckingPhone(true);
        setPhoneTaken(false);
        try {
            const { available } = await api.checkPhone(cleanPhone);
            if (!available) {
                setPhoneTaken(true);
                setError('Este número de telefone já está cadastrado em outra conta. Por favor, utilize um número novo.');
            }
        } catch (err) {
            console.error('Check phone error:', err);
        } finally {
            setIsCheckingPhone(false);
        }
    };

    const handleCepBlur = async () => {
        const cleanCep = formData.cep.replace(/\D/g, '');
        if (cleanCep.length !== 8) {
            if (cleanCep.length > 0) setError('CEP deve ter 8 dígitos');
            return;
        }

        setIsLoadingCep(true);
        try {
            const response = await fetch(`https://viacep.com.br/ws/${cleanCep}/json/`);
            const data = await response.json();

            if (data.erro) {
                setError('CEP não encontrado');
            } else {
                setError('');
                setFormData(prev => ({
                    ...prev,
                    street: data.logradouro || '',
                    neighborhood: data.bairro || '',
                    city: data.localidade || '',
                    state: data.uf || ''
                }));
                setShowAddress(true);
            }
        } catch (err) {
            console.error('ViaCEP Error:', err);
        } finally {
            setIsLoadingCep(false);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');

        const cleanPhone = formData.phone.replace(/\D/g, '');
        const cleanCep = formData.cep.replace(/\D/g, '');

        if (cleanPhone.length !== 11) {
            setError('WhatsApp deve ter 11 dígitos (DDD + 9 + Número)');
            return;
        }

        if (cleanCep.length !== 8) {
            setError('CEP deve ter 8 dígitos');
            return;
        }

        if (formData.password !== formData.confirmPassword) {
            setError('As senhas não conferem');
            return;
        }

        if (formData.password.length < 6) {
            setError('A senha deve ter pelo menos 6 caracteres');
            return;
        }

        if (phoneTaken) {
            setError('Este número de telefone já está cadastrado em outra conta. Por favor, utilize um número novo.');
            return;
        }

        try {
            await api.register(
                formData.name,
                formData.email,
                cleanPhone,
                formData.password,
                cleanCep,
                formData.addressNumber,
                formData.complement,
                formData.street,
                formData.neighborhood,
                formData.city,
                formData.state
            );

            setAlertState({
                isOpen: true,
                title: 'Sucesso!',
                message: 'Cadastro realizado com sucesso! Favor realizar o login.',
                type: 'SUCCESS',
                onConfirm: () => navigate('/login'),
                onCancel: undefined
            });
        } catch (err: any) {
            const errorMessage = err.message || 'Erro ao realizar cadastro';
            setError(errorMessage);
            setAlertState({
                isOpen: true,
                title: 'Atenção',
                message: errorMessage,
                type: 'DANGER',
                onConfirm: () => setAlertState(prev => ({ ...prev, isOpen: false })),
                onCancel: undefined
            });
        }
    };

    const inputClasses = "w-full pl-14 pr-4 py-4 bg-slate-50/50 border border-slate-200/50 rounded-2xl focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-400 focus:bg-white transition-all font-medium text-sm text-slate-600 placeholder:text-slate-400";
    const labelClasses = "text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 mb-1 block";

    return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4 lg:p-8 relative overflow-hidden">
            {/* Decorações de Fundo */}
            <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-indigo-500 rounded-full mix-blend-multiply filter blur-3xl opacity-10 animate-blob"></div>
            <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-rose-500 rounded-full mix-blend-multiply filter blur-3xl opacity-10 animate-blob animation-delay-2000"></div>

            <div className="w-full max-w-xl bg-white/80 backdrop-blur-xl rounded-[2.5rem] shadow-2xl shadow-slate-200/50 p-6 md:p-8 lg:p-12 border border-white relative z-10 my-4 md:my-8">
                {/* Fechar Modal Register */}
                <button
                    onClick={() => navigate('/')}
                    className="absolute top-4 right-4 md:top-6 md:right-6 p-2 bg-slate-50 text-slate-400 rounded-full hover:bg-slate-100 hover:text-slate-600 transition-all active:scale-95 shadow-sm z-20 border border-slate-100"
                    title="Voltar"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                </button>

                <div className="flex flex-col items-center mb-10 text-center">
                    <h1 className="text-3xl lg:text-4xl font-black text-slate-800 tracking-tighter uppercase mb-2">Criar Conta</h1>
                    <p className="text-slate-400 font-bold text-[10px] uppercase tracking-widest">Faça parte do Delivery App</p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-5">
                    {error && (
                        <div className="bg-rose-50/80 backdrop-blur-sm p-4 rounded-2xl border border-rose-100 animate-fade-in">
                            <p className="text-rose-600 text-xs font-black text-center uppercase tracking-widest leading-relaxed">{error}</p>
                        </div>
                    )}

                    {/* Dados Pessoais */}
                    <div className="space-y-5">
                        <div className="space-y-1">
                            <label className={labelClasses}>Nome Completo</label>
                            <div className="relative group">
                                <div className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-indigo-500 transition-colors">
                                    <Icons.User className="w-5 h-5" />
                                </div>
                                <input
                                    type="text" required
                                    className={inputClasses}
                                    placeholder="João Silva"
                                    value={formData.name}
                                    onChange={e => setFormData({ ...formData, name: e.target.value })}
                                />
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                            <div className="space-y-1">
                                <label className={labelClasses}>E-mail</label>
                                <div className="relative group">
                                    <div className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-indigo-500 transition-colors">
                                        <Icons.Mail className="w-5 h-5" />
                                    </div>
                                    <input
                                        type="email" required
                                        className={inputClasses}
                                        placeholder="seu@email.com"
                                        value={formData.email}
                                        onChange={e => setFormData({ ...formData, email: e.target.value })}
                                    />
                                </div>
                            </div>
                            <div className="space-y-1">
                                <label className={labelClasses}>WhatsApp</label>
                                <div className="relative group">
                                    <div className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-indigo-500 transition-colors">
                                        <Icons.Phone className="w-5 h-5" />
                                    </div>
                                    <input
                                        type="tel" required
                                        className={inputClasses}
                                        placeholder="(11) 90000-0000"
                                        value={formData.phone}
                                        onBlur={handlePhoneBlur}
                                        onChange={e => {
                                            setFormData({ ...formData, phone: maskPhone(e.target.value) });
                                            setPhoneTaken(false);
                                            if (error.includes('telefone')) setError('');
                                        }}
                                    />
                                    {isCheckingPhone && (
                                        <div className="absolute right-4 top-1/2 -translate-y-1/2">
                                            <div className="w-4 h-4 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
                                        </div>
                                    )}
                                    {phoneTaken && !isCheckingPhone && (
                                        <div className="absolute right-4 top-1/2 -translate-y-1/2 text-rose-500">
                                            <Icons.X className="w-5 h-5" />
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Divisor Endereço */}
                    <div className="pt-4 border-t border-slate-100">
                        <button
                            type="button"
                            onClick={() => setShowAddress(!showAddress)}
                            className="w-full flex items-center justify-between p-4 bg-slate-50 hover:bg-slate-100 rounded-2xl transition-colors group cursor-pointer"
                        >
                            <div className="flex items-center gap-3">
                                <Icons.MapPin className="w-5 h-5 text-indigo-500" />
                                <span className="text-sm font-bold text-slate-700">Endereço de Entrega</span>
                                {!showAddress && formData.street && (
                                    <span className="text-[10px] font-black uppercase tracking-widest text-emerald-500 bg-emerald-50 px-2 py-1 rounded-md">Preenchido</span>
                                )}
                            </div>
                            <div className="text-slate-400 group-hover:text-slate-600 transition-colors">
                                {showAddress ? <Icons.ChevronUp className="w-5 h-5" /> : <Icons.ChevronDown className="w-5 h-5" />}
                            </div>
                        </button>
                    </div>

                    {/* Campos de Endereço Ocultáveis */}
                    {showAddress && (
                        <div className="space-y-5 animate-fade-in p-2">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                                <div className="space-y-1">
                                    <label className={labelClasses}>CEP</label>
                                    <div className="relative group">
                                        <div className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-indigo-500 transition-colors">
                                            <Icons.Search className="w-5 h-5" />
                                        </div>
                                        <input
                                            type="text" required
                                            maxLength={10}
                                            className={inputClasses}
                                            placeholder="00.000-000"
                                            value={formData.cep}
                                            onBlur={handleCepBlur}
                                            onChange={e => setFormData({ ...formData, cep: maskCep(e.target.value) })}
                                        />
                                        {isLoadingCep && <div className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>}
                                    </div>
                                </div>
                                <div className="space-y-1">
                                    <label className={labelClasses}>Rua</label>
                                    <div className="relative group">
                                        <div className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-indigo-500 transition-colors">
                                            <Icons.Map className="w-5 h-5" />
                                        </div>
                                        <input
                                            type="text" required
                                            className={inputClasses}
                                            placeholder="Av. Paulista"
                                            value={formData.street}
                                            onChange={e => setFormData({ ...formData, street: e.target.value })}
                                        />
                                    </div>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 md:grid-cols-4 gap-5">
                                <div className="space-y-1 col-span-2 md:col-span-1">
                                    <label className={labelClasses}>Número</label>
                                    <div className="relative group">
                                        <div className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-indigo-500 transition-colors">
                                            <Icons.Home className="w-5 h-5" />
                                        </div>
                                        <input
                                            type="text" required
                                            className={inputClasses}
                                            placeholder="123"
                                            value={formData.addressNumber}
                                            onChange={e => setFormData({ ...formData, addressNumber: e.target.value })}
                                        />
                                    </div>
                                </div>
                                <div className="space-y-1 col-span-2 md:col-span-3">
                                    <label className={labelClasses}>Bairro</label>
                                    <div className="relative group">
                                        <div className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-indigo-500 transition-colors">
                                            <Icons.Layers className="w-5 h-5" />
                                        </div>
                                        <input
                                            type="text" required
                                            className={inputClasses}
                                            placeholder="Bela Vista"
                                            value={formData.neighborhood}
                                            onChange={e => setFormData({ ...formData, neighborhood: e.target.value })}
                                        />
                                    </div>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 md:grid-cols-12 gap-5">
                                <div className="space-y-1 col-span-2 md:col-span-6">
                                    <label className={labelClasses}>Complemento (opcional)</label>
                                    <div className="relative group">
                                        <div className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-indigo-500 transition-colors">
                                            <Icons.Info className="w-5 h-5" />
                                        </div>
                                        <input
                                            type="text"
                                            className={inputClasses}
                                            placeholder="Apto 101, Bloco B"
                                            value={formData.complement}
                                            onChange={e => setFormData({ ...formData, complement: e.target.value })}
                                        />
                                    </div>
                                </div>
                                <div className="space-y-1 col-span-2 md:col-span-4">
                                    <label className={labelClasses}>Cidade</label>
                                    <div className="relative group">
                                        <div className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-indigo-500 transition-colors">
                                            <Icons.MapPin className="w-5 h-5" />
                                        </div>
                                        <input
                                            type="text" required
                                            className={inputClasses}
                                            placeholder="São Paulo"
                                            value={formData.city}
                                            onChange={e => setFormData({ ...formData, city: e.target.value })}
                                        />
                                    </div>
                                </div>
                                <div className="space-y-1 col-span-2 md:col-span-2">
                                    <label className={labelClasses}>UF</label>
                                    <div className="relative group">
                                        <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-indigo-500 transition-colors">
                                            <Icons.Globe className="w-4 h-4" />
                                        </div>
                                        <input
                                            type="text" required
                                            maxLength={2}
                                            className={`${inputClasses} uppercase !pl-10 !pr-1`}
                                            placeholder="SP"
                                            value={formData.state}
                                            onChange={e => setFormData({ ...formData, state: e.target.value.toUpperCase() })}
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Senhas */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5 pt-4 border-t border-slate-100">
                        <div className="space-y-1">
                            <label className={labelClasses}>Senha</label>
                            <div className="relative">
                                    <div className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-indigo-500 transition-colors">
                                        <Icons.Lock className="w-5 h-5" />
                                    </div>
                                    <input
                                        type={showPassword ? "text" : "password"} required
                                        className={inputClasses}
                                        placeholder="••••••"
                                        value={formData.password}
                                        onChange={e => setFormData({ ...formData, password: e.target.value })}
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowPassword(!showPassword)}
                                        className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-indigo-500 transition-colors"
                                    >
                                        {showPassword ? <Icons.EyeOff className="w-4 h-4" /> : <Icons.Eye className="w-4 h-4" />}
                                    </button>
                            </div>
                        </div>
                        <div className="space-y-1">
                            <label className={labelClasses}>Confirmar Senha</label>
                            <div className="relative">
                                    <div className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-indigo-500 transition-colors">
                                        <Icons.Lock className="w-5 h-5" />
                                    </div>
                                    <input
                                        type={showConfirmPassword ? "text" : "password"} required
                                        className={inputClasses}
                                        placeholder="••••••"
                                        value={formData.confirmPassword}
                                        onChange={e => setFormData({ ...formData, confirmPassword: e.target.value })}
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                                        className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-indigo-500 transition-colors"
                                    >
                                        {showConfirmPassword ? <Icons.EyeOff className="w-4 h-4" /> : <Icons.Eye className="w-4 h-4" />}
                                    </button>
                            </div>
                        </div>
                    </div>

                    <div className="pt-6">
                        <button type="submit" className="w-full bg-slate-900 text-white py-4 lg:py-5 rounded-2xl font-black uppercase text-[11px] tracking-widest hover:bg-indigo-600 hover:shadow-lg hover:shadow-indigo-500/30 transition-all active:scale-[0.98]">
                            Finalizar Cadastro
                        </button>
                    </div>
                </form>

                <div className="mt-8 text-center">
                    <p className="text-slate-500 text-xs font-medium">
                        Já tem conta?{' '}
                        <Link to="/login" className="text-indigo-600 font-bold hover:text-indigo-500 hover:underline transition-colors">Faça seu login</Link>
                    </p>
                </div>
            </div>

            <CustomAlert
                isOpen={alertState.isOpen}
                title={alertState.title}
                message={alertState.message}
                type={alertState.type}
                onConfirm={alertState.onConfirm}
                onCancel={alertState.onCancel}
            />
        </div>
    );
};

export default Register;
