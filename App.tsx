
import React, { useState, useEffect } from 'react';
import Layout from './components/Layout';
import Dashboard from './views/Dashboard';
import POS from './views/POS';
import Tables from './views/Tables';
import Kitchen from './views/Kitchen';
import CRM from './views/CRM';
import Inventory from './views/Inventory';
import Logistics from './views/Logistics';
import SalesMonitor from './views/SalesMonitor';
import Reports from './views/Reports';
import Settings from './views/Settings';
import DeliveryOrders from './views/DeliveryOrders';
import Login from './components/Login';
import AuditLogs from './views/AuditLogs';
import QRCodes from './views/QRCodes';
import Receivables from './views/Receivables';
import { db } from './services/db';
import { User, Waiter, BusinessSettings } from './types';
import CustomAlert from './components/CustomAlert';
import { ThemeProvider } from './components/ThemeProvider';

const SplashScreen: React.FC = () => (
  <div className="fixed inset-0 z-[9999] bg-slate-900 flex flex-col items-center justify-center animate-in fade-in duration-500 p-4">
    <div className="relative">
      <div className="w-20 h-20 sm:w-24 sm:h-24 md:w-32 md:h-32 bg-blue-600 rounded-2xl sm:rounded-3xl flex items-center justify-center shadow-2xl shadow-blue-500/20 transform -rotate-12 animate-bounce">
        <span className="text-3xl sm:text-4xl md:text-5xl text-white font-black">DF</span>
      </div>
      <div className="absolute -bottom-1 -right-1 sm:-bottom-2 sm:-right-2 w-6 h-6 sm:w-8 sm:h-8 md:w-10 md:h-10 bg-emerald-500 rounded-full border-4 border-slate-900 animate-pulse"></div>
    </div>
    <div className="mt-6 sm:mt-8 text-center px-4">
      <h1 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-black text-white tracking-tighter uppercase mb-2">Delivery Fast</h1>
      <div className="h-1 w-8 sm:w-12 bg-blue-500 mx-auto rounded-full mb-3 sm:mb-4"></div>
      <p className="text-slate-500 text-[8px] sm:text-[10px] md:text-xs font-black uppercase tracking-[0.2em] sm:tracking-[0.3em]">Fransoft Developer®</p>
    </div>
    <div className="absolute bottom-10 sm:bottom-12 w-32 sm:w-48 md:w-64 h-1 bg-slate-800 rounded-full overflow-hidden">
      <div className="h-full bg-blue-600 animate-[loading_3s_ease-in-out_forwards]"></div>
    </div>
    <style>{`
      @keyframes loading {
        0% { width: 0%; }
        100% { width: 100%; }
      }
    `}</style>
  </div>
);

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSplashVisible, setIsSplashVisible] = useState(true);
  const [settings, setSettings] = useState<BusinessSettings | null>(null);

  // Estados dos Alertas
  const [isResetAlertOpen, setIsResetAlertOpen] = useState(false);
  const [isSavedAlertOpen, setIsSavedAlertOpen] = useState(false);
  const [resetPassword, setResetPassword] = useState('');

  useEffect(() => {
    const init = async () => {
      const session = db.getCurrentSession();
      if (session) {
        setCurrentUser(session.user);
      }
      const s = await db.getSettings();
      setSettings(s);
      setIsLoading(false);

      // SplashScreen timer
      setTimeout(() => {
        setIsSplashVisible(false);
      }, 3000);
    };
    init();
  }, []);

  const handleLogin = (user: User) => {
    setCurrentUser(user);
    if (user.permissions.length > 0) {
      setActiveTab(user.permissions[0]);
    }
  };

  const handleLogout = async () => {
    await db.logout();
    setCurrentUser(null);
  };

  const handleResetSystem = async () => {
    if (!resetPassword) return;

    const isValid = await db.verifyAdminPassword(resetPassword);
    if (!isValid) {
      alert("Senha de Admin Master incorreta!");
      return;
    }

    setIsResetAlertOpen(false);
    setResetPassword('');
    await db.resetDatabase();
    // Limpar estado explicitamente e forçar refresh total para garantir que volte à tela de Admin Master
    setCurrentUser(null);
    window.location.href = window.location.origin; // Força retorno à raiz
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (settings) {
      await db.saveSettings(settings);
      setIsSavedAlertOpen(true);
    }
  };

  if (isSplashVisible) return <SplashScreen />;

  if (isLoading || !settings) return <div className="h-screen w-screen flex items-center justify-center bg-slate-50 text-slate-400 font-medium">Carregando sistema...</div>;

  if (!currentUser) {
    return <Login onLoginSuccess={handleLogin} />;
  }

  const renderContent = () => {
    if (!currentUser.permissions.includes(activeTab)) {
      return (
        <div className="flex flex-col items-center justify-center h-full text-slate-400">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-16 w-16 mb-4 opacity-20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
          <p className="text-lg font-bold">Acesso Restrito</p>
          <p>Você não tem permissão para acessar este módulo.</p>
        </div>
      );
    }

    switch (activeTab) {
      case 'dashboard': return <Dashboard />;
      case 'pos': return <POS currentUser={currentUser} />;
      case 'sales-monitor': return <SalesMonitor />;
      case 'tables': return <Tables currentUser={currentUser} />;
      case 'kitchen': return <Kitchen />;
      case 'crm': return <CRM currentUser={currentUser} />;
      case 'inventory': return <Inventory />;
      case 'delivery-orders': return <DeliveryOrders currentUser={currentUser} />;
      case 'logistics': return <Logistics />;
      case 'receivables': return <Receivables currentUser={currentUser} setActiveTab={setActiveTab} />;
      case 'reports': return <Reports currentUser={currentUser} />;
      case 'qrcodes': return <QRCodes />;
      case 'settings':
        return (
          <Settings
            settings={settings}
            setSettings={setSettings}
            onReset={() => setIsResetAlertOpen(true)}
            onGoToSalesMonitor={() => setActiveTab('sales-monitor')}
          />
        );
      default: return <Dashboard />;
    }
  };

  return (
    <ThemeProvider defaultTheme="system" storageKey="app-theme">
      <Layout activeTab={activeTab} setActiveTab={setActiveTab} currentUser={currentUser} onLogout={handleLogout}>
        {renderContent()}
        <CustomAlert
          isOpen={isResetAlertOpen}
          title="⚠️ ATENÇÃO CRÍTICA"
          message="Esta ação irá apagar TODOS os dados do sistema e restaurar os padrões de fábrica. Após confirmar, você precisará logar novamente como Admin Master."
          type="DANGER"
          onConfirm={handleResetSystem}
          onCancel={() => {
            setIsResetAlertOpen(false);
            setResetPassword('');
          }}
          showInput={true}
          inputValue={resetPassword}
          onInputChange={(e) => setResetPassword(e.target.value)}
          inputPlaceholder="Senha do Admin Master"
          inputType="password"
        />
        <CustomAlert
          isOpen={isSavedAlertOpen}
          title="SUCESSO"
          message="As configurações do estabelecimento foram atualizadas com sucesso no banco de dados local."
          type="SUCCESS"
          onConfirm={() => setIsSavedAlertOpen(false)}
        />
      </Layout>
    </ThemeProvider>
  );
};

export default App;
