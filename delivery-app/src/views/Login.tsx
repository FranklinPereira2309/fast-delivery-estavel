import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../services/api';
import { Icons } from '../constants';
import CustomAlert from '../components/CustomAlert';
import { GoogleLogin } from '@react-oauth/google';

const Login: React.FC = () => {
    const [phone, setPhone] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [view, setView] = useState<'LOGIN' | 'FORCE_RESET'>('LOGIN');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showNewPassword, setShowNewPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);
    const [pendingLoginData, setPendingLoginData] = useState<{ client: any, token: string } | null>(null);
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

    React.useEffect(() => {
        const token = localStorage.getItem('delivery_app_token');
        if (token) {
            navigate('/', { replace: true });
        }
    }, [navigate]);

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
                onConfirm: () => setAlertState(prev => ({ ...prev, isOpen: false })),
                onCancel: undefined
            });
            return;
        }

        setIsLoading(true);
        try {
            const data = await api.login(cleanPhone, password);

            if (data.client?.mustChangePassword) {
                // Usuário está com a senha padrão (123)
                setPendingLoginData(data);
                setView('FORCE_RESET');
            } else {
                // Fluxo normal
                localStorage.setItem('delivery_app_token', data.token);
                localStorage.setItem('delivery_app_client', JSON.stringify(data.client));
                navigate('/');
            }
        } catch (err: any) {
            setAlertState({
                isOpen: true,
                title: 'Erro no Login',
                message: 'Dados incorretos, verifique o telefone e/ou senha',
                type: 'DANGER',
                onConfirm: () => setAlertState(prev => ({ ...prev, isOpen: false })),
                onCancel: undefined
            });
        } finally {
            setIsLoading(false);
        }
    };

    const handleGoogleSuccess = async (credentialResponse: any) => {
        if (!credentialResponse.credential) return;

        setIsLoading(true);
        try {
            const data = await api.googleLogin(credentialResponse.credential);
            localStorage.setItem('delivery_app_token', data.token);
            localStorage.setItem('delivery_app_client', JSON.stringify(data.client));
            navigate('/');
        } catch (err: any) {
            setAlertState({
                isOpen: true,
                title: 'Erro no Login Google',
                message: err.message || 'Não foi possível entrar com o Google.',
                type: 'DANGER',
                onConfirm: () => setAlertState(prev => ({ ...prev, isOpen: false })),
                onCancel: undefined
            });
        } finally {
            setIsLoading(false);
        }
    };

    const handleResetPassword = async (e: React.FormEvent) => {
        e.preventDefault();
        if (newPassword !== confirmPassword) {
            setAlertState({
                isOpen: true,
                title: 'Atenção',
                message: 'As senhas não coincidem.',
                type: 'INFO',
                onConfirm: () => setAlertState(prev => ({ ...prev, isOpen: false })),
                onCancel: undefined
            });
            return;
        }

        if (newPassword === '123') {
            setAlertState({
                isOpen: true,
                title: 'Atenção',
                message: 'A nova senha não pode ser "123". Escolha uma senha mais segura.',
                type: 'INFO',
                onConfirm: () => setAlertState(prev => ({ ...prev, isOpen: false })),
                onCancel: undefined
            });
            return;
        }

        if (newPassword.length < 6) {
            setAlertState({
                isOpen: true,
                title: 'Atenção',
                message: 'A senha deve ter pelo menos 6 caracteres.',
                type: 'INFO',
                onConfirm: () => setAlertState(prev => ({ ...prev, isOpen: false })),
                onCancel: undefined
            });
            return;
        }

        setIsLoading(true);
        try {
            if (!pendingLoginData) throw new Error('Dados de login perdidos.');

            // Atualiza a senha no backend usando o overrideToken temporário
            await api.updateClient(
                pendingLoginData.client.id,
                { currentPassword: password, password: newPassword },
                pendingLoginData.token
            );

            // Atualização bem sucedida: Efetiva o login
            // Atualiza o client removendo a flag
            const finalClient = { ...pendingLoginData.client, mustChangePassword: false };

            localStorage.setItem('delivery_app_token', pendingLoginData.token);
            localStorage.setItem('delivery_app_client', JSON.stringify(finalClient));

            navigate('/');
        } catch (err: any) {
            setAlertState({
                isOpen: true,
                title: 'Erro',
                message: err.message || 'Erro ao redefinir a senha.',
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
                <div className="flex flex-col items-center mb-10 text-center">
                    <div className="w-24 h-24 bg-indigo-600 rounded-3xl flex items-center justify-center shadow-2xl shadow-indigo-500/20 transform -rotate-12 mb-8 overflow-hidden">
                        <img src="/favicon.png" alt="Logo" className="w-16 h-16 object-contain" />
                    </div>
                </div>

                <div className="w-full bg-white p-6 md:p-10 rounded-[2.5rem] md:rounded-[3rem] shadow-2xl relative">
                {/* Fechar Modal Login */}
                {/* Header */}
                <div className="text-center mb-10">
                    <h2 className="text-3xl font-black text-slate-800 uppercase tracking-tighter italic">Delivery App</h2>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-2">
                        {view === 'LOGIN' ? 'Acesso do Cliente' : 'Troca de Senha Obrigatória'}
                    </p>
                </div>

                {view === 'LOGIN' ? (
                    <>
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
                                <div className="relative">
                                    <input
                                        type={showPassword ? "text" : "password"}
                                        className="w-full p-5 bg-slate-50 border-none rounded-2xl focus:ring-4 focus:ring-indigo-100 transition-all font-bold text-sm pr-14"
                                        placeholder="••••••••"
                                        value={password}
                                        onChange={e => setPassword(e.target.value)}
                                        required
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
                                disabled={isLoading}
                                type="submit"
                                className="w-full bg-slate-900 hover:bg-black text-white py-5 rounded-2xl font-black uppercase text-xs tracking-widest transition-all shadow-xl shadow-slate-900/20 mt-4 active:scale-[0.98]"
                            >
                                {isLoading ? 'Entrando...' : 'Entrar no Sistema'}
                            </button>
                        </form>

                        <div className="mt-8 flex flex-col items-center gap-6">
                            <div className="w-full flex items-center gap-4">
                                <div className="flex-1 h-[1px] bg-slate-100"></div>
                                <span className="text-[10px] font-black text-slate-300 uppercase tracking-widest">Ou entrar com</span>
                                <div className="flex-1 h-[1px] bg-slate-100"></div>
                            </div>

                            <GoogleLogin
                                onSuccess={handleGoogleSuccess}
                                onError={() => {
                                    setAlertState({
                                        isOpen: true,
                                        title: 'Erro',
                                        message: 'Falha na autenticação com o Google.',
                                        type: 'DANGER',
                                        onConfirm: () => setAlertState(prev => ({ ...prev, isOpen: false })),
                                        onCancel: undefined
                                    });
                                }}
                                useOneTap
                                theme="outline"
                                shape="pill"
                                width="100%"
                            />
                        </div>

                        <div className="mt-10 text-center space-y-4">
                            <p className="text-xs font-bold text-slate-400">
                                Não tem conta? <button onClick={() => navigate('/register')} className="text-indigo-600 ml-1">Cadastre-se</button>
                            </p>
                            <button
                                onClick={() => navigate('/recover')}
                                className="text-[10px] font-black text-slate-300 uppercase tracking-widest hover:text-indigo-400 transition-colors"
                            >
                                Esqueci minha senha
                            </button>
                        </div>
                    </>
                ) : (
                    <form onSubmit={handleResetPassword} className="space-y-6 animate-in fade-in duration-300">
                        <div className="p-4 bg-amber-50 border border-amber-100 rounded-2xl mb-4">
                            <p className="text-[9px] font-black text-amber-600 uppercase tracking-tight leading-relaxed">
                                Você está usando a senha padrão. Por segurança, crie uma senha forte agora.
                            </p>
                        </div>

                        <div className="space-y-2">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4">Nova Senha</label>
                            <div className="relative">
                                <input
                                    type={showNewPassword ? "text" : "password"}
                                    className="w-full p-5 bg-slate-50 border-none rounded-2xl focus:ring-4 focus:ring-indigo-100 transition-all font-bold text-sm pr-14"
                                    placeholder="••••••••"
                                    value={newPassword}
                                    onChange={e => setNewPassword(e.target.value)}
                                    required
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowNewPassword(!showNewPassword)}
                                    className="absolute right-4 top-1/2 -translate-y-1/2 p-2 text-slate-400 hover:text-indigo-600 transition-all rounded-xl active:scale-90"
                                >
                                    {showNewPassword ? <Icons.EyeOff className="w-5 h-5" /> : <Icons.Eye className="w-5 h-5" />}
                                </button>
                            </div>
                        </div>

                        <div className="space-y-2">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4">Confirme a Senha</label>
                            <div className="relative">
                                <input
                                    type={showConfirmPassword ? "text" : "password"}
                                    className="w-full p-5 bg-slate-50 border-none rounded-2xl focus:ring-4 focus:ring-indigo-100 transition-all font-bold text-sm pr-14"
                                    placeholder="••••••••"
                                    value={confirmPassword}
                                    onChange={e => setConfirmPassword(e.target.value)}
                                    required
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                                    className="absolute right-4 top-1/2 -translate-y-1/2 p-2 text-slate-400 hover:text-indigo-600 transition-all rounded-xl active:scale-90"
                                >
                                    {showConfirmPassword ? <Icons.EyeOff className="w-5 h-5" /> : <Icons.Eye className="w-5 h-5" />}
                                </button>
                            </div>
                        </div>

                        <button
                            disabled={isLoading}
                            type="submit"
                            className="w-full bg-emerald-600 text-white py-5 rounded-2xl font-black uppercase text-xs tracking-widest hover:bg-emerald-700 transition-all shadow-xl shadow-emerald-200 mt-4"
                        >
                            {isLoading ? 'Salvando...' : 'Salvar Nova Senha'}
                        </button>

                        <div className="mt-4 text-center">
                            <button
                                type="button"
                                onClick={() => {
                                    setView('LOGIN');
                                    setPendingLoginData(null);
                                    setNewPassword('');
                                    setConfirmPassword('');
                                }}
                                className="text-[10px] font-black text-slate-400 uppercase tracking-widest hover:text-slate-600 transition-colors"
                            >
                                Voltar para o Login
                            </button>
                        </div>
                    </form>
                )}
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

                <p className="text-center mt-12 text-slate-600 text-[10px] font-black uppercase tracking-[0.3em]">
                    Fransoft Developer®
                </p>
            </div>
        </div>
    );
};

export default Login;
