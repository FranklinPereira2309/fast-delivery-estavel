import React, { useState, useEffect } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { db, BusinessSettings } from '../services/db';
import { Icons } from '../constants';

const QRCodes: React.FC = () => {
    const [settings, setSettings] = useState<BusinessSettings | null>(null);

    useEffect(() => {
        const init = async () => {
            const s = await db.getSettings();
            setSettings(s);
        };
        init();
    }, []);

    if (!settings) return null;

    // Base da URL do cardápio digital (via Variável de Ambiente ou Local)
    const MENU_BASE_URL = import.meta.env.VITE_MENU_URL || 'http://localhost:5173';

    const tables = Array.from({ length: settings.tableCount }).map((_, i) => i + 1);

    return (
        <div className="flex flex-col h-full gap-8">
            {/* Header (Oculto na impressão) */}
            <div className="flex justify-between items-center bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm print:hidden">
                <div>
                    <h2 className="text-2xl font-black text-slate-800 uppercase tracking-tighter">QR Codes das Mesas</h2>
                    <p className="text-xs text-slate-400 font-bold uppercase tracking-widest">
                        Gere e imprima os QR Codes para o Menu Digital
                    </p>
                </div>
                <div className="flex items-center gap-4">
                    <button
                        onClick={() => window.print()}
                        className="px-6 py-3 bg-slate-900 text-white rounded-xl text-xs font-black uppercase hover:bg-slate-800 transition-all flex items-center gap-2 shadow-lg"
                    >
                        <Icons.Print />
                        Imprimir Todos
                    </button>
                </div>
            </div>

            {/* Grid de QR Codes */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-8 overflow-y-auto pb-12 print:overflow-visible print:pb-0 print:grid-cols-3 print:gap-4">
                {tables.map((tableNum) => {
                    const tableUrl = `${MENU_BASE_URL}/?mesa=${tableNum}`;

                    return (
                        <div
                            key={tableNum}
                            className="bg-white p-6 rounded-[2rem] border-2 border-dashed border-slate-200 flex flex-col items-center justify-center gap-4 print:border-solid print:border-black print:rounded-xl print:p-4 break-inside-avoid"
                        >
                            <div className="text-center">
                                <h3 className="text-xl font-black text-slate-800 uppercase tracking-tighter print:text-lg">
                                    Mesa {tableNum}
                                </h3>
                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest print:text-[8px]">
                                    Escaneie para Pedir
                                </p>
                            </div>

                            <div className="p-4 bg-white rounded-2xl shadow-sm border border-slate-100 print:shadow-none print:border-none print:p-2">
                                <QRCodeSVG
                                    value={tableUrl}
                                    size={140}
                                    level="H"
                                    includeMargin={false}
                                    className="print:w-[120px] print:h-[120px]"
                                />
                            </div>

                            <div className="text-center mt-2 opacity-30 print:opacity-100 print:mt-1">
                                <p className="text-[8px] font-bold uppercase tracking-widest break-all w-full select-all">
                                    {tableUrl}
                                </p>
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Estilos de Impressão Específicos para a página toda */}
            <style>{`
        @media print {
          body {
            background-color: white !important;
          }
          /* Esconder Sidebar (No Layout.tsx ela já pode estar visível, então forçamos aqui) */
          aside {
            display: none !important;
          }
          /* Esconder Header do App.tsx/Layout.tsx */
          header {
            display: none !important;
          }
          /* O Main Content ocupa 100% da tela na impressão e reseta padding/overflow */
          main {
            padding: 0 !important;
            overflow: visible !important;
          }
          section {
            padding: 0 !important;
            overflow: visible !important;
          }
        }
      `}</style>
        </div>
    );
};

export default QRCodes;
