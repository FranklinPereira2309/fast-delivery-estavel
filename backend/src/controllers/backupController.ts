import { Request, Response } from 'express';
import { spawn } from 'child_process';

export const generateBackup = async (req: Request, res: Response) => {
    try {
        const dbUrl = process.env.DATABASE_URL;
        if (!dbUrl) {
            console.error('DATABASE_URL is not defined in environment variables');
            return res.status(500).json({ error: 'Configuração do banco de dados não encontrada.' });
        }

        const date = new Date().toISOString().split('T')[0];
        const filename = `backup-fast-delivery-${date}.sql`;

        console.log(`Iniciando backup do banco de dados: ${filename}`);

        // Define os headers para download
        res.setHeader('Content-Type', 'application/octet-stream');
        res.setHeader('Content-Disposition', `attachment; filename=${filename}`);

        // O pg_dump pode aceitar a URL de conexão diretamente
        const pgDump = spawn('pg_dump', [dbUrl]);

        pgDump.stdout.pipe(res);

        let errorOutput = '';
        pgDump.stderr.on('data', (data) => {
            errorOutput += data.toString();
        });

        pgDump.on('close', (code) => {
            if (code !== 0) {
                console.error(`pg_dump falhou com código ${code}: ${errorOutput}`);
            } else {
                console.log('Backup concluído com sucesso e enviado para o cliente.');
            }
        });

        pgDump.on('error', (err) => {
            console.error('Erro ao iniciar pg_dump:', err);
            if (!res.headersSent) {
                res.status(500).json({ error: 'Utilitário pg_dump não encontrado ou erro ao iniciar.' });
            }
        });

    } catch (error) {
        console.error('Erro no backupController:', error);
        if (!res.headersSent) {
            res.status(500).json({ error: 'Erro interno ao gerar backup.' });
        }
    }
};
