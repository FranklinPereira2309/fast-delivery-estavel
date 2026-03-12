
import React, { useEffect, useState } from 'react';
import { Toast as ToastType, useToast } from '../hooks/useToast';

const Toast: React.FC<{ toast: ToastType }> = ({ toast }) => {
  const { removeToast } = useToast();
  const [progress, setProgress] = useState(100);
  const duration = toast.duration || 5000;

  useEffect(() => {
    const timer = setTimeout(() => {
      removeToast(toast.id);
    }, duration);

    const interval = setInterval(() => {
      setProgress((prev) => Math.max(0, prev - (100 / (duration / 100))));
    }, 100);

    return () => {
      clearTimeout(timer);
      clearInterval(interval);
    };
  }, [toast.id, duration, removeToast]);

  const getColors = () => {
    switch (toast.type) {
      case 'SUCCESS': return 'bg-emerald-500 text-white shadow-emerald-500/20';
      case 'DANGER': return 'bg-red-500 text-white shadow-red-500/20';
      case 'WARNING': return 'bg-orange-500 text-white shadow-orange-500/20';
      default: return 'bg-blue-600 text-white shadow-blue-500/20';
    }
  };

  return (
    <div className={`w-full max-w-sm pointer-events-auto overflow-hidden rounded-2xl shadow-2xl animate-in slide-in-from-bottom-5 duration-300 transform transition-all mb-4 ${getColors()}`}>
      <div className="p-4 flex flex-col">
        <div className="flex justify-between items-start mb-1">
          <h4 className="text-[10px] font-black uppercase tracking-tighter">{toast.title}</h4>
          <button onClick={() => removeToast(toast.id)} className="text-white/60 hover:text-white transition-colors">
            ✕
          </button>
        </div>
        <p className="text-sm font-bold tracking-tight leading-tight">{toast.message}</p>
      </div>
      <div className="h-1 bg-white/20 w-full overflow-hidden">
        <div 
          className="h-full bg-white/40 transition-all duration-100 ease-linear"
          style={{ width: `${progress}%` }}
        ></div>
      </div>
    </div>
  );
};

export const ToastContainer: React.FC = () => {
  const { toasts } = useToast();

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[10000] flex flex-col items-center w-full px-4 max-w-sm pointer-events-none">
      {toasts.map((toast) => (
        <Toast key={toast.id} toast={toast} />
      ))}
    </div>
  );
};
