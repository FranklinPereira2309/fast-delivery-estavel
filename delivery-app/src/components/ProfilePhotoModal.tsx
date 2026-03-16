import React, { useRef } from 'react';
import { Camera, Image as ImageIcon, Trash2, X } from 'lucide-react';

interface ProfilePhotoModalProps {
    isOpen: boolean;
    onClose: () => void;
    onPhotoSelected: (base64: string | null) => void;
}

const ProfilePhotoModal: React.FC<ProfilePhotoModalProps> = ({ isOpen, onClose, onPhotoSelected }) => {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const cameraInputRef = useRef<HTMLInputElement>(null);

    if (!isOpen) return null;

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onloadend = () => {
                onPhotoSelected(reader.result as string);
                onClose();
            };
            reader.readAsDataURL(file);
        }
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 animate-in fade-in duration-300">
            <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={onClose}></div>
            
            <div className="bg-white w-full max-w-sm rounded-[2.5rem] p-8 shadow-2xl relative animate-in zoom-in slide-in-from-bottom-8 duration-500">
                <div className="flex justify-between items-center mb-10">
                    <h2 className="text-2xl font-black text-slate-800 tracking-tight">Foto de Perfil</h2>
                    <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full transition-colors text-slate-400 hover:text-slate-600">
                        <X className="w-6 h-6" />
                    </button>
                </div>

                <div className="flex flex-col gap-4">
                    {/* Tirar Foto */}
                    <button 
                        onClick={() => cameraInputRef.current?.click()}
                        className="w-full p-5 bg-[#1e293b] text-white rounded-[2rem] flex items-center gap-4 font-bold text-lg hover:bg-[#0f172a] transition-all active:scale-[0.98] shadow-lg shadow-slate-200"
                    >
                        <div className="bg-white/10 p-2 rounded-xl">
                            <Camera className="w-6 h-6" />
                        </div>
                        Tirar foto
                    </button>
                    <input 
                        type="file" 
                        ref={cameraInputRef} 
                        accept="image/*" 
                        capture="user" 
                        className="hidden" 
                        onChange={(e) => handleFileChange(e)} 
                    />

                    {/* Escolher da Galeria */}
                    <button 
                        onClick={() => fileInputRef.current?.click()}
                        className="w-full p-5 bg-[#1e3a8a] text-white rounded-[2rem] flex items-center gap-4 font-bold text-lg hover:bg-[#1e40af] transition-all active:scale-[0.98] shadow-lg shadow-blue-100"
                    >
                        <div className="bg-white/10 p-2 rounded-xl">
                            <ImageIcon className="w-6 h-6" />
                        </div>
                        Escolher da galeria
                    </button>
                    <input 
                        type="file" 
                        ref={fileInputRef} 
                        accept="image/*" 
                        className="hidden" 
                        onChange={(e) => handleFileChange(e)} 
                    />

                    {/* Remover Foto */}
                    <button 
                        onClick={() => {
                            onPhotoSelected(null);
                            onClose();
                        }}
                        className="w-full p-5 bg-white text-slate-700 border-2 border-slate-200 rounded-[2rem] flex items-center gap-4 font-bold text-lg hover:bg-slate-50 transition-all active:scale-[0.98] group"
                    >
                        <div className="bg-rose-50 p-2 rounded-xl text-rose-500 group-hover:bg-rose-100 transition-colors">
                            <Trash2 className="w-6 h-6" />
                        </div>
                        Remover foto
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ProfilePhotoModal;
