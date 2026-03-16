import React from 'react';
import { Icons } from '../constants';

interface CustomAlertProps {
  isOpen: boolean;
  title: string;
  message: string;
  onConfirm: () => void;
  onCancel?: () => void;
  type?: 'INFO' | 'DANGER' | 'SUCCESS' | 'QUESTION';
  confirmText?: string;
}

const CustomAlert: React.FC<CustomAlertProps> = ({ isOpen, title, message, onConfirm, onCancel, type = 'INFO', confirmText }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[999] flex items-center justify-center p-4 bg-slate-900/60 dark:bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white dark:bg-slate-900 rounded-[2rem] shadow-2xl w-full max-w-sm overflow-hidden border border-white/20 dark:border-slate-800 relative transition-colors duration-500">
        {/* Botão de Fechar (X) */}
        {onCancel && (
          <button
            onClick={onCancel}
            className="absolute top-5 right-5 p-2 bg-white/20 dark:bg-slate-800/50 hover:bg-black/5 dark:hover:bg-slate-700 rounded-full transition-all z-10 text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300"
          >
            <Icons.X className="w-4 h-4" />
          </button>
        )}

        <div className={`p-6 text-center transition-colors ${type === 'DANGER' ? 'bg-rose-50 dark:bg-rose-950/30' : type === 'SUCCESS' ? 'bg-emerald-50 dark:bg-emerald-950/30' : type === 'QUESTION' ? 'bg-white dark:bg-slate-900' : 'bg-blue-50 dark:bg-blue-950/30'}`}>
          {type === 'QUESTION' ? (
            <div className="flex justify-center mb-2 mt-4">
              <div className="w-20 h-20 bg-blue-50 dark:bg-indigo-900/20 rounded-full flex items-center justify-center border border-blue-100 dark:border-indigo-800/50">
                <Icons.HelpCircle className="w-10 h-10 text-blue-500 dark:text-indigo-400" />
              </div>
            </div>
          ) : (
            <h3 className={`text-lg font-black uppercase tracking-tight ${type === 'DANGER' ? 'text-rose-600 dark:text-rose-400' : type === 'SUCCESS' ? 'text-emerald-600 dark:text-emerald-400' : 'text-blue-600 dark:text-indigo-400'}`}>
              {title}
            </h3>
          )}
        </div>
        <div className="px-8 pb-8 pt-4 text-center">
          {type === 'QUESTION' && (
            <h3 className="text-xl font-black text-slate-900 dark:text-white uppercase tracking-tighter mb-4 leading-tight">{title}</h3>
          )}
          <p className={`font-bold uppercase text-[11px] tracking-widest leading-relaxed ${type === 'QUESTION' ? 'text-slate-400 dark:text-slate-500 px-4' : 'text-slate-600 dark:text-slate-300'}`}>
            {message}
          </p>
        </div>
        <div className={`p-4 flex gap-2 transition-colors ${type === 'QUESTION' ? 'bg-white dark:bg-slate-900 pb-8' : 'bg-slate-50 dark:bg-slate-950/50'}`}>
          {onCancel && (
            <button
              onClick={onCancel}
              className={`flex-1 py-4 text-[10px] font-black uppercase rounded-2xl transition-all border ${type === 'QUESTION'
                ? 'text-slate-400 dark:text-slate-500 border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800'
                : 'text-slate-400 dark:text-slate-500 border-transparent hover:bg-slate-100 dark:hover:bg-slate-800'}`}
            >
              Cancelar
            </button>
          )}
          <button
            onClick={onConfirm}
            className={`flex-1 py-4 text-[10px] font-black uppercase text-white rounded-2xl shadow-lg transition-all active:scale-95 ${type === 'DANGER' ? 'bg-rose-600 shadow-rose-100 dark:shadow-none hover:bg-rose-700' :
              type === 'SUCCESS' ? 'bg-emerald-600 shadow-emerald-100 dark:shadow-none hover:bg-emerald-700' :
                type === 'QUESTION' ? 'bg-indigo-600 shadow-indigo-100 dark:shadow-none hover:bg-indigo-700' :
                  'bg-blue-600 dark:bg-indigo-600 shadow-blue-100 dark:shadow-none hover:bg-blue-700 dark:hover:bg-indigo-500'
              }`}
          >
            {confirmText || (type === 'QUESTION' ? 'Sair Agora' : 'Confirmar')}
          </button>
        </div>
      </div>
    </div>
  );
};

export default CustomAlert;
