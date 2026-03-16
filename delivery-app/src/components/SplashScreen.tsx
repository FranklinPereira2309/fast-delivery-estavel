import React from 'react';

const SplashScreen: React.FC = () => {
  return (
    <div className="fixed inset-0 z-[9999] bg-slate-50 dark:bg-slate-950 flex flex-col items-center justify-center animate-in fade-in duration-500 p-4 transition-colors duration-500">
      <div className="relative">
        <div className="w-24 h-24 bg-indigo-600 rounded-3xl flex items-center justify-center shadow-2xl shadow-indigo-500/20 transform -rotate-12 animate-bounce">
          <span className="text-4xl text-white font-black">DF</span>
        </div>
        <div className="absolute -bottom-2 -right-2 w-8 h-8 bg-emerald-500 rounded-full border-4 border-slate-50 dark:border-slate-950 animate-pulse transition-colors duration-500"></div>
      </div>
      <div className="mt-8 text-center px-4">
        <h1 className="text-3xl font-black text-slate-900 dark:text-white tracking-tighter uppercase mb-2">Delivery Fast</h1>
        <div className="h-1 w-12 bg-indigo-500 mx-auto rounded-full mb-4"></div>
        <p className="text-slate-500 dark:text-slate-400 text-[10px] font-black uppercase tracking-[0.3em]">Fransoft Developer®</p>
      </div>
      <div className="absolute bottom-12 w-48 h-1 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden transition-colors duration-500">
        <div className="h-full bg-indigo-600 animate-[loading_3s_ease-in-out_forwards]"></div>
      </div>
      <style>{`
        @keyframes loading {
          0% { width: 0%; }
          100% { width: 100%; }
        }
      `}</style>
    </div>
  );
};

export default SplashScreen;
