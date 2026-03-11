import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../services/api';
import { Icons } from '../constants';
import CustomAlert from '../components/CustomAlert';

const RecoverPassword: React.FC = () => {
    const [email, setEmail] = useState('');
    const [phone, setPhone] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [isGoogleAccount, setIsGoogleAccount] = useState(false);
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
        <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-4 md:p-6 relative font-sans">
            <div className="w-full max-w-md animate-in fade-in zoom-in duration-500">
                <div className="w-full bg-white p-5 md:p-10 rounded-3xl md:rounded-[3rem] shadow-2xl relative">
                    {/* Fechar Modal Recover */}
                    <button
                        onClick={() => navigate('/login')}
                        className="absolute top-4 right-4 md:top-6 md:right-6 p-2 bg-slate-50 text-slate-400 rounded-full hover:bg-slate-100 hover:text-slate-600 transition-all active:scale-95"
                        title="Voltar"
                    >
                        <Icons.X className="w-5 h-5" />
                    </button>

                    <div className="flex flex-col items-center mb-5 md:mb-8 text-center pt-2 md:pt-0">
                        <div className="w-16 h-16 md:w-20 md:h-20 bg-indigo-600 rounded-[1.2rem] md:rounded-[1.5rem] flex items-center justify-center shadow-2xl shadow-indigo-500/30 mb-4 md:mb-6 transform -rotate-3 transition-transform hover:rotate-0 duration-500">
                            <span className="text-white font-black text-2xl md:text-3xl tracking-tighter">DA</span>
                        </div>
                        <h1 className="text-2xl md:text-3xl font-black text-slate-800 uppercase tracking-tighter italic leading-none">Recuperar Conta</h1>
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-2 md:mt-3">Valide seu telefone e e-mail</p>
                    </div>

                    <form onSubmit={handleRecover} className="space-y-3 md:space-y-4">
                        <div className="space-y-1 md:space-y-2">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4">E-mail Cadastrado</label>
                            <div className="relative group">
                                <div className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-indigo-500 transition-colors">
                                    <Icons.Mail className="w-5 h-5" />
                                </div>
                                <input
                                    type="email"
                                    className="w-full pl-14 pr-4 py-3 md:py-4 bg-slate-50 border-none rounded-2xl focus:ring-4 focus:ring-indigo-100 transition-all font-bold text-sm"
                                    placeholder="seu@email.com"
                                    value={email}
                                    onChange={e => setEmail(e.target.value)}
                                    required
                                />
                            </div>
                        </div>

                        <div className="space-y-1 md:space-y-2">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4">WhatsApp (DDD + Número)</label>
                            <div className="relative group">
                                <div className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-indigo-500 transition-colors">
                                    <Icons.Phone className="w-5 h-5" />
                                </div>
                                <input
                                    type="tel"
                                    className="w-full pl-14 pr-4 py-3 md:py-4 bg-slate-50 border-none rounded-2xl focus:ring-4 focus:ring-indigo-100 transition-all font-bold text-sm"
                                    placeholder="(00) 00000-0000"
                                    value={phone}
                                    onChange={e => setPhone(maskPhone(e.target.value))}
                                    onBlur={async () => {
                                        const cleanPhone = phone.replace(/\D/g, '');
                                        if (email && cleanPhone.length === 11) {
                                            try {
                                                const { isGoogle } = await api.checkGoogleAccount(email, cleanPhone);
                                                setIsGoogleAccount(isGoogle);
                                                if (isGoogle) {
                                                    setAlertState({
                                                        isOpen: true,
                                                        title: 'Conta Google Detectada',
                                                        message: 'Esta conta foi criada usando o Google. Por segurança, você deve recuperar sua senha através do site do Google ou simplesmente fazer login usando o botão "Entrar com Google".',
                                                        type: 'INFO',
                                                        onConfirm: () => setAlertState(prev => ({ ...prev, isOpen: false })),
                                                        onCancel: undefined
                                                    });
                                                    setPassword('');
                                                }
                                            } catch (e) {
                                                console.error('Check google account error:', e);
                                            }
                                        }
                                    }}
                                    required
                                />
                            </div>
                        </div>

                        <div className="space-y-1 md:space-y-2 pt-2 border-t border-slate-100">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4 mt-2 block">Crie uma Nova Senha</label>
                            <div className="relative group">
                                <div className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-indigo-500 transition-colors">
                                    <Icons.Lock className="w-5 h-5" />
                                </div>
                                <input
                                    type={showPassword ? "text" : "password"}
                                    className="w-full pl-14 pr-12 py-3 md:py-4 bg-slate-50 border-none rounded-2xl focus:ring-4 focus:ring-indigo-100 transition-all font-bold text-sm disabled:opacity-50"
                                    placeholder={isGoogleAccount ? "Recuperação via Google" : "••••••••"}
                                    value={password}
                                    onChange={e => setPassword(e.target.value)}
                                    disabled={isGoogleAccount}
                                    required={!isGoogleAccount}
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword(!showPassword)}
                                    className="absolute right-4 top-1/2 -translate-y-1/2 p-2 text-slate-400 hover:text-indigo-600 transition-all rounded-xl active:scale-90"
                                >
                                    {showPassword ? <Icons.EyeOff className="w-5 h-5" /> : <Icons.Eye className="w-5 h-5" />}
                                </button>
                            </div>
                        </div>

                        <button
                            disabled={isLoading || isGoogleAccount}
                            type="submit"
                            className="w-full bg-slate-800 text-white py-3 md:py-4 rounded-2xl font-black uppercase text-xs tracking-widest hover:bg-slate-900 transition-all shadow-xl shadow-slate-200 mt-2 md:mt-4 disabled:opacity-50 active:scale-[0.98]"
                        >
                            {isGoogleAccount ? 'Use o Google Login' : (isLoading ? 'Aguarde...' : 'Mudar Senha')}
                        </button>
                    </form>
                </div>

                <p className="text-center mt-4 md:mt-12 text-slate-600 text-[9px] md:text-[10px] font-black uppercase tracking-[0.3em]">
                    Fransoft Developer®
                </p>
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
