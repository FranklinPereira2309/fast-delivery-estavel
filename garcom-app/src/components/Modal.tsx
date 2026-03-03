import React from 'react';
import { AlertCircle, CheckCircle2, HelpCircle, AlertTriangle } from 'lucide-react';

interface ModalProps {
    isOpen: boolean;
    type?: 'alert' | 'confirm' | 'success' | 'error';
    title: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
    onConfirm?: () => void;
    onClose: () => void;
}

const Modal: React.FC<ModalProps> = ({
    isOpen,
    type = 'alert',
    title,
    message,
    confirmText = 'OK',
    cancelText = 'Cancelar',
    onConfirm,
    onClose
}) => {
    if (!isOpen) return null;

    const getIcon = () => {
        switch (type) {
            case 'success': return <CheckCircle2 className="text-emerald-500" size={32} />;
            case 'error': return <AlertCircle className="text-red-500" size={32} />;
            case 'confirm': return <HelpCircle className="text-blue-500" size={32} />;
            default: return <AlertTriangle className="text-amber-500" size={32} />;
        }
    };

    const getTypeColor = () => {
        switch (type) {
            case 'success': return 'bg-emerald-50';
            case 'error': return 'bg-red-50';
            case 'confirm': return 'bg-blue-50';
            default: return 'bg-amber-50';
        }
    };

    return (
        <div
            className="fixed inset-0 z-[100] bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-6 animate-in fade-in duration-300"
            onClick={onClose}
        >
            <div
                className="bg-white w-full max-w-sm rounded-[2.5rem] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="p-8 flex flex-col items-center text-center">
                    <div className={`w-16 h-16 ${getTypeColor()} rounded-full flex items-center justify-center mb-6`}>
                        {getIcon()}
                    </div>

                    <h3 className="text-lg font-black text-slate-900 uppercase tracking-tight mb-2">
                        {title}
                    </h3>

                    <p className="text-sm font-bold text-slate-400 leading-relaxed uppercase">
                        {message}
                    </p>
                </div>

                <div className="p-6 bg-slate-50 flex gap-3">
                    {type === 'confirm' && (
                        <button
                            onClick={onClose}
                            className="flex-1 py-4 bg-white border border-slate-200 text-slate-400 font-black rounded-2xl uppercase text-[10px] tracking-widest active:scale-95 transition-all"
                        >
                            {cancelText}
                        </button>
                    )}
                    <button
                        onClick={() => {
                            if (onConfirm) onConfirm();
                            else onClose();
                        }}
                        className={`flex-1 py-4 font-black rounded-2xl uppercase text-[10px] tracking-widest active:scale-95 transition-all text-white shadow-lg ${type === 'error' ? 'bg-red-500 shadow-red-500/20' :
                            type === 'success' ? 'bg-emerald-500 shadow-emerald-500/20' :
                                'bg-blue-600 shadow-blue-500/20'
                            }`}
                    >
                        {confirmText}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default Modal;
