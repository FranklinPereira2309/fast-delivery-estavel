import React, { useState } from 'react';
import { db } from '../services/db';
import { User } from '../types';

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
  const [view, setView] = useState<'LOGIN' | 'FORGOT' | 'RESET' | 'FIRST_LOGIN' | 'CODE_DISPLAY'>('LOGIN');
  const [tempUser, setTempUser] = useState<User | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const user = await db.login(email, password);
    if (user) {
      if (user.mustChangePassword) {
        setTempUser(user);
        setView('FIRST_LOGIN');
      } else {
        onLoginSuccess(user);
      }
    } else {
      setError('E-mail ou senha incorretos.');
    }
  };

  const handleForgot = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const isValid = await db.verifyRecoveryCode(email, recoveryCode);
    if (isValid) {
      setView('RESET');
    } else {
      setError('E-mail ou Código de Recuperação inválidos.');
    }
  };

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      return setError('As senhas não coincidem.');
    }
    setError('');
    try {
      await db.resetPassword({ email, recoveryCode, newPassword });
      alert('Senha alterada com sucesso! Faça login agora.');
      setView('LOGIN');
      setPassword('');
    } catch (err: any) {
      setError(err.message || 'Erro ao redefinir senha.');
    }
  };

  const handleFirstLoginChange = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      return setError('As senhas não coincidem.');
    }
    setError('');
    try {
      await db.resetPassword({
        email: tempUser!.email,
        recoveryCode: tempUser!.recoveryCode!,
        newPassword
      });
      setView('CODE_DISPLAY');
    } catch (err: any) {
      setError(err.message || 'Erro ao alterar senha.');
    }
  };

  const renderEyeIcon = () => (
    <button
      type="button"
      onClick={() => setShowPassword(!showPassword)}
      className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white transition-colors"
    >
      {showPassword ? (
        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l18 18" />
        </svg>
      ) : (
        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
        </svg>
      )}
    </button>
  );

  return (
    <div className="min-h-screen w-screen flex items-center justify-center bg-slate-900 overflow-hidden relative p-4">
      {/* Background decoration */}
      <div className="absolute top-0 right-0 -mr-40 -mt-40 w-96 h-96 bg-blue-600/20 rounded-full blur-[100px]"></div>
      <div className="absolute bottom-0 left-0 -ml-40 -mb-40 w-96 h-96 bg-indigo-600/20 rounded-full blur-[100px]"></div>

      <div className="w-full max-w-md relative z-10">
        <div className="bg-white/10 backdrop-blur-xl p-8 md:p-10 rounded-[2.5rem] shadow-2xl border border-white/10">
          <div className="flex flex-col items-center mb-10 text-center">
            <div className="w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center shadow-xl shadow-blue-900/40 mb-4 transform -rotate-6">
              <span className="text-white text-3xl font-black">DF</span>
            </div>
            <h1 className="text-2xl font-black text-white tracking-tight">DELIVERY FAST</h1>
            <p className="text-slate-400 text-sm font-medium mt-1">
              {view === 'LOGIN' && 'Gerencie seu negócio com inteligência'}
              {view === 'FORGOT' && 'Recuperação de Acesso'}
              {view === 'RESET' && 'Definir Nova Senha'}
              {view === 'FIRST_LOGIN' && 'Primeiro Acesso: Requisitado Troca de Senha'}
              {view === 'CODE_DISPLAY' && 'IMPORTANTE: Código Pessoal'}
            </p>
          </div>

          {error && (
            <div className="p-4 mb-6 bg-red-500/20 border border-red-500/50 text-red-200 text-sm font-bold rounded-xl text-center">
              {error}
            </div>
          )}

          {view === 'LOGIN' && (
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-400 uppercase ml-1">E-mail Corporativo</label>
                <input
                  type="email"
                  required
                  placeholder="admin@fast.com"
                  className="w-full p-4 bg-white/5 border border-white/10 rounded-2xl focus:ring-2 focus:ring-blue-500 transition-all text-white font-medium outline-none"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <div className="flex justify-between items-center ml-1">
                  <label className="text-xs font-bold text-slate-400 uppercase">Senha</label>
                  <button
                    type="button"
                    onClick={() => { setView('FORGOT'); setError(''); }}
                    className="text-[10px] text-blue-400 font-bold hover:text-blue-300 transition-colors"
                  >
                    ESQUECEU A SENHA?
                  </button>
                </div>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    required
                    placeholder="••••••••"
                    className="w-full p-4 bg-white/5 border border-white/10 rounded-2xl focus:ring-2 focus:ring-blue-500 transition-all text-white font-medium outline-none pr-12"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                  {renderEyeIcon()}
                </div>
              </div>

              <button
                type="submit"
                className="w-full py-4 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-2xl shadow-lg shadow-blue-900/40 transition-all active:scale-[0.98]"
              >
                ENTRAR NO SISTEMA
              </button>
            </form>
          )}

          {view === 'FORGOT' && (
            <form onSubmit={handleForgot} className="space-y-6">
              <p className="text-xs text-slate-400 leading-relaxed text-center px-4">
                Informe seu e-mail e o seu código pessoal alfanumérico único para validar sua identidade.
              </p>
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-400 uppercase ml-1">Seu E-mail</label>
                <input
                  type="email"
                  required
                  placeholder="admin@fast.com"
                  className="w-full p-4 bg-white/5 border border-white/10 rounded-2xl focus:ring-2 focus:ring-blue-500 transition-all text-white font-medium outline-none"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-400 uppercase ml-1">Código Alfanumérico (06 Digitos)</label>
                <input
                  type="text"
                  required
                  maxLength={6}
                  placeholder="A1B2C3"
                  className="w-full p-4 bg-white/5 border border-white/10 rounded-2xl focus:ring-2 focus:ring-blue-500 transition-all text-white text-center font-black tracking-widest outline-none uppercase"
                  value={recoveryCode}
                  onChange={(e) => setRecoveryCode(e.target.value)}
                />
              </div>
              <button
                type="submit"
                className="w-full py-4 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-2xl shadow-lg shadow-blue-900/40 transition-all active:scale-[0.98]"
              >
                VALIDAR IDENTIDADE
              </button>
              <button
                type="button"
                onClick={() => setView('LOGIN')}
                className="w-full py-2 text-slate-400 text-sm font-bold hover:text-white transition-colors"
              >
                VOLTAR AO LOGIN
              </button>
            </form>
          )}

          {view === 'RESET' && (
            <form onSubmit={handleReset} className="space-y-6">
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-400 uppercase ml-1">Nova Senha</label>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    required
                    placeholder="••••••••"
                    className="w-full p-4 bg-white/5 border border-white/10 rounded-2xl focus:ring-2 focus:ring-blue-500 transition-all text-white font-medium outline-none pr-12"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                  />
                  {renderEyeIcon()}
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-400 uppercase ml-1">Confirmar Nova Senha</label>
                <input
                  type={showPassword ? "text" : "password"}
                  required
                  placeholder="••••••••"
                  className="w-full p-4 bg-white/5 border border-white/10 rounded-2xl focus:ring-2 focus:ring-blue-500 transition-all text-white font-medium outline-none"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                />
              </div>
              <button
                type="submit"
                className="w-full py-4 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-2xl shadow-lg shadow-emerald-900/40 transition-all active:scale-[0.98]"
              >
                REDEFINIR SENHA
              </button>
            </form>
          )}

          {view === 'FIRST_LOGIN' && (
            <form onSubmit={handleFirstLoginChange} className="space-y-6">
              <p className="text-xs text-amber-400 leading-relaxed text-center px-4 font-bold">
                Por segurança, este é seu primeiro acesso e você deve definir uma senha privativa agora.
              </p>
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-400 uppercase ml-1">Sua Nova Senha Privativa</label>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    required
                    placeholder="••••••••"
                    className="w-full p-4 bg-white/5 border border-white/10 rounded-2xl focus:ring-2 focus:ring-blue-500 transition-all text-white font-medium outline-none pr-12"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                  />
                  {renderEyeIcon()}
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-400 uppercase ml-1">Confirmar Senha</label>
                <input
                  type={showPassword ? "text" : "password"}
                  required
                  placeholder="••••••••"
                  className="w-full p-4 bg-white/5 border border-white/10 rounded-2xl focus:ring-2 focus:ring-blue-500 transition-all text-white font-medium outline-none"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                />
              </div>
              <button
                type="submit"
                className="w-full py-4 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-2xl shadow-lg shadow-blue-900/40 transition-all active:scale-[0.98]"
              >
                SALVAR E CONTINUAR
              </button>
            </form>
          )}

          {view === 'CODE_DISPLAY' && (
            <div className="space-y-8 text-center">
              <div className="p-6 bg-blue-600/20 border border-blue-500/30 rounded-3xl">
                <p className="text-[10px] font-black text-blue-400 uppercase tracking-widest mb-4">Seu Código de Recuperação Único:</p>
                <h2 className="text-4xl font-black text-white tracking-[0.2em] animate-pulse">{tempUser?.recoveryCode}</h2>
              </div>
              <div className="space-y-4">
                <p className="text-sm font-bold text-white leading-relaxed">
                  ANOTE ESTE CÓDIGO AGORA!
                </p>
                <p className="text-xs text-slate-400 leading-relaxed px-2">
                  Você precisará dele caso esqueça sua senha. Nem o Administrador Master tem acesso a ele. Sem este código, você perderá o acesso à sua conta se esquecer a senha.
                </p>
              </div>
              <button
                onClick={async () => {
                  const refreshedUser = await db.login(tempUser!.email, newPassword);
                  if (refreshedUser) onLoginSuccess(refreshedUser);
                }}
                className="w-full py-4 bg-white text-slate-900 font-black rounded-2xl shadow-xl transition-all active:scale-[0.98] uppercase tracking-widest text-xs"
              >
                ENTENDI, ACESSAR O SISTEMA
              </button>
            </div>
          )}

          <div className="mt-12 pt-8 border-t border-white/5 text-center">
            <p className="text-[10px] text-slate-500 font-bold tracking-widest uppercase">
              Powered by Delivery Fast Desktop Suite v2.0
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;
