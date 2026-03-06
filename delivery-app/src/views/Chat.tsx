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
    const [isSending, setIsSending] = useState(false);
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
        if (!newMessage.trim() || !client || isSending) return;

        try {
            const msgText = newMessage.trim();
            setNewMessage('');
            setIsSending(true);
            await api.sendSupportMessage(client.name, msgText, client.id, false);
            // After sending, we fetch history to update or wait for socket
            // To be more responsive, we'll fetch history immediately
            const history = await api.getSupportHistory(client.id);
            setMessages(history);
            setIsSending(false);
            setTimeout(scrollToBottom, 100);
        } catch (error) {
            console.error("Error sending message", error);
            setIsSending(false);
        }
    };

    if (isLoading) return (
        <div className="h-screen bg-slate-50 flex flex-col items-center justify-center">
            <div className="w-16 h-16 border-4 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin mb-4"></div>
            <div className="font-black text-indigo-500 uppercase tracking-widest text-[10px]">Abrindo Atendimento...</div>
        </div>
    );

    return (
        <div className="h-[calc(100dvh-7rem)] flex flex-col bg-slate-50 overflow-hidden">
            {/* Header */}
            <div className="bg-white p-6 pb-8 rounded-b-[3rem] shadow-xl shadow-slate-200/40 flex items-center gap-4 relative z-20 border-b border-slate-100/50 shrink-0">
                <button onClick={() => navigate('/')} className="w-11 h-11 bg-slate-50 rounded-2xl flex items-center justify-center text-slate-400 hover:text-indigo-600 transition-all border border-slate-100 active:scale-90 shrink-0">
                    <Icons.ArrowLeft className="w-5 h-5" />
                </button>
                <div className="flex-1">
                    <h1 className="text-lg font-black text-slate-800 uppercase tracking-tighter flex items-center gap-2 italic">
                        Atendimento Online
                        <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse shadow-lg shadow-emerald-200"></div>
                    </h1>
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mt-0.5">Estamos aqui para ajudar você!</p>
                </div>
                <div className="w-10 h-10 bg-indigo-50 rounded-xl flex items-center justify-center text-indigo-500 shadow-sm border border-indigo-100/50 shrink-0">
                    <Icons.HelpCircle className="w-5 h-5" />
                </div>
            </div>

            {/* Chat Messages */}
            <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3 custom-scrollbar">
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
                            <div className={`max-w-[80%] p-4 rounded-3xl shadow-sm text-sm ${msg.isAdmin ? 'bg-slate-100 text-slate-800 rounded-tl-none' : 'bg-indigo-600 text-white rounded-tr-none'}`}>
                                <p className="font-bold leading-snug">{msg.message}</p>
                                <div className={`flex items-center mt-1 opacity-60 ${msg.isAdmin ? 'justify-start' : 'justify-end'}`}>
                                    <span className="text-[9px] font-black uppercase tracking-widest">
                                        {msg.isAdmin ? 'Atendente - ' : 'VOCÊ - '}
                                        {new Date(msg.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                                    </span>
                                </div>
                            </div>
                        </div>
                    ))
                )}
                {isSending && (
                    <div className="flex justify-end animate-pulse">
                        <div className="bg-indigo-400 text-white p-4 rounded-3xl rounded-tr-none text-sm font-bold shadow-sm">
                            <p>Enviando...</p>
                        </div>
                    </div>
                )}
                <div ref={chatEndRef} />
            </div>

            {/* Input Bar */}
            <div className="border-t border-slate-100 bg-white relative z-20 pb-safe shrink-0">
                <form onSubmit={handleSend} className="p-3 bg-white flex gap-2 w-full">
                    <input
                        type="text"
                        value={newMessage}
                        onChange={e => setNewMessage(e.target.value)}
                        placeholder="Mensagem..."
                        className="flex-1 bg-slate-50 border-none rounded-2xl px-4 text-sm font-bold text-slate-700 outline-none placeholder:text-slate-300 focus:ring-2 focus:ring-indigo-500/20 transition-all"
                    />
                    <button type="submit" className="w-12 h-12 bg-indigo-600 text-white rounded-2xl shadow-lg shadow-indigo-500/30 flex flex-col items-center justify-center active:scale-90 transition-all shrink-0">
                        <svg viewBox="0 0 24 24" className="w-5 h-5 -rotate-12" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
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
