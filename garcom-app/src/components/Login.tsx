import React, { useState } from 'react';
import { db } from '../api';
import { Eye, EyeOff, Lock, Mail, Key } from 'lucide-react';
import type { User } from '../types';

interface LoginProps {
    onLoginSuccess: (user: User) => void;
    initialUser?: User;
}

const Login: React.FC<LoginProps> = ({ onLoginSuccess, initialUser }) => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [recoveryCode, setRecoveryCode] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [showNewPassword, setShowNewPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);
    const [error, setError] = useState('');
    const [view, setView] = useState<'LOGIN' | 'FORGOT' | 'RESET' | 'FORCE_RESET' | 'SHOW_CODE'>('LOGIN');
    const [loading, setLoading] = useState(false);
    const [loggedInUser, setLoggedInUser] = useState<User | null>(initialUser || null);

    const handleLogout = () => {
        const AUTH_KEY = 'delivery_fast_garcom_auth';
        localStorage.removeItem(AUTH_KEY);
        window.location.reload();
    };

    React.useEffect(() => {
        if (initialUser && initialUser.mustChangePassword) {
            setEmail(initialUser.email);
            setView('FORCE_RESET');
        }
    }, [initialUser]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setLoading(true);
        try {
            const user = await db.login(email.toLowerCase().trim(), password);
            setLoggedInUser(user);

            if (user.mustChangePassword) {
                setView('FORCE_RESET');
            } else {
                onLoginSuccess(user);
            }
        } catch (err: any) {
            setError(err.message || 'E-mail ou senha incorretos.');
        } finally {
            setLoading(false);
        }
    };

    const handleForgot = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setLoading(true);
        try {
            const isValid = await db.verifyRecoveryCode(email.toLowerCase().trim(), recoveryCode.toUpperCase().trim());
            if (isValid) setView('RESET');
            else setError('E-mail ou Código de Recuperação inválidos.');
        } catch (err: any) {
            setError('Erro ao validar código.');
        } finally {
            setLoading(false);
        }
    };

    const handleReset = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        if (newPassword !== confirmPassword) return setError('As senhas não coincidem.');
        if (newPassword === '123') return setError('A nova senha não pode ser a senha padrão.');

        setLoading(true);
        try {
            await db.resetPassword({
                email: loggedInUser?.email || email.toLowerCase().trim(),
                recoveryCode: (loggedInUser?.recoveryCode || recoveryCode).toUpperCase().trim(),
                newPassword
            });

            // Update local state and localStorage to prevent loop on reload
            if (loggedInUser) {
                const updatedUser = { ...loggedInUser, mustChangePassword: false };
                setLoggedInUser(updatedUser);

                // Update localStorage if it exists
                const AUTH_KEY = 'delivery_fast_garcom_auth';
                const saved = localStorage.getItem(AUTH_KEY);
                if (saved) {
                    const parsed = JSON.parse(saved);
                    parsed.user = updatedUser;
                    localStorage.setItem(AUTH_KEY, JSON.stringify(parsed));
                }
            }

            setView('SHOW_CODE');
        } catch (err: any) {
            setError(err.message || 'Erro ao redefinir senha.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen w-full flex items-center justify-center bg-slate-900 p-6 font-sans">
            <div className="w-full max-w-md animate-fade-in">
                <div className="bg-white p-10 rounded-[3rem] shadow-2xl shadow-black/40 border border-slate-800">
                    <div className="flex flex-col items-center mb-8 md:mb-10 text-center">
                        <div className="w-16 h-16 md:w-20 md:h-20 bg-blue-600 rounded-[1.2rem] md:rounded-[1.5rem] flex items-center justify-center shadow-2xl shadow-blue-500/30 mb-4 md:mb-6 transform -rotate-3 transition-transform hover:rotate-0 duration-500">
                            <span className="text-white font-black text-2xl md:text-3xl tracking-tighter">GA</span>
                        </div>
                        <h1 className="text-2xl md:text-3xl font-black text-slate-900 tracking-tighter uppercase leading-none">GARÇOM APP</h1>
                        <p className="text-slate-400 text-[10px] font-black mt-2 md:mt-3 tracking-[0.2em] uppercase">
                            {view === 'LOGIN' ? 'Acesso ao Sistema' :
                                view === 'FORGOT' ? 'Recuperação de Acesso' :
                                    view === 'FORCE_RESET' ? 'Troca de Senha Obrigatória' :
                                        view === 'SHOW_CODE' ? 'Segurança Concluída' : 'Nova Senha'}
                        </p>
                    </div>

                    {error && (
                        <div className="p-4 mb-8 bg-red-50 border border-red-100 text-red-600 text-xs font-black rounded-2xl text-center animate-pulse-subtle uppercase tracking-tight">
                            {error}
                        </div>
                    )}

                    {view === 'LOGIN' && (
                        <form onSubmit={handleSubmit} className="space-y-6">
                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-slate-400 uppercase ml-4 tracking-widest">E-mail Corporativo</label>
                                <div className="relative group">
                                    <div className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-blue-500 transition-colors">
                                        <Mail size={18} />
                                    </div>
                                    <input
                                        type="email"
                                        required
                                        placeholder="seu@email.com"
                                        className="w-full pl-14 pr-6 py-5 bg-slate-50 border-none rounded-[2rem] focus:ring-2 focus:ring-blue-500/20 transition-all text-slate-700 font-bold outline-none text-sm placeholder-slate-300"
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value.toLowerCase())}
                                    />
                                </div>
                            </div>

                            <div className="space-y-2">
                                <div className="flex justify-between items-center px-4">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Sua Senha</label>
                                    <button type="button" onClick={() => setView('FORGOT')} className="text-[10px] text-blue-600 font-black hover:text-blue-700 uppercase tracking-widest">Esqueceu?</button>
                                </div>
                                <div className="relative group">
                                    <div className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-blue-500 transition-colors">
                                        <Lock size={18} />
                                    </div>
                                    <input
                                        type={showPassword ? "text" : "password"}
                                        required
                                        placeholder="••••••••"
                                        className="w-full pl-14 pr-14 py-5 bg-slate-50 border-none rounded-[2rem] focus:ring-2 focus:ring-blue-500/20 transition-all text-slate-700 font-bold outline-none text-sm placeholder-slate-300"
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowPassword(!showPassword)}
                                        className="absolute right-5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-blue-600 transition-colors"
                                    >
                                        {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                                    </button>
                                </div>
                            </div>

                            <button
                                type="submit"
                                disabled={loading}
                                className="w-full py-5 bg-slate-900 hover:bg-black text-white font-black rounded-[2rem] shadow-xl shadow-slate-900/20 transition-all active:scale-[0.98] disabled:opacity-50 uppercase text-[11px] tracking-[0.2em]"
                            >
                                {loading ? 'Autenticando...' : 'Entrar no Sistema'}
                            </button>
                        </form>
                    )}

                    {view === 'FORGOT' && (
                        <form onSubmit={handleForgot} className="space-y-6">
                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-slate-400 uppercase ml-4 tracking-widest">Confirme seu E-mail</label>
                                <div className="relative">
                                    <div className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-300">
                                        <Mail size={18} />
                                    </div>
                                    <input type="email" placeholder="seu@email.com" required className="w-full pl-14 pr-6 py-5 bg-slate-50 border-none rounded-[2rem] text-slate-700 font-bold outline-none text-sm" value={email} onChange={(e) => setEmail(e.target.value.toLowerCase())} />
                                </div>
                            </div>
                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-slate-400 uppercase ml-4 tracking-widest">Código pessoal (6 dígitos)</label>
                                <div className="relative">
                                    <div className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-300">
                                        <Key size={18} />
                                    </div>
                                    <input type="text" required maxLength={6} placeholder="ABC123" className="w-full pl-14 pr-6 py-5 bg-slate-50 border-none rounded-[2rem] text-slate-700 font-black tracking-[0.5em] outline-none uppercase text-center" value={recoveryCode} onChange={(e) => setRecoveryCode(e.target.value)} />
                                </div>
                            </div>
                            <button type="submit" disabled={loading} className="w-full py-5 bg-blue-600 hover:bg-blue-700 text-white font-black rounded-[2rem] shadow-xl shadow-blue-500/30 uppercase text-[11px] tracking-widest">Validar Acesso</button>
                            <button type="button" onClick={() => setView('LOGIN')} className="w-full text-slate-400 text-[10px] font-black uppercase tracking-widest hover:text-slate-600 transition-colors">Voltar ao Início</button>
                        </form>
                    )}

                    {(view === 'RESET' || view === 'FORCE_RESET') && (
                        <form onSubmit={handleReset} className="space-y-6">
                            <div className="p-4 bg-amber-50 border border-amber-100 rounded-2xl mb-4">
                                <p className="text-[9px] font-black text-amber-600 uppercase tracking-tight leading-relaxed">
                                    {view === 'FORCE_RESET' ? 'Você está usando a senha padrão. Por segurança, crie uma senha forte agora.' : 'Agora você pode definir sua nova senha de acesso.'}
                                </p>
                            </div>
                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-slate-400 uppercase ml-4">Nova Senha</label>
                                <div className="relative">
                                    <input
                                        type={showNewPassword ? "text" : "password"}
                                        required
                                        placeholder="••••••••"
                                        className="w-full p-5 bg-slate-50 border-none rounded-[2rem] text-slate-700 font-bold outline-none text-sm group-focus:ring-2 group-focus:ring-blue-500/20 transition-all"
                                        value={newPassword}
                                        onChange={(e) => setNewPassword(e.target.value)}
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowNewPassword(!showNewPassword)}
                                        className="absolute right-5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-blue-600 transition-colors"
                                    >
                                        {showNewPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                                    </button>
                                </div>
                            </div>
                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-slate-400 uppercase ml-4">Confirme a Senha</label>
                                <div className="relative">
                                    <input
                                        type={showConfirmPassword ? "text" : "password"}
                                        required
                                        placeholder="••••••••"
                                        className="w-full p-5 bg-slate-50 border-none rounded-[2rem] text-slate-700 font-bold outline-none text-sm group-focus:ring-2 group-focus:ring-blue-500/20 transition-all"
                                        value={confirmPassword}
                                        onChange={(e) => setConfirmPassword(e.target.value)}
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                                        className="absolute right-5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-blue-600 transition-colors"
                                    >
                                        {showConfirmPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                                    </button>
                                </div>
                            </div>
                            <button type="submit" disabled={loading} className="w-full py-5 bg-emerald-600 hover:bg-emerald-700 text-white font-black rounded-[2rem] shadow-xl shadow-emerald-500/30 uppercase text-[11px] tracking-widest">
                                {loading ? 'Salvando...' : 'Salvar Nova Senha'}
                            </button>

                            {view === 'FORCE_RESET' && (
                                <button
                                    type="button"
                                    onClick={handleLogout}
                                    className="w-full text-slate-400 text-[10px] font-black uppercase tracking-widest hover:text-slate-600 transition-colors pt-2"
                                >
                                    Voltar para o Login
                                </button>
                            )}
                        </form>
                    )}

                    {view === 'SHOW_CODE' && (
                        <div className="space-y-8 animate-in zoom-in duration-500">
                            {loggedInUser ? (
                                <>
                                    <div className="text-center">
                                        <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-4">
                                            <Key size={32} />
                                        </div>
                                        <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest">Segurança Concluída!</h3>
                                        <p className="text-[10px] text-slate-400 font-bold mt-2 leading-relaxed uppercase">
                                            Guarde seu código de recuperação em um local seguro. Você precisará dele se esquecer sua senha futuramente.
                                        </p>
                                    </div>

                                    <div className="p-8 bg-slate-50 rounded-[2rem] border-2 border-dashed border-slate-200 flex flex-col items-center">
                                        <span className="text-[9px] font-black text-slate-400 uppercase tracking-[0.3em] mb-4">Seu Código Pessoal:</span>
                                        <span className="text-4xl font-black text-slate-900 tracking-[0.2em] italic">{loggedInUser.recoveryCode}</span>
                                    </div>

                                    <button
                                        onClick={() => onLoginSuccess(loggedInUser)}
                                        className="w-full py-5 bg-slate-900 text-white rounded-[2rem] font-black uppercase text-[11px] tracking-[0.2em] shadow-2xl active:scale-[0.98] transition-all"
                                    >
                                        Entrar no Painel
                                    </button>
                                </>
                            ) : (
                                <>
                                    <div className="text-center">
                                        <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-4">
                                            <Key size={32} />
                                        </div>
                                        <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest">Senha Alterada!</h3>
                                        <p className="text-[10px] text-slate-400 font-bold mt-2 leading-relaxed uppercase">
                                            Sua senha foi redefinida com sucesso. Por favor, faça login agora com sua nova senha corporativa.
                                        </p>
                                    </div>

                                    <button
                                        onClick={() => setView('LOGIN')}
                                        className="w-full py-5 bg-slate-900 text-white rounded-[2rem] font-black uppercase text-[11px] tracking-[0.2em] shadow-2xl active:scale-[0.98] transition-all"
                                    >
                                        Ir para o Login
                                    </button>
                                </>
                            )}
                        </div>
                    )}
                </div>

                <p className="text-center mt-10 text-slate-400 text-[9px] font-black uppercase tracking-[0.3em]">
                    Fransoft Developer ®
                </p>
            </div>
        </div>
    );
};

export default Login;
