import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Icons } from '../constants';

interface FooterNavProps {
    hasUnread?: boolean;
}

const FooterNav: React.FC<FooterNavProps> = ({ hasUnread }) => {
    const navigate = useNavigate();
    const location = useLocation();

    const isActive = (path: string) => location.pathname === path;

    return (
        <div className="fixed bottom-0 left-0 right-0 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl border-t border-slate-100 dark:border-slate-800 px-6 py-4 flex justify-between items-center z-50 rounded-t-[2.5rem] shadow-[0_-10px_25px_-5px_rgba(0,0,0,0.05)] transition-colors duration-500">
            <style>{`
                @keyframes blink-blue {
                    0% { opacity: 1; transform: scale(1); }
                    50% { opacity: 0.7; transform: scale(1.05); }
                    100% { opacity: 1; transform: scale(1); }
                }
                .animate-blink-blue {
                    animation: blink-blue 1s infinite;
                }
            `}</style>
            <button
                onClick={() => navigate('/')}
                className={`flex flex-col items-center gap-1 transition-all ${isActive('/') ? 'text-indigo-600 dark:text-indigo-400 scale-110' : 'text-slate-400 dark:text-slate-500'}`}
            >
                <Icons.Home className="w-6 h-6" />
                <span className="text-[10px] font-black uppercase tracking-widest">Início</span>
            </button>

            <button
                onClick={() => navigate('/chat')}
                className={`flex flex-col items-center gap-1 transition-all ${isActive('/chat') ? 'text-indigo-600 dark:text-indigo-400 scale-110' : 'text-slate-400 dark:text-slate-500'} active:scale-95`}
            >
                <div className="relative">
                    <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-white shadow-lg -mt-8 border-4 border-white dark:border-slate-900 ${hasUnread ? 'bg-indigo-600 shadow-indigo-200 dark:shadow-none animate-blink-blue' : (isActive('/chat') ? 'bg-indigo-600 shadow-indigo-200 dark:shadow-none' : 'bg-slate-400 shadow-slate-200 dark:bg-slate-700 dark:shadow-none')}`}>
                        <Icons.MessageSquare className="w-6 h-6" />
                    </div>
                    {hasUnread && !isActive('/chat') && (
                        <span className="absolute -top-9 -right-1 w-4 h-4 bg-rose-500 rounded-full border-2 border-white dark:border-slate-900 animate-pulse shadow-sm z-10"></span>
                    )}
                </div>
                <span className="text-[10px] font-black uppercase tracking-widest mt-1">Chat</span>
            </button>

            <button
                onClick={() => navigate('/history')}
                className={`flex flex-col items-center gap-1 transition-all ${isActive('/history') ? 'text-indigo-600 dark:text-indigo-400 scale-110' : 'text-slate-400 dark:text-slate-500'}`}
            >
                <Icons.Clipboard className="w-6 h-6" />
                <span className="text-[10px] font-black uppercase tracking-widest">Pedidos</span>
            </button>
        </div>
    );
};

export default FooterNav;
