import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../services/api';
import { OrderStatusLabels } from '../types';
import type { Order } from '../types';
import { Icons } from '../constants';

const OrderDetails: React.FC = () => {
    const { id } = useParams<{ id: string }>();
    const [order, setOrder] = useState<Order | null>(null);
    const [messages, setMessages] = useState<any[]>([]);
    const [newMessage, setNewMessage] = useState('');
    const [isLoading, setIsLoading] = useState(true);
    const navigate = useNavigate();
    const chatEndRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const fetchDetails = async () => {
            if (!id) return;
            try {
                // In a real scenario, we'd fetch specific order and messages
                const allOrders = await api.getMyOrders();
                const found = allOrders.find((o: any) => o.id === id);
                setOrder(found || null);
            } catch (err) {
                console.error(err);
            } finally {
                setIsLoading(false);
            }
        };
        fetchDetails();
    }, [id]);

    const handleSendMessage = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newMessage.trim() || !id) return;

        try {
            // Logic to send message to backend via api service
            // api.sendMessage(id, newMessage)
            setMessages([...messages, { content: newMessage, sender: 'CLIENT', createdAt: new Date() }]);
            setNewMessage('');
        } catch (err) {
            console.error(err);
        }
    };

    if (isLoading) return <div className="h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center font-bold text-slate-400 dark:text-slate-500 transition-colors duration-500">Carregando detalhes...</div>;
    if (!order) return <div className="h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center font-bold text-slate-400 dark:text-slate-500 transition-colors duration-500">Pedido não encontrado.</div>;

    return (
        <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col transition-colors duration-500">
            <div className="bg-white dark:bg-slate-900 p-6 pb-8 rounded-b-[3rem] shadow-sm flex items-center gap-4 shrink-0 transition-colors duration-500">
                <button onClick={() => navigate(-1)} className="p-3 bg-slate-100 dark:bg-slate-800 rounded-2xl text-slate-600 dark:text-slate-400 transition-colors">
                    <Icons.ArrowLeft className="w-5 h-5" />
                </button>
                <div>
                    <h1 className="text-xl font-black text-slate-800 dark:text-white uppercase tracking-tighter italic">Acompanhar Pedido</h1>
                    <p className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mt-1">ID: #{order.id.slice(-6).toUpperCase()}</p>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-6">
                {/* Status Card */}
                <div className="bg-white dark:bg-slate-900 p-8 rounded-[2.5rem] shadow-sm border border-slate-100 dark:border-slate-800 flex flex-col items-center text-center transition-colors duration-500">
                    <div className="w-20 h-20 bg-indigo-50 dark:bg-indigo-900/20 rounded-full flex items-center justify-center mb-4 transition-colors">
                        <Icons.Smartphone className="w-10 h-10 text-indigo-600 dark:text-indigo-400" />
                    </div>
                    <h2 className="text-xl font-black text-slate-800 dark:text-white uppercase tracking-tighter">
                        {OrderStatusLabels[order.status as keyof typeof OrderStatusLabels] || order.status}
                    </h2>
                    <p className="text-xs font-bold text-slate-400 dark:text-slate-500 mt-2">Seu pedido está sendo preparado com muito carinho!</p>
                </div>

                {/* Chat Area */}
                <div className="bg-white dark:bg-slate-900 rounded-[2.5rem] shadow-sm border border-slate-100 dark:border-slate-800 flex flex-col h-[400px] transition-colors duration-500">
                    <div className="p-5 border-b border-slate-50 dark:border-slate-800 flex items-center justify-between">
                        <h3 className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">Chat com a Loja</h3>
                        <div className="w-2 h-2 bg-emerald-500 rounded-full"></div>
                    </div>
                    <div className="flex-1 overflow-y-auto p-6 space-y-4">
                        {messages.length === 0 && (
                            <p className="text-center text-[10px] text-slate-300 font-bold uppercase py-10">Inicie uma conversa se precisar</p>
                        )}
                        {messages.map((msg, i) => (
                            <div key={i} className={`flex ${msg.sender === 'CLIENT' ? 'justify-end' : 'justify-start'}`}>
                                <div className={`max-w-[80%] p-4 rounded-3xl text-sm font-bold ${msg.sender === 'CLIENT' ? 'bg-indigo-600 text-white rounded-tr-none' : 'bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-100 rounded-tl-none'}`}>
                                    {msg.content}
                                </div>
                            </div>
                        ))}
                        <div ref={chatEndRef} />
                    </div>
                    <form onSubmit={handleSendMessage} className="p-4 bg-slate-50 dark:bg-slate-950/50 rounded-b-[2.5rem] flex gap-2 transition-colors">
                        <input
                            type="text"
                            className="flex-1 p-3 bg-white dark:bg-slate-800 border-none rounded-2xl text-sm font-bold text-slate-800 dark:text-white focus:ring-2 focus:ring-indigo-100 dark:focus:ring-indigo-900/30 transition-all outline-none"
                            placeholder="Dúvida sobre o pedido?"
                            value={newMessage}
                            onChange={e => setNewMessage(e.target.value)}
                        />
                        <button type="submit" className="w-12 h-12 bg-indigo-600 text-white rounded-2xl flex items-center justify-center shadow-lg shadow-indigo-100 dark:shadow-none active:scale-95 transition-all">
                            <Icons.Smartphone className="w-5 h-5 -rotate-90" />
                        </button>
                    </form>
                </div>
            </div>
        </div>
    );
};

export default OrderDetails;
