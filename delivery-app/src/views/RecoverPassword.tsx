import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../services/api';
import { Icons } from '../constants';
import CustomAlert from '../components/CustomAlert';

const RecoverPassword: React.FC = () => {
    const [email, setEmail] = useState('');
    const [phone, setPhone] = useState('');
    const [password, setPassword] = useState('');
    const [isLoading, setIsLoading] = useState(false);
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

    const handleRecover = async (e: React.FormEvent) => {
        e.preventDefault();
        const cleanPhone = phone.replace(/\D/g, '');

        if (cleanPhone.length !== 11) {
            setAlertState({
                isOpen: true,
                title: 'Atenção',
                message: 'Por favor, insira um WhatsApp válido com 11 dígitos.',
                type: 'INFO',
                onConfirm: () => setAlertState(prev => ({ ...prev, isOpen: false })),
                onCancel: undefined
            });
            return;
        }

        if (password.length < 6) {
            setAlertState({
                isOpen: true,
                title: 'Atenção',
                message: 'A nova senha deve possuir pelo menos 6 caracteres.',
                type: 'INFO',
                onConfirm: () => setAlertState(prev => ({ ...prev, isOpen: false })),
                onCancel: undefined
            });
            return;
        }

        setIsLoading(true);
        try {
            await api.recoverPassword(email, cleanPhone, password);
            setAlertState({
                isOpen: true,
                title: 'Sucesso',
                message: 'Senha recuperada e atualizada com sucesso! Você já pode fazer login com a nova senha.',
                type: 'SUCCESS',
                onConfirm: () => navigate('/login'),
                onCancel: undefined
            });
        } catch (err: any) {
            setAlertState({
                isOpen: true,
                title: 'Recuperação Inválida',
                message: err.message || 'Verifique se o e-mail e o número de telefone estão corretos e correspondem juntos a sua conta.',
                type: 'DANGER',
                onConfirm: () => setAlertState(prev => ({ ...prev, isOpen: false })),
                onCancel: undefined
            });
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4 md:p-6 relative">

            <div className="w-full max-w-md bg-white p-6 md:p-10 rounded-[2.5rem] md:rounded-[3rem] shadow-xl shadow-slate-200/50 border border-slate-100 relative">
                {/* Fechar Modal Recover */}
                <button
                    onClick={() => navigate('/login')}
                    className="absolute top-4 right-4 md:top-6 md:right-6 p-2 bg-slate-50 text-slate-400 rounded-full hover:bg-slate-100 hover:text-slate-600 transition-all active:scale-95"
                    title="Voltar"
                >
                    <Icons.X className="w-5 h-5" />
                </button>

                <div className="text-center mb-8">
                    <h1 className="text-2xl font-black text-slate-800 uppercase tracking-tighter italic leading-snug">Recuperar Conta</h1>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-2">Valide seu telefone e e-mail</p>
                </div>

                <form onSubmit={handleRecover} className="space-y-5">
                    <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4">E-mail Cadastrado</label>
                        <input
                            type="email"
                            className="w-full p-4 bg-slate-50 border-none rounded-2xl focus:ring-4 focus:ring-indigo-100 transition-all font-bold text-sm"
                            placeholder="seu@email.com"
                            value={email}
                            onChange={e => setEmail(e.target.value)}
                            required
                        />
                    </div>

                    <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4">WhatsApp (DDD + Número)</label>
                        <input
                            type="tel"
                            className="w-full p-4 bg-slate-50 border-none rounded-2xl focus:ring-4 focus:ring-indigo-100 transition-all font-bold text-sm"
                            placeholder="(00) 00000-0000"
                            value={phone}
                            onChange={e => setPhone(maskPhone(e.target.value))}
                            required
                        />
                    </div>

                    <div className="space-y-2 pt-2 border-t border-slate-100">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4 mt-2 block">Crie uma Nova Senha</label>
                        <input
                            type="password"
                            className="w-full p-4 bg-slate-50 border-none rounded-2xl focus:ring-4 focus:ring-indigo-100 transition-all font-bold text-sm"
                            placeholder="••••••••"
                            value={password}
                            onChange={e => setPassword(e.target.value)}
                            required
                        />
                    </div>

                    <button
                        disabled={isLoading}
                        type="submit"
                        className="w-full bg-slate-800 text-white py-5 rounded-2xl font-black uppercase text-xs tracking-widest hover:bg-slate-900 transition-all shadow-xl shadow-slate-200 mt-4 disabled:opacity-50"
                    >
                        {isLoading ? 'Aguarde...' : 'Mudar Senha'}
                    </button>
                </form>
            </div>

            <CustomAlert
                isOpen={alertState.isOpen}
                title={alertState.title}
                message={alertState.message}
                type={alertState.type}
                onConfirm={alertState.onConfirm}
                onCancel={alertState.onCancel}
            />
        </div >
    );
};

export default RecoverPassword;
