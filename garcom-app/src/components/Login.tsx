import React, { useState } from 'react';
import { db } from '../api';
import type { User } from '../types';

interface LoginProps {
    onLoginSuccess: (user: User) => void;
}

const Login: React.FC<LoginProps> = ({ onLoginSuccess }) => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [recoveryCode, setRecoveryCode] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [error, setError] = useState('');
    const [view, setView] = useState<'LOGIN' | 'FORGOT' | 'RESET' | 'CODE_DISPLAY'>('LOGIN');

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        try {
            const user = await db.login(email, password);
            onLoginSuccess(user);
        } catch (err: any) {
            setError(err.message || 'E-mail ou senha incorretos.');
        }
    };

    const handleForgot = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        const isValid = await db.verifyRecoveryCode(email, recoveryCode);
        if (isValid) setView('RESET');
        else setError('E-mail ou Código de Recuperação inválidos.');
    };

    const handleReset = async (e: React.FormEvent) => {
        e.preventDefault();
        if (newPassword !== confirmPassword) return setError('As senhas não coincidem.');
        try {
            await db.resetPassword({ email, recoveryCode, newPassword });
            alert('Senha alterada com sucesso!');
            setView('LOGIN');
        } catch (err: any) {
            setError(err.message || 'Erro ao redefinir senha.');
        }
    };

    return (
        <div className="min-h-screen w-full flex items-center justify-center bg-slate-900 p-6">
            <div className="w-full max-w-sm">
                <div className="glass p-8 rounded-[2rem] shadow-2xl">
                    <div className="flex flex-col items-center mb-10 text-center">
                        <div className="w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center shadow-xl shadow-blue-500/20 mb-4 transform -rotate-6">
                            <span className="text-white text-3xl font-black italic">W</span>
                        </div>
                        <h1 className="text-2xl font-black text-white tracking-tight uppercase">App Garçom</h1>
                        <p className="text-slate-400 text-[10px] font-bold mt-2 tracking-widest uppercase">
                            {view === 'LOGIN' ? 'Delivery Fast Service' : 'Recuperação de Acesso'}
                        </p>
                    </div>

                    {error && (
                        <div className="p-4 mb-6 bg-red-500/20 border border-red-500/50 text-red-200 text-xs font-bold rounded-xl text-center animate-in slide-in-from-top-2">
                            {error}
                        </div>
                    )}

                    {view === 'LOGIN' && (
                        <form onSubmit={handleSubmit} className="space-y-6">
                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-slate-400 uppercase ml-1 tracking-widest">E-mail</label>
                                <input
                                    type="email"
                                    required
                                    placeholder="Seu e-mail corporativo"
                                    className="w-full p-4 bg-white/5 border border-white/10 rounded-2xl focus:ring-2 focus:ring-blue-500 transition-all text-white font-medium outline-none text-sm"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                />
                            </div>

                            <div className="space-y-2">
                                <div className="flex justify-between items-center ml-1">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Senha</label>
                                    <button type="button" onClick={() => setView('FORGOT')} className="text-[9px] text-blue-400 font-black hover:text-blue-300">ESQUECEU?</button>
                                </div>
                                <input
                                    type={showPassword ? "text" : "password"}
                                    required
                                    placeholder="••••••••"
                                    className="w-full p-4 bg-white/5 border border-white/10 rounded-2xl focus:ring-2 focus:ring-blue-500 transition-all text-white font-medium outline-none text-sm"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                />
                            </div>

                            <button type="submit" className="w-full py-4 bg-blue-600 hover:bg-blue-700 text-white font-black rounded-2xl shadow-lg shadow-blue-900/40 transition-all active:scale-[0.98] uppercase text-xs tracking-widest">
                                Acessar Painel
                            </button>
                        </form>
                    )}

                    {view === 'FORGOT' && (
                        <form onSubmit={handleForgot} className="space-y-6">
                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-slate-400 uppercase ml-1">E-mail</label>
                                <input type="email" required className="w-full p-4 bg-white/5 border border-white/10 rounded-2xl text-white outline-none text-sm" value={email} onChange={(e) => setEmail(e.target.value)} />
                            </div>
                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Código de Recuperação</label>
                                <input type="text" required maxLength={6} className="w-full p-4 bg-white/5 border border-white/10 rounded-2xl text-white text-center font-black tracking-widest outline-none uppercase" value={recoveryCode} onChange={(e) => setRecoveryCode(e.target.value.toUpperCase())} />
                            </div>
                            <button type="submit" className="w-full py-4 bg-blue-600 text-white font-black rounded-2xl uppercase text-xs tracking-widest">Validar</button>
                            <button type="button" onClick={() => setView('LOGIN')} className="w-full text-slate-400 text-[10px] font-black uppercase">Voltar</button>
                        </form>
                    )}

                    {view === 'RESET' && (
                        <form onSubmit={handleReset} className="space-y-6">
                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Nova Senha</label>
                                <input type="password" required className="w-full p-4 bg-white/5 border border-white/10 rounded-2xl text-white outline-none text-sm" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
                            </div>
                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Confirmar Senha</label>
                                <input type="password" required className="w-full p-4 bg-white/5 border border-white/10 rounded-2xl text-white outline-none text-sm" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />
                            </div>
                            <button type="submit" className="w-full py-4 bg-emerald-600 text-white font-black rounded-2xl uppercase text-xs tracking-widest">Salvar Nova Senha</button>
                        </form>
                    )}
                </div>
            </div>
        </div>
    );
};

export default Login;
