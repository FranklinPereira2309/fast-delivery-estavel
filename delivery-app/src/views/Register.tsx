import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../services/api';

const Register: React.FC = () => {
    const [formData, setFormData] = useState({
        name: '',
        email: '',
        phone: '',
        cep: '',
        complement: '',
        password: '',
        confirmPassword: ''
    });
    const [isLoadingCep, setIsLoadingCep] = useState(false);
    const [error, setError] = useState('');
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
                console.log('ViaCEP data:', data);
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
                formData.complement
            );
            alert('Cadastro realizado com sucesso! Favor realizar o login.');
            navigate('/login');
        } catch (err: any) {
            setError(err.message || 'Erro ao realizar cadastro');
        }
    };

    return (
        <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6 py-12">
            <div className="w-full max-w-md bg-white rounded-[2.5rem] shadow-xl shadow-slate-200/50 p-10 border border-slate-100">
                <div className="flex flex-col items-center mb-10">
                    <h1 className="text-3xl font-black text-slate-800 tracking-tighter uppercase">Criar Conta</h1>
                    <p className="text-slate-400 font-bold text-[10px] uppercase tracking-widest mt-2">Cadastre-se para fazer seus pedidos</p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                    {error && (
                        <div className="bg-rose-50 p-3 rounded-xl border border-rose-100">
                            <p className="text-rose-600 text-[10px] font-black text-center uppercase tracking-widest">{error}</p>
                        </div>
                    )}

                    <div className="space-y-1">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Nome Completo</label>
                        <input
                            type="text" required
                            className="w-full p-4 bg-slate-50 border-none rounded-2xl focus:ring-4 focus:ring-indigo-50 transition-all font-bold text-sm"
                            placeholder="Como quer ser chamado?"
                            value={formData.name}
                            onChange={e => setFormData({ ...formData, name: e.target.value })}
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">E-mail</label>
                            <input
                                type="email" required
                                className="w-full p-4 bg-slate-50 border-none rounded-2xl focus:ring-4 focus:ring-indigo-50 transition-all font-bold text-sm"
                                placeholder="seu@email.com"
                                value={formData.email}
                                onChange={e => setFormData({ ...formData, email: e.target.value })}
                            />
                        </div>
                        <div className="space-y-1">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">WhatsApp</label>
                            <input
                                type="tel" required
                                className="w-full p-4 bg-slate-50 border-none rounded-2xl focus:ring-4 focus:ring-indigo-50 transition-all font-bold text-sm"
                                placeholder="(00) 00000-0000"
                                value={formData.phone}
                                onChange={e => setFormData({ ...formData, phone: e.target.value })}
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">CEP</label>
                            <div className="relative">
                                <input
                                    type="text" required
                                    maxLength={9}
                                    className="w-full p-4 bg-slate-50 border-none rounded-2xl focus:ring-4 focus:ring-indigo-50 transition-all font-bold text-sm"
                                    placeholder="00000-000"
                                    value={formData.cep}
                                    onBlur={handleCepBlur}
                                    onChange={e => setFormData({ ...formData, cep: e.target.value })}
                                />
                                {isLoadingCep && <div className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>}
                            </div>
                        </div>
                        <div className="space-y-1">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Complemento</label>
                            <input
                                type="text"
                                className="w-full p-4 bg-slate-50 border-none rounded-2xl focus:ring-4 focus:ring-indigo-50 transition-all font-bold text-sm"
                                placeholder="Apt, bloco..."
                                value={formData.complement}
                                onChange={e => setFormData({ ...formData, complement: e.target.value })}
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Senha</label>
                            <input
                                type="password" required
                                className="w-full p-4 bg-slate-50 border-none rounded-2xl focus:ring-4 focus:ring-indigo-50 transition-all font-bold text-sm"
                                placeholder="******"
                                value={formData.password}
                                onChange={e => setFormData({ ...formData, password: e.target.value })}
                            />
                        </div>
                        <div className="space-y-1">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Confirmar</label>
                            <input
                                type="password" required
                                className="w-full p-4 bg-slate-50 border-none rounded-2xl focus:ring-4 focus:ring-indigo-50 transition-all font-bold text-sm"
                                placeholder="******"
                                value={formData.confirmPassword}
                                onChange={e => setFormData({ ...formData, confirmPassword: e.target.value })}
                            />
                        </div>
                    </div>

                    <button type="submit" className="w-full bg-slate-800 text-white py-5 rounded-2xl font-black uppercase text-xs tracking-widest hover:bg-slate-900 transition-all shadow-2xl shadow-indigo-100 mt-4 active:scale-[0.98]">
                        Finalizar Cadastro
                    </button>
                </form>

                <div className="mt-10 pt-8 border-t border-slate-100 text-center">
                    <p className="text-slate-400 text-xs font-semibold">
                        Já tem conta?{' '}
                        <Link to="/login" className="text-indigo-600 font-black uppercase tracking-tighter hover:underline">Entrar</Link>
                    </p>
                </div>
            </div>
        </div>
    );
};

export default Register;
