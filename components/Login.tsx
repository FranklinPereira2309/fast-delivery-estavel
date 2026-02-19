
import React, { useState } from 'react';
import { db } from '../services/db';
import { User } from '../types';

interface LoginProps {
  onLoginSuccess: (user: User) => void;
}

const Login: React.FC<LoginProps> = ({ onLoginSuccess }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [view, setView] = useState<'LOGIN' | 'FORGOT'>('LOGIN');

  // Fixed: Converted handleSubmit to async to await async DB login
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const user = await db.login(email, password);
    if (user) {
      onLoginSuccess(user);
    } else {
      setError('E-mail ou senha incorretos.');
    }
  };

  const handleForgot = (e: React.FormEvent) => {
    e.preventDefault();
    alert(`As instruções de recuperação foram enviadas para o e-mail: ${email}`);
    setView('LOGIN');
  };

  return (
    <div className="min-h-screen w-screen flex items-center justify-center bg-slate-900 overflow-hidden relative">
      {/* Background decoration */}
      <div className="absolute top-0 right-0 -mr-40 -mt-40 w-96 h-96 bg-blue-600/20 rounded-full blur-[100px]"></div>
      <div className="absolute bottom-0 left-0 -ml-40 -mb-40 w-96 h-96 bg-indigo-600/20 rounded-full blur-[100px]"></div>

      <div className="w-full max-w-md p-8 relative z-10">
        <div className="bg-white/10 backdrop-blur-xl p-10 rounded-[2.5rem] shadow-2xl border border-white/10">
          <div className="flex flex-col items-center mb-10">
            <div className="w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center shadow-xl shadow-blue-900/40 mb-4 transform -rotate-6">
              <span className="text-white text-3xl font-black">DF</span>
            </div>
            <h1 className="text-2xl font-black text-white tracking-tight">DELIVERY FAST</h1>
            <p className="text-slate-400 text-sm font-medium mt-1">
              {view === 'LOGIN' ? 'Gerencie seu negócio com inteligência' : 'Recuperação de Acesso'}
            </p>
          </div>

          {view === 'LOGIN' ? (
            <form onSubmit={handleSubmit} className="space-y-6">
              {error && (
                <div className="p-4 bg-red-500/20 border border-red-500/50 text-red-200 text-sm font-bold rounded-xl text-center">
                  {error}
                </div>
              )}
              
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
                    onClick={() => setView('FORGOT')}
                    className="text-[10px] text-blue-400 font-bold hover:text-blue-300 transition-colors"
                  >
                    ESQUECEU A SENHA?
                  </button>
                </div>
                <input 
                  type="password" 
                  required
                  placeholder="••••••••"
                  className="w-full p-4 bg-white/5 border border-white/10 rounded-2xl focus:ring-2 focus:ring-blue-500 transition-all text-white font-medium outline-none"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>

              <button 
                type="submit"
                className="w-full py-4 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-2xl shadow-lg shadow-blue-900/40 transition-all active:scale-[0.98] mt-4"
              >
                ENTRAR NO SISTEMA
              </button>
            </form>
          ) : (
            <form onSubmit={handleForgot} className="space-y-6">
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
              <button 
                type="submit"
                className="w-full py-4 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-2xl shadow-lg shadow-blue-900/40 transition-all active:scale-[0.98]"
              >
                ENVIAR LINK DE RECUPERAÇÃO
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
