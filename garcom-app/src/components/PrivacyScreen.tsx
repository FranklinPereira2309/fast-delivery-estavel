import React, { useState } from 'react';
import { db } from '../api';
import type { Waiter } from '../types';
import { Icons } from '../constants';

interface PrivacyScreenProps {
    user: Waiter | null;
    onUnlock: () => void;
}

const PrivacyScreen: React.FC<PrivacyScreenProps> = ({ user, onUnlock }) => {
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const handleUnlock = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user) return;

        setLoading(true);
        setError('');

        try {
            const dbUser = await db.login(user.email || '', password);
            if (dbUser) {
                onUnlock();
            } else {
                setError('Senha incorreta.');
            }
        } catch (err: any) {
            setError(err.message || 'Erro ao validar senha.');
        } finally {
            setLoading(false);
        }
    };

    if (!user) return null;

    return (
        <div className="fixed inset-0 z-[9999] bg-slate-900 flex flex-col items-center justify-center p-6 animate-in fade-in duration-300">
            <div className="flex flex-col items-center mb-10 w-full max-w-sm">
                <div className="w-24 h-24 bg-slate-800 rounded-full flex items-center justify-center mb-6 shadow-2xl relative overflow-hidden group">
                    <div className="absolute inset-0 bg-gradient-to-tr from-blue-600/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
                    <Icons.Lock className="w-10 h-10 text-white" />
                </div>
                <h2 className="text-3xl font-black text-white uppercase tracking-tighter text-center">App Bloqueado</h2>
                <p className="text-slate-400 font-bold mt-2 text-center text-sm uppercase tracking-widest">
                    Sessão inativa
                </p>
            </div>

            <div className="w-full max-w-sm bg-slate-800 p-8 rounded-[2.5rem] mt-6 shadow-2xl border border-white/5 relative overflow-hidden">
                <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-blue-500 to-indigo-500"></div>
                <div className="flex items-center gap-4 mb-8">
                    <div className="w-12 h-12 bg-slate-700 text-blue-400 rounded-2xl flex items-center justify-center font-black uppercase text-sm shadow-inner shrink-0">
                        {user.name.substring(0, 2)}
                    </div>
                    <div className="min-w-0">
                        <p className="font-black text-white uppercase text-sm tracking-tight truncate">{user.name}</p>
                        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest truncate">{user.email}</p>
                    </div>
                </div>

                <form onSubmit={handleUnlock} className="space-y-6">
                    <div className="space-y-2 relative">
                        <input
                            type="password"
                            placeholder="Sua senha"
                            value={password}
                            onChange={(e) => {
                                setPassword(e.target.value);
                                if (error) setError('');
                            }}
                            className="w-full p-4 bg-slate-900 border-none rounded-2xl text-white outline-none font-bold text-sm focus:ring-2 focus:ring-blue-500/50 transition-all placeholder:text-slate-500"
                            autoFocus
                        />
                    </div>

                    {error && (
                        <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-2xl text-red-500 text-xs font-bold text-center uppercase tracking-widest animate-in shake">
                            {error}
                        </div>
                    )}

                    <button
                        type="submit"
                        disabled={loading || !password}
                        className="w-full p-4 bg-blue-600 text-white font-black uppercase tracking-widest text-xs rounded-2xl disabled:opacity-50 disabled:cursor-not-allowed hover:bg-blue-500 active:scale-95 transition-all shadow-xl shadow-blue-900/50 flex items-center justify-center gap-2"
                    >
                        {loading ? 'Validando...' : 'Desbloquear'}
                        {!loading && <Icons.ChevronRight className="w-4 h-4" />}
                    </button>
                </form>
            </div>

            <button className="mt-12 text-[10px] text-slate-500 font-black uppercase tracking-widest hover:text-white transition-colors" onClick={() => window.location.reload()}>
                Sair / Trocar Usuário
            </button>
        </div>
    );
};

export default PrivacyScreen;
