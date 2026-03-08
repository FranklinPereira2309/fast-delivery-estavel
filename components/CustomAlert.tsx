
import React from 'react';

interface CustomAlertProps {
  isOpen: boolean;
  title: string;
  message: string;
  onConfirm: () => void;
  onCancel?: () => void;
  type?: 'INFO' | 'DANGER' | 'SUCCESS';
  showInput?: boolean;
  inputValue?: string;
  onInputChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  inputPlaceholder?: string;
  inputType?: string;
}

const CustomAlert: React.FC<CustomAlertProps> = ({
  isOpen,
  title,
  message,
  onConfirm,
  onCancel,
  type = 'INFO',
  showInput,
  inputValue,
  onInputChange,
  inputPlaceholder = "Digite aqui...",
  inputType = "text"
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[999] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white dark:bg-slate-800 rounded-[2rem] shadow-2xl w-full max-w-sm overflow-hidden border border-white/20 dark:border-white/10">
        <div className={`p-6 text-center ${type === 'DANGER' ? 'bg-red-50 dark:bg-red-500/10' : type === 'SUCCESS' ? 'bg-emerald-50 dark:bg-emerald-500/10' : 'bg-blue-50 dark:bg-blue-500/10'}`}>
          <h3 className={`text-lg font-black uppercase tracking-tight ${type === 'DANGER' ? 'text-red-600 dark:text-red-400' : type === 'SUCCESS' ? 'text-emerald-600 dark:text-emerald-400' : 'text-blue-600 dark:text-blue-400'}`}>
            {title}
          </h3>
        </div>
        <div className="p-8 text-center">
          <p className="text-slate-600 dark:text-slate-300 font-medium leading-relaxed mb-6">{message}</p>

          {showInput && (
            <div className="animate-in slide-in-from-bottom-2 duration-300">
              <input
                type={inputType}
                value={inputValue}
                onChange={onInputChange}
                placeholder={inputPlaceholder}
                autoFocus
                className="w-full px-5 py-4 bg-slate-50 dark:bg-white/5 border-2 border-slate-100 dark:border-white/10 rounded-2xl text-center font-bold text-slate-800 dark:text-white placeholder:text-slate-300 dark:placeholder:text-slate-500 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 outline-none transition-all"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && inputValue) onConfirm();
                }}
              />
            </div>
          )}
        </div>
        <div className="p-4 bg-slate-50 dark:bg-slate-900/50 flex gap-2">
          {onCancel && (
            <button
              onClick={onCancel}
              className="flex-1 py-4 text-[10px] font-black uppercase text-slate-400 dark:text-slate-500 hover:bg-slate-100 dark:hover:bg-white/5 rounded-2xl transition-all"
            >
              Cancelar
            </button>
          )}
          <button
            onClick={onConfirm}
            className={`flex-1 py-4 text-[10px] font-black uppercase text-white rounded-2xl shadow-lg transition-all active:scale-95 ${type === 'DANGER' ? 'bg-red-600 shadow-red-100 hover:bg-red-700' :
              type === 'SUCCESS' ? 'bg-emerald-600 shadow-emerald-100 hover:bg-emerald-700' :
                'bg-blue-600 shadow-blue-100 hover:bg-blue-700'
              }`}
          >
            Confirmar
          </button>
        </div>
      </div>
    </div>
  );
};

export default CustomAlert;
