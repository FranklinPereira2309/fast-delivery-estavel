import { Request, Response } from 'express';
import prisma from '../prisma';

export const getSettings = async (req: Request, res: Response) => {
    const settings = await prisma.businessSettings.findUnique({
        where: { key: 'main' }
    });
    res.json(settings);
};

export const saveSettings = async (req: Request, res: Response) => {
    const data = req.body;
    const settings = await prisma.businessSettings.upsert({
        where: { key: 'main' },
        update: data,
        create: { ...data, key: 'main' }
    });
    res.json(settings);
};
