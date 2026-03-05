import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../services/api';
import { Icons } from '../constants';
import CustomAlert from '../components/CustomAlert';

const Login: React.FC = () => {
    const [phone, setPhone] = useState('');
    const [password, setPassword] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [alertState, setAlertState] = useState({
        isOpen: false,
        title: '',
        message: '',
        type: 'INFO' as 'INFO' | 'DANGER' | 'SUCCESS',
        onConfirm: () => { }
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

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        const cleanPhone = phone.replace(/\D/g, '');

        if (cleanPhone.length !== 11) {
            setAlertState({
                isOpen: true,
                title: 'Atenção',
                message: 'Por favor, insira um WhatsApp válido com 11 dígitos.',
                type: 'INFO',
                onConfirm: () => setAlertState(prev => ({ ...prev, isOpen: false }))
            });
            return;
        }

        setIsLoading(true);
        try {
            await api.login(cleanPhone, password);
            navigate('/');
        } catch (err: any) {
            setAlertState({
                isOpen: true,
                title: 'Erro no Login',
                message: err.message || 'Verifique suas credenciais e tente novamente.',
                type: 'DANGER',
                onConfirm: () => setAlertState(prev => ({ ...prev, isOpen: false }))
            });
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4 md:p-6 relative">

            <div className="w-full max-w-md bg-white p-6 md:p-10 rounded-[2.5rem] md:rounded-[3rem] shadow-xl shadow-slate-200/50 border border-slate-100 relative">
                {/* Fechar Modal Login */}
                <button
                    onClick={() => navigate('/')}
                    className="absolute top-4 right-4 md:top-6 md:right-6 p-2 bg-slate-50 text-slate-400 rounded-full hover:bg-slate-100 hover:text-slate-600 transition-all active:scale-95"
                    title="Voltar"
                >
                    <Icons.X className="w-5 h-5" />
                </button>

                <div className="text-center mb-10">
                    <h1 className="text-3xl font-black text-slate-800 uppercase tracking-tighter italic">Delivery Fast</h1>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-2">Acesso do Cliente</p>
                </div>

                <form onSubmit={handleLogin} className="space-y-6">
                    <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4">WhatsApp</label>
                        <input
                            type="tel"
                            className="w-full p-5 bg-slate-50 border-none rounded-2xl focus:ring-4 focus:ring-indigo-100 transition-all font-bold text-sm"
                            placeholder="(00) 00000-0000"
                            value={phone}
                            onChange={e => setPhone(maskPhone(e.target.value))}
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
                    <button
                        onClick={() => setAlertState({
                            isOpen: true,
                            title: 'Recuperação',
                            message: 'Opção de recuperação em desenvolvimento. Entre em contato com o suporte.',
                            type: 'INFO',
                            onConfirm: () => setAlertState(prev => ({ ...prev, isOpen: false }))
                        })}
                        className="text-[10px] font-black text-slate-300 uppercase tracking-widest hover:text-indigo-400 transition-colors"
                    >
                        Esqueci minha senha
                    </button>
                </div>
            </div>

            <CustomAlert
                isOpen={alertState.isOpen}
                title={alertState.title}
                message={alertState.message}
                type={alertState.type}
                onConfirm={alertState.onConfirm}
                onCancel={() => setAlertState(prev => ({ ...prev, isOpen: false }))}
            />
        </div >
    );
};

export default Login;
