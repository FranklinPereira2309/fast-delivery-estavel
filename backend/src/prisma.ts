import { PrismaClient } from '@prisma/client';
import 'dotenv/config';

// Força o limite de 1 conexão para evitar estourar a RAM no plano Free do Render
const databaseUrl = process.env.DATABASE_URL || '';
const finalUrl = databaseUrl.includes('connection_limit')
    ? databaseUrl
    : `${databaseUrl}${databaseUrl.includes('?') ? '&' : '?'}connection_limit=1`;

export const prisma = new PrismaClient({
    datasources: {
        db: {
            url: finalUrl
        }
    }
});

export default prisma;
