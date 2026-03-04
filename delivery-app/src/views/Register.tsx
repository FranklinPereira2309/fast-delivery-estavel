import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../services/api';

const Register: React.FC = () => {
    const [formData, setFormData] = useState({
        name: '',
        email: '',
        phone: '',
        password: '',
        confirmPassword: ''
    });
    const [error, setError] = useState('');
    const navigate = useNavigate();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (formData.password !== formData.confirmPassword) {
            setError('Senhas não conferem');
            return;
        }
        try {
            await api.register(formData.name, formData.email, formData.phone, formData.password);
            alert('Cadastro realizado! Agora faça seu login.');
            navigate('/login');
        } catch (err: any) {
            setError(err.message);
        }
    };

    return (
        <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6 py-12">
            <div className="w-full max-w-md bg-white rounded-[2.5rem] shadow-xl shadow-slate-200/50 p-10 border border-slate-100">
                <div className="flex flex-col items-center mb-10">
                    <h1 className="text-3xl font-black text-slate-800 tracking-tighter uppercase">Criar Conta</h1>
                    <p className="text-slate-400 font-bold text-[10px] uppercase tracking-widest mt-2">Preencha seus dados abaixo</p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-5">
                    {error && <p className="text-rose-500 text-xs font-bold text-center uppercase tracking-widest">{error}</p>}
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
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">WhatsApp / Telefone</label>
                        <input
                            type="tel" required
                            className="w-full p-4 bg-slate-50 border-none rounded-2xl focus:ring-4 focus:ring-indigo-50 transition-all font-bold text-sm"
                            placeholder="(00) 00000-0000"
                            value={formData.phone}
                            onChange={e => setFormData({ ...formData, phone: e.target.value })}
                        />
                    </div>
                    <div className="space-y-1">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Senha</label>
                        <input
                            type="password" required
                            className="w-full p-4 bg-slate-50 border-none rounded-2xl focus:ring-4 focus:ring-indigo-50 transition-all font-bold text-sm"
                            placeholder="Mínimo 6 caracteres"
                            value={formData.password}
                            onChange={e => setFormData({ ...formData, password: e.target.value })}
                        />
                    </div>

                    <button type="submit" className="w-full bg-indigo-600 text-white py-5 rounded-2xl font-black uppercase text-xs tracking-widest hover:bg-indigo-700 transition-all shadow-2xl shadow-indigo-100 mt-4 active:scale-[0.98]">
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
