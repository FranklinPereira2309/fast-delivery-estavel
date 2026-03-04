import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../services/api';

const Login: React.FC = () => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const navigate = useNavigate();

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        try {
            await api.login(email, password);
            navigate('/');
        } catch (err) {
            alert('Erro ao entrar. Verifique suas credenciais.');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6">
            <div className="w-full max-w-md bg-white p-10 rounded-[3rem] shadow-xl shadow-slate-200/50 border border-slate-100">
                <div className="text-center mb-10">
                    <h1 className="text-3xl font-black text-slate-800 uppercase tracking-tighter italic">Delivery Fast</h1>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-2">Acesso do Cliente</p>
                </div>

                <form onSubmit={handleLogin} className="space-y-6">
                    <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4">E-mail</label>
                        <input
                            type="email"
                            className="w-full p-5 bg-slate-50 border-none rounded-2xl focus:ring-4 focus:ring-indigo-100 transition-all font-bold text-sm"
                            placeholder="seu@email.com"
                            value={email}
                            onChange={e => setEmail(e.target.value)}
                            required
                        />
                    </div>

                    <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4">Senha</label>
                        <input
                            type="password"
                            className="w-full p-5 bg-slate-50 border-none rounded-2xl focus:ring-4 focus:ring-indigo-100 transition-all font-bold text-sm"
                            placeholder="••••••••"
                            value={password}
                            onChange={e => setPassword(e.target.value)}
                            required
                        />
                    </div>

                    <button
                        disabled={isLoading}
                        type="submit"
                        className="w-full bg-slate-800 text-white py-5 rounded-2xl font-black uppercase text-xs tracking-widest hover:bg-slate-900 transition-all shadow-xl shadow-slate-200 mt-4"
                    >
                        {isLoading ? 'Entrando...' : 'Entrar'}
                    </button>
                </form>

                <div className="mt-10 text-center space-y-4">
                    <p className="text-xs font-bold text-slate-400">
                        Não tem conta? <button onClick={() => navigate('/register')} className="text-indigo-600 ml-1">Cadastre-se</button>
                    </p>
                    <button className="text-[10px] font-black text-slate-300 uppercase tracking-widest">Esqueci minha senha</button>
                </div>
            </div>
        </div>
    );
};

export default Login;
