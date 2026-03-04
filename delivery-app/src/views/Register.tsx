import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../services/api';
import { Eye, EyeOff, MapPin, ChevronDown, ChevronUp } from 'lucide-react'; // Ícones modernos

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

    const navigate = useNavigate();

    const handleCepBlur = async () => {
        const cleanCep = formData.cep.replace(/\D/g, '');
        if (cleanCep.length !== 8) return;

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
                // Abre o endereço automaticamente ao preencher o CEP com sucesso
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

        if (formData.password !== formData.confirmPassword) {
            setError('As senhas não conferem');
            return;
        }

        if (formData.password.length < 6) {
            setError('A senha deve ter pelo menos 6 caracteres');
            return;
        }

        try {
            await api.register(
                formData.name,
                formData.email,
                formData.phone,
                formData.password,
                formData.cep,
                formData.addressNumber,
                formData.complement,
                formData.street,
                formData.neighborhood,
                formData.city,
                formData.state
            );
            alert('Cadastro realizado com sucesso! Favor realizar o login.');
            navigate('/login');
        } catch (err: any) {
            setError(err.message || 'Erro ao realizar cadastro');
        }
    };

    const inputClasses = "w-full p-4 bg-slate-50/50 border border-slate-200/50 rounded-2xl focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-400 focus:bg-white transition-all font-medium text-sm text-slate-600 placeholder:text-slate-400";
    const labelClasses = "text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 mb-1 block";

    return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4 lg:p-8 relative overflow-hidden">
            {/* Decorações de Fundo */}
            <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-indigo-500 rounded-full mix-blend-multiply filter blur-3xl opacity-10 animate-blob"></div>
            <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-rose-500 rounded-full mix-blend-multiply filter blur-3xl opacity-10 animate-blob animation-delay-2000"></div>

            <button
                onClick={() => navigate('/')}
                className="absolute top-6 right-6 lg:top-8 lg:right-8 w-12 h-12 bg-white rounded-full flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-all shadow-sm z-20 border border-slate-100"
            >
                <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
            </button>

            <div className="w-full max-w-xl bg-white/80 backdrop-blur-xl rounded-[2.5rem] shadow-2xl shadow-slate-200/50 p-8 lg:p-12 border border-white relative z-10 my-8">
                <div className="flex flex-col items-center mb-10 text-center">
                    <h1 className="text-3xl lg:text-4xl font-black text-slate-800 tracking-tighter uppercase mb-2">Criar Conta</h1>
                    <p className="text-slate-400 font-bold text-[10px] uppercase tracking-widest">Faça parte do Delivery Fast</p>
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
                            <input
                                type="text" required
                                className={inputClasses}
                                placeholder="João Silva"
                                value={formData.name}
                                onChange={e => setFormData({ ...formData, name: e.target.value })}
                            />
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                            <div className="space-y-1">
                                <label className={labelClasses}>E-mail</label>
                                <input
                                    type="email" required
                                    className={inputClasses}
                                    placeholder="seu@email.com"
                                    value={formData.email}
                                    onChange={e => setFormData({ ...formData, email: e.target.value })}
                                />
                            </div>
                            <div className="space-y-1">
                                <label className={labelClasses}>WhatsApp</label>
                                <input
                                    type="tel" required
                                    className={inputClasses}
                                    placeholder="(11) 90000-0000"
                                    value={formData.phone}
                                    onChange={e => setFormData({ ...formData, phone: e.target.value })}
                                />
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
                                <MapPin className="w-5 h-5 text-indigo-500" />
                                <span className="text-sm font-bold text-slate-700">Endereço de Entrega</span>
                                {!showAddress && formData.street && (
                                    <span className="text-[10px] font-black uppercase tracking-widest text-emerald-500 bg-emerald-50 px-2 py-1 rounded-md">Preenchido</span>
                                )}
                            </div>
                            <div className="text-slate-400 group-hover:text-slate-600 transition-colors">
                                {showAddress ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                            </div>
                        </button>
                    </div>

                    {/* Campos de Endereço Ocultáveis */}
                    {showAddress && (
                        <div className="space-y-5 animate-fade-in p-2">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                                <div className="space-y-1">
                                    <label className={labelClasses}>CEP</label>
                                    <div className="relative">
                                        <input
                                            type="text" required
                                            maxLength={9}
                                            className={inputClasses}
                                            placeholder="00000-000"
                                            value={formData.cep}
                                            onBlur={handleCepBlur}
                                            onChange={e => setFormData({ ...formData, cep: e.target.value })}
                                        />
                                        {isLoadingCep && <div className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>}
                                    </div>
                                </div>
                                <div className="space-y-1">
                                    <label className={labelClasses}>Rua</label>
                                    <input
                                        type="text" required
                                        className={inputClasses}
                                        placeholder="Av. Paulista"
                                        value={formData.street}
                                        onChange={e => setFormData({ ...formData, street: e.target.value })}
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-2 md:grid-cols-4 gap-5">
                                <div className="space-y-1 col-span-2 md:col-span-1">
                                    <label className={labelClasses}>Número</label>
                                    <input
                                        type="text" required
                                        className={inputClasses}
                                        placeholder="123"
                                        value={formData.addressNumber}
                                        onChange={e => setFormData({ ...formData, addressNumber: e.target.value })}
                                    />
                                </div>
                                <div className="space-y-1 col-span-2 md:col-span-3">
                                    <label className={labelClasses}>Bairro</label>
                                    <input
                                        type="text" required
                                        className={inputClasses}
                                        placeholder="Bela Vista"
                                        value={formData.neighborhood}
                                        onChange={e => setFormData({ ...formData, neighborhood: e.target.value })}
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-2 md:grid-cols-12 gap-5">
                                <div className="space-y-1 col-span-2 md:col-span-6">
                                    <label className={labelClasses}>Complemento (opcional)</label>
                                    <input
                                        type="text"
                                        className={inputClasses}
                                        placeholder="Apto 101, Bloco B"
                                        value={formData.complement}
                                        onChange={e => setFormData({ ...formData, complement: e.target.value })}
                                    />
                                </div>
                                <div className="space-y-1 col-span-2 md:col-span-4">
                                    <label className={labelClasses}>Cidade</label>
                                    <input
                                        type="text" required
                                        className={inputClasses}
                                        placeholder="São Paulo"
                                        value={formData.city}
                                        onChange={e => setFormData({ ...formData, city: e.target.value })}
                                    />
                                </div>
                                <div className="space-y-1 col-span-2 md:col-span-2">
                                    <label className={labelClasses}>UF</label>
                                    <input
                                        type="text" required
                                        maxLength={2}
                                        className={`${inputClasses} uppercase`}
                                        placeholder="SP"
                                        value={formData.state}
                                        onChange={e => setFormData({ ...formData, state: e.target.value.toUpperCase() })}
                                    />
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Senhas */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5 pt-4 border-t border-slate-100">
                        <div className="space-y-1">
                            <label className={labelClasses}>Senha</label>
                            <div className="relative">
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
                                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                </button>
                            </div>
                        </div>
                        <div className="space-y-1">
                            <label className={labelClasses}>Confirmar Senha</label>
                            <div className="relative">
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
                                    {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
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
        </div>
    );
};

export default Register;
