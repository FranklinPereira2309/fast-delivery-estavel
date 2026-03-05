import React from 'react';
import { Icons } from '../constants';

interface LogoutModalProps {
    isOpen: boolean;
    onConfirm: () => void;
    onCancel: () => void;
}

const LogoutModal: React.FC<LogoutModalProps> = ({ isOpen, onConfirm, onCancel }) => {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[999] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-sm overflow-hidden border border-white/20 relative animate-in zoom-in duration-300">
                <div className="p-6 text-center bg-white">
                    <div className="flex justify-center mb-2 mt-4">
                        <div className="w-20 h-20 bg-blue-50 rounded-full flex items-center justify-center border border-blue-100">
                            <Icons.HelpCircle className="w-10 h-10 text-blue-500" />
                        </div>
                    </div>
                </div>
                <div className="px-8 pb-8 pt-4 text-center">
                    <h3 className="text-xl font-black text-slate-900 uppercase tracking-tighter mb-4 leading-tight">SAIR DO SISTEMA</h3>
                    <p className="font-bold uppercase text-[11px] tracking-widest leading-relaxed text-slate-400 px-4">
                        DESEJA REALMENTE SAIR DA APLICAÇÃO E VOLTAR PARA O LOGIN?
                    </p>
                </div>
                <div className="p-4 flex gap-2 bg-white pb-8">
                    <button
                        onClick={onCancel}
                        className="flex-1 py-4 text-[10px] font-black uppercase rounded-2xl transition-all border text-slate-400 border-slate-100 hover:bg-slate-50"
                    >
                        Cancelar
                    </button>
                    <button
                        onClick={onConfirm}
                        className="flex-1 py-4 text-[10px] font-black uppercase text-white rounded-2xl shadow-lg transition-all active:scale-95 bg-blue-600 shadow-blue-100 hover:bg-blue-700"
                    >
                        Sair Agora
                    </button>
                </div>
            </div>
        </div>
    );
};

export default LogoutModal;
