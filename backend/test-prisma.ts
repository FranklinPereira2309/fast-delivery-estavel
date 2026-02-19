import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';
dotenv.config();

console.log('DATABASE_URL present:', !!process.env.DATABASE_URL);
if (process.env.DATABASE_URL) {
    console.log('DATABASE_URL prefix:', process.env.DATABASE_URL.split(':')[0]);
}

try {
    console.log('Attempting new PrismaClient()...');
    const p1 = new PrismaClient();
    console.log('p1 created');
} catch (e: any) {
    console.log('p1 failed:', e.message);
}

try {
    console.log('Attempting new PrismaClient({})...');
    const p2 = new PrismaClient({});
    console.log('p2 created');
} catch (e: any) {
    console.log('p2 failed:', e.message);
}

try {
    console.log('Attempting new PrismaClient({ datasources: { db: { url: ... } } })...');
    const p3 = new PrismaClient({
        datasources: {
            db: {
                url: process.env.DATABASE_URL
            }
        }
    } as any);
    console.log('p3 created');
} catch (e: any) {
    console.log('p3 failed:', e.message);
}
