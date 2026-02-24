import prisma from './prisma';

async function check() {
    try {
        const result: any = await prisma.$queryRaw`
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_name = 'BusinessSettings'
        `;
        console.log('--- TABLE COLUMNS ---');
        console.log(result);
    } catch (e) {
        console.error('Error fetching columns:', e);
    }
}

check();
