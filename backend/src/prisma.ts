import { PrismaClient } from '@prisma/client';
import 'dotenv/config';

// Força o limite de 1 conexão para evitar estourar a RAM no plano Free do Render
const databaseUrl = process.env.DATABASE_URL || '';
const isRender = databaseUrl.includes('render.com') || process.env.NODE_ENV === 'production';

// No plano free do Render usamos 1 conexão. Local/Outros usamos 3 para evitar timeouts em processos paralelos.
const connectionLimit = isRender ? 1 : 3;
const timeout = 30;

const finalUrl = databaseUrl.includes('connection_limit')
    ? databaseUrl
    : `${databaseUrl}${databaseUrl.includes('?') ? '&' : '?'}connection_limit=${connectionLimit}&pool_timeout=${timeout}`;

export const prisma = new PrismaClient({
    datasources: {
        db: {
            url: finalUrl
        }
    }
});

export default prisma;
