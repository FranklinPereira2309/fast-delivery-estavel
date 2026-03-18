import { Request, Response } from 'express';
import { printer as ThermalPrinter, types as PrinterTypes, characterSet as CharacterSet } from 'node-thermal-printer';
import { exec } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export const printReceipt = async (req: Request, res: Response): Promise<void> => {
    try {
        const { printerIp, printerPort, type, data } = req.body;

        console.log(`[PRINT] Nova requisição recebida: ${printerIp}`);

        // Validating payload
        if (!data || !data.items || !data.total) {
            res.status(400).json({ error: 'Dados do pedido ausentes ou inválidos.' });
            return;
        }

        const printerType = type === 'EPSON' ? PrinterTypes.EPSON : PrinterTypes.STAR;
        const isIpAddress = /^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/.test(printerIp || '');

        // Preparamos o caminho do arquivo temporário antecipadamente para usar como interface se for USB
        const tempFile = path.join(os.tmpdir(), `thermal_print_${Date.now()}.bin`);

        const printer = new ThermalPrinter({
            type: printerType,
            // Se for USB, usamos a interface 'file' que apenas gera o binário no caminho especificado
            // Isso evita a necessidade de carregar drivers de impressão do SO (Erro: No driver set)
            interface: isIpAddress ? `tcp://${printerIp}:${printerPort || 9100}` : `file:${tempFile}`,
            width: 32,
            characterSet: CharacterSet.PC858_EURO,
            removeSpecialCharacters: false,
            lineCharacter: "-",
        });

        if (isIpAddress) {
            const isConnected = await printer.isPrinterConnected();
            if (!isConnected) {
                res.status(503).json({ error: `Impressora de rede (${printerIp}) inacessível.` });
                return;
            }
        }

        // --- CONTEÚDO DO CUPOM (MODELO LARANJINHA) ---
        printer.alignCenter();
        printer.bold(true);
        // Título menor conforme solicitado
        printer.println((data.businessName || 'FAST DELIVERY').toUpperCase());
        printer.bold(false);
        if (data.cnpj) printer.println(`CNPJ: ${data.cnpj}`);
        
        printer.bold(true);
        printer.println("COMPROVANTE");
        printer.bold(false);
        printer.drawLine();

        printer.alignLeft();
        // Data e Hora mais compactos
        const dateObj = new Date(data.date || Date.now());
        const dateStr = dateObj.toLocaleDateString('pt-BR');
        const timeStr = dateObj.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
        printer.leftRight(`DATA: ${dateStr}`, timeStr);

        printer.println(`CLIENTE: ${(data.clientName || 'CONSUMIDOR').toUpperCase()}`);
        if(data.clientPhone) printer.println(`FONE: ${data.clientPhone}`);
        
        // Só imprime endereço se for DELIVERY
        const isDelivery = ['DELIVERY', 'OWN_DELIVERY', 'THIRD_PARTY'].includes(data.type?.toUpperCase() || '');
        if(isDelivery && data.clientAddress) {
            printer.println(`ENDEREÇO: ${data.clientAddress.toUpperCase()}`);
        }
        
        const info = [
            data.table ? `MESA: ${data.table}` : null,
            data.paymentMethod ? `PAGTO: ${data.paymentMethod}` : null
        ].filter(Boolean);
        
        if (info.length) printer.println(info.join(' | ').toUpperCase());
        printer.drawLine();

        // Itens com margem corrigida (mais colunas para o nome para evitar quebras feias)
        data.items.forEach((item: any) => {
            const QtdName = `${item.quantity}X ${item.name}`.toUpperCase();
            const Price = `R$ ${parseFloat(item.total).toFixed(2)}`;
            printer.leftRight(QtdName.substring(0, 24), Price);
        });

        printer.drawLine();
        printer.alignRight();
        printer.leftRight('SUBTOTAL:', `R$ ${parseFloat(data.subtotal || (data.total - (data.deliveryFee || 0))).toFixed(2)}`);
        
        if (data.serviceFee || data.deliveryFee) {
            printer.leftRight('TAXAS:', `R$ ${parseFloat(data.serviceFee || data.deliveryFee).toFixed(2)}`);
        }

        printer.drawLine();
        printer.bold(true);
        // Total um pouco maior mas sem exagero (1,1 ou negrito apenas)
        printer.leftRight('TOTAL:', `R$ ${parseFloat(data.total).toFixed(2)}`);
        
        printer.bold(false);
        printer.alignCenter();
        printer.println("Obrigado pela preferência!");
        // Removido printer.println(" ") para reduzir espaço vertical
        printer.cut();
        // printer.beep(); // Removido por silêncio se preferir, mas deixei se quiser sinal sonoro. Vou tirar p/ compactar logs.
        
        if (isIpAddress) {
            await printer.execute();
            console.log(`[PRINT-TCP] Impressão finalizada via IP: ${printerIp}`);
        } else {
            console.log(`[PRINT-USB] Gerando arquivo binário para spooler em: ${tempFile}`);
            
            // O execute() criará o arquivo no caminho da interface 'file:'
            await printer.execute();
            
            // Força o uso do CMD para evitar conflitos de alias do PowerShell com o comando 'copy'
            const printerPath = `\\\\127.0.0.1\\${printerIp}`;
            const command = `cmd /c copy /b "${tempFile}" "${printerPath}"`;
            
            console.log(`[PRINT-USB] Enviando para Spooler: ${command}`);

            await new Promise((resolve, reject) => {
                exec(command, (error, stdout, stderr) => {
                    // Limpeza do arquivo temporário
                    try { if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile); } catch(e) {}
                    
                    if (error) {
                        console.error('[PRINT-USB] Erro de Spooler:', error);
                        reject(new Error(`O Windows não conseguiu enviar o arquivo para a impressora "${printerIp}". Certifique-se que ela está compartilhada corretamente no Windows.`));
                    } else {
                        console.log('[PRINT-USB] Sucesso no Spooler:', stdout);
                        resolve(stdout);
                    }
                });
            });
        }
        
        res.status(200).json({ success: true, message: 'Impressão enviada com sucesso!' });
    } catch (error: any) {
        console.error('[PRINT] Erro Geral:', error);
        // Retornamos o erro detalhado para o frontend poder nos mostrar o que o Windows disse
        res.status(500).json({ 
            error: error.message || 'Falha no servidor de impressão.',
            details: error.toString(),
            stack: error.stack
        });
    }
};
