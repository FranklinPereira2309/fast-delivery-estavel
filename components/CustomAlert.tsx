
import React from 'react';

interface CustomAlertProps {
  isOpen: boolean;
  title: string;
  message: string;
  onConfirm: () => void;
  onCancel?: () => void;
  type?: 'INFO' | 'DANGER' | 'SUCCESS';
}

const CustomAlert: React.FC<CustomAlertProps> = ({ isOpen, title, message, onConfirm, onCancel, type = 'INFO' }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[999] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-[2rem] shadow-2xl w-full max-w-sm overflow-hidden border border-white/20">
        <div className={`p-6 text-center ${type === 'DANGER' ? 'bg-red-50' : type === 'SUCCESS' ? 'bg-emerald-50' : 'bg-blue-50'}`}>
          <h3 className={`text-lg font-black uppercase tracking-tight ${type === 'DANGER' ? 'text-red-600' : type === 'SUCCESS' ? 'text-emerald-600' : 'text-blue-600'}`}>
            {title}
          </h3>
        </div>
        <div className="p-8 text-center">
          <p className="text-slate-600 font-medium leading-relaxed">{message}</p>
        </div>
        <div className="p-4 bg-slate-50 flex gap-2">
          {onCancel && (
            <button 
              onClick={onCancel}
              className="flex-1 py-4 text-[10px] font-black uppercase text-slate-400 hover:bg-slate-100 rounded-2xl transition-all"
            >
              Cancelar
            </button>
          )}
          <button 
            onClick={onConfirm}
            className={`flex-1 py-4 text-[10px] font-black uppercase text-white rounded-2xl shadow-lg transition-all active:scale-95 ${
              type === 'DANGER' ? 'bg-red-600 shadow-red-100 hover:bg-red-700' : 
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
