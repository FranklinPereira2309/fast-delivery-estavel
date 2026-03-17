import React, { useState } from 'react';
import { db } from '../services/db';
import { X, Lock, Loader2, AlertCircle } from 'lucide-react';
import type { Waiter } from '../types';

interface WaiterAuthModalProps {
    isOpen: boolean;
    waiter: Waiter | null;
    actionDescription: string;
    onSuccess: (waiterId: string) => void;
    onCancel: () => void;
}

const WaiterAuthModal: React.FC<WaiterAuthModalProps> = ({ isOpen, waiter, actionDescription, onSuccess, onCancel }) => {
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    if (!isOpen || !waiter) return null;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');

        if (!password.trim()) {
            setError('Por favor, digite a senha.');
            return;
        }

        if (!waiter.email) {
            setError('Garçom sem e-mail cadastrado no sistema.');
            return;
        }

        setLoading(true);
        try {
            // Check credentials natively without messing up the active login session
            const authUser = await db.verifyWaiterLogin(waiter.email, password);
            if (authUser && authUser.id) {
                // If it resolves, Waiter ID matches User WaiterID natively
                onSuccess(authUser.waiterId || authUser.id);
                setPassword('');
            } else {
                setError('Senha incorreta.');
            }
        } catch (err: any) {
            setError('Falha ao autenticar.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white dark:bg-slate-900 rounded-[2.5rem] shadow-2xl w-full max-w-sm overflow-hidden animate-in zoom-in-95 duration-300 border border-transparent dark:border-slate-800">
                <div className="relative p-6 pt-8 bg-slate-50 dark:bg-slate-800/50 border-b border-slate-100 dark:border-slate-800 flex flex-col items-center">
                    <button
                        onClick={onCancel}
                        className="absolute right-4 top-4 p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-full transition-all"
                    >
                        <X size={20} />
                    </button>
                    <div className="w-16 h-16 bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-2xl flex items-center justify-center mb-4 shadow-inner">
                        <Lock size={32} />
                    </div>
                    <h3 className="text-xl font-black text-slate-800 dark:text-white uppercase tracking-tighter text-center">
                        Autenticação Necessária
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400 font-bold uppercase tracking-widest text-center mt-1">
                        {waiter.name}
                    </p>
                </div>

                <form onSubmit={handleSubmit} className="p-8 space-y-6">
                    <div className="text-center">
                        <p className="text-xs font-bold text-slate-600 dark:text-slate-400 uppercase">
                            Ação: <span className="text-blue-600 dark:text-blue-400">{actionDescription}</span>
                        </p>
                    </div>

                    <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest ml-1">Senha (PIN) do Garçom</label>
                        <input
                            type="password"
                            autoFocus
                            placeholder="Digite sua senha"
                            className="w-full text-center p-4 bg-slate-50 dark:bg-slate-800 border-2 border-slate-200 dark:border-slate-700 rounded-2xl text-lg font-black outline-none focus:ring-4 focus:ring-blue-50 dark:focus:ring-blue-900/20 focus:border-blue-500 dark:focus:border-blue-400 transition-all tracking-widest placeholder:tracking-normal dark:text-white"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                        />
                    </div>

                    {error && (
                        <div className="p-3 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-xl text-xs font-bold uppercase tracking-widest text-center flex items-center justify-center gap-2">
                            <AlertCircle size={14} />
                            {error}
                        </div>
                    )}

                    <div className="pt-2">
                        <button
                            type="submit"
                            disabled={loading || !password}
                            className={`w-full py-4 text-white rounded-2xl text-[11px] font-black uppercase tracking-widest transition-all shadow-xl flex justify-center items-center ${loading || !password ? 'bg-slate-300 shadow-none' : 'bg-blue-600 hover:bg-blue-700 shadow-blue-500/30'}`}
                        >
                            {loading ? <Loader2 size={18} className="animate-spin" /> : 'Confirmar'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default WaiterAuthModal;
