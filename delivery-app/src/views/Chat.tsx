import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../services/api';
import { socket } from '../services/socket';
import { Icons } from '../constants';

const Chat: React.FC = () => {
    const navigate = useNavigate();
    const [isLoading, setIsLoading] = useState(true);
    const [messages, setMessages] = useState<any[]>([]);
    const [newMessage, setNewMessage] = useState('');
    const [client, setClient] = useState<any>(null);
    const chatEndRef = useRef<HTMLDivElement>(null);

    const scrollToBottom = () => {
        chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    useEffect(() => {
        const clientStr = localStorage.getItem('delivery_app_client');
        if (!clientStr) {
            navigate('/login');
            return;
        }
        const clientData = JSON.parse(clientStr);
        setClient(clientData);

        const fetchHistory = async () => {
            try {
                const history = await api.getSupportHistory(clientData.id);
                setMessages(history);
                setIsLoading(false);
                setTimeout(scrollToBottom, 100);
            } catch (error) {
                console.error("Error fetching chat history", error);
                setIsLoading(false);
            }
        };

        fetchHistory();

        // Join client-specific room for real-time updates
        socket.emit('join_client', clientData.id);

        const handleNewMessage = (msg: any) => {
            if (msg.clientId === clientData.id) {
                setMessages(prev => [...prev.filter(m => m.id !== msg.id), msg]);
                setTimeout(scrollToBottom, 50);
            }
        };

        socket.on('new_support_message', handleNewMessage);

        return () => {
            socket.off('new_support_message', handleNewMessage);
        };
    }, [navigate]);

    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    const handleSend = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newMessage.trim() || !client) return;

        try {
            const msgText = newMessage.trim();
            setNewMessage('');
            await api.sendSupportMessage(client.name, msgText, client.id, false);
            // The message will come back via socket or we can optimistically add it
            // Backend Controller emits 'new_support_message'
        } catch (error) {
            console.error("Error sending message", error);
        }
    };

    if (isLoading) return (
        <div className="h-screen bg-slate-50 flex flex-col items-center justify-center">
            <div className="w-16 h-16 border-4 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin mb-4"></div>
            <div className="font-black text-indigo-500 uppercase tracking-widest text-[10px]">Abrindo Atendimento...</div>
        </div>
    );

    return (
        <div className="h-screen flex flex-col bg-slate-50 overflow-hidden">
            {/* Header */}
            <div className="bg-white p-6 pb-8 rounded-b-[3rem] shadow-xl shadow-slate-200/40 flex items-center gap-4 relative z-20 border-b border-slate-100/50">
                <button onClick={() => navigate('/')} className="w-11 h-11 bg-slate-50 rounded-2xl flex items-center justify-center text-slate-400 hover:text-indigo-600 transition-all border border-slate-100 active:scale-90">
                    <Icons.ArrowLeft className="w-5 h-5" />
                </button>
                <div className="flex-1">
                    <h1 className="text-lg font-black text-slate-800 uppercase tracking-tighter flex items-center gap-2 italic">
                        Atendimento Online
                        <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse shadow-lg shadow-emerald-200"></div>
                    </h1>
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mt-0.5">Estamos aqui para ajudar você!</p>
                </div>
                <div className="w-10 h-10 bg-indigo-50 rounded-xl flex items-center justify-center text-indigo-500 shadow-sm border border-indigo-100/50">
                    <Icons.HelpCircle className="w-5 h-5" />
                </div>
            </div>

            {/* Chat Messages */}
            <div className="flex-1 overflow-y-auto p-6 space-y-4 custom-scrollbar bg-transparent relative">
                {messages.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-slate-300 opacity-60">
                        <div className="w-20 h-20 bg-white rounded-full flex items-center justify-center mb-6 shadow-sm border border-slate-100">
                            <Icons.MessageSquare className="w-10 h-10 text-slate-200" />
                        </div>
                        <h3 className="text-sm font-black uppercase tracking-tighter text-slate-400 mb-1">Olá, {client?.name?.split(' ')[0]}!</h3>
                        <p className="text-[10px] font-bold uppercase tracking-widest max-w-[200px] text-center leading-relaxed">Conte-nos como podemos ajudar você hoje.</p>
                    </div>
                ) : (
                    messages.map((msg, i) => (
                        <div key={msg.id || i} className={`flex ${msg.isAdmin ? 'justify-start' : 'justify-end'} animate-in slide-in-from-bottom-2 duration-300`}>
                            <div className={`max-w-[85%] p-4 rounded-[1.8rem] shadow-sm text-[13px] leading-relaxed ${msg.isAdmin ? 'bg-white border border-slate-100 text-slate-800 rounded-tl-none shadow-indigo-100/10' : 'bg-indigo-600 text-white rounded-tr-none shadow-indigo-200/50'}`}>
                                <p className="font-bold">{msg.message}</p>
                                <div className={`flex items-center gap-2 mt-1.5 opacity-50 ${msg.isAdmin ? 'justify-start' : 'justify-end'}`}>
                                    <span className="text-[8px] font-black uppercase tracking-widest">
                                        {new Date(msg.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                                    </span>
                                </div>
                            </div>
                        </div>
                    ))
                )}
                <div ref={chatEndRef} />
            </div>

            {/* Input Bar */}
            <div className="p-6 bg-white/80 backdrop-blur-md border-t border-slate-100 pb-safe z-20">
                <form onSubmit={handleSend} className="flex gap-3 bg-slate-50 p-2 rounded-[2rem] border border-slate-100 shadow-inner group focus-within:ring-4 focus-within:ring-indigo-500/5 transition-all">
                    <input
                        type="text"
                        value={newMessage}
                        onChange={e => setNewMessage(e.target.value)}
                        placeholder="Mensagem..."
                        className="flex-1 bg-transparent border-none px-4 text-sm font-bold text-slate-700 outline-none placeholder:text-slate-300"
                    />
                    <button type="submit" className="w-12 h-12 bg-indigo-600 text-white rounded-[1.4rem] shadow-lg shadow-indigo-300/40 flex items-center justify-center active:scale-90 transition-all group-hover:shadow-indigo-400/50">
                        <svg viewBox="0 0 24 24" className="w-5 h-5 -rotate-12" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                            <line x1="22" y1="2" x2="11" y2="13"></line>
                            <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
                        </svg>
                    </button>
                </form>
            </div>
        </div>
    );
};

export default Chat;
