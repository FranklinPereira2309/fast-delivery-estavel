import React, { useState, useEffect } from 'react';

interface OrderReadyNotificationProps {
    message: string;
    onClose: () => void;
    duration?: number;
}

const OrderReadyNotification: React.FC<OrderReadyNotificationProps> = ({ message, onClose, duration = 15 }) => {
    const [timeLeft, setTimeLeft] = useState(duration);

    useEffect(() => {
        if (timeLeft <= 0) {
            onClose();
            return;
        }

        const timer = setInterval(() => {
            setTimeLeft((prev) => prev - 1);
        }, 1000);

        return () => clearInterval(timer);
    }, [timeLeft, onClose]);

    return (
        <div className="fixed top-20 left-4 right-4 z-[100] animate-bounce-in">
            <div className="bg-white/80 backdrop-blur-xl border border-white/20 rounded-[2.5rem] shadow-[0_20px_50px_rgba(0,0,0,0.15)] overflow-hidden">
                <div className="relative h-48 w-full">
                    <img
                        src="/ready-notification.png"
                        alt="Pedido Pronto"
                        className="w-full h-full object-cover"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-white/90 via-transparent to-transparent"></div>

                    {/* Close Button */}
                    <button
                        onClick={onClose}
                        className="absolute top-4 right-4 w-10 h-10 bg-black/20 hover:bg-black/40 backdrop-blur-md rounded-full flex items-center justify-center text-white transition-all active:scale-90"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                <div className="p-8 text-center space-y-4">
                    <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-emerald-100 text-emerald-700 rounded-full text-[10px] font-black uppercase tracking-widest">
                        <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></span>
                        Prepare-se
                    </div>

                    <h2 className="text-2xl font-black text-slate-900 leading-tight uppercase tracking-tighter">
                        {message}
                    </h2>

                    <div className="pt-2 flex flex-col items-center gap-3">
                        <div className="relative w-16 h-16 flex items-center justify-center">
                            <svg className="absolute inset-0 w-full h-full -rotate-90">
                                <circle
                                    cx="32"
                                    cy="32"
                                    r="28"
                                    stroke="currentColor"
                                    strokeWidth="4"
                                    fill="transparent"
                                    className="text-slate-100"
                                />
                                <circle
                                    cx="32"
                                    cy="32"
                                    r="28"
                                    stroke="currentColor"
                                    strokeWidth="4"
                                    fill="transparent"
                                    strokeDasharray={176}
                                    strokeDashoffset={176 * (1 - timeLeft / duration)}
                                    strokeLinecap="round"
                                    className="text-emerald-500 transition-all duration-1000"
                                />
                            </svg>
                            <span className="text-xl font-black text-slate-900">{timeLeft}s</span>
                        </div>
                        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-[0.2em]">Sendo entregue em instantes</p>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default OrderReadyNotification;
