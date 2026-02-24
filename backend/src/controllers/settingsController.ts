import { Request, Response } from 'express';
import prisma from '../prisma';
import { updateCacheAndEmit } from '../storeStatusCache';


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
    updateCacheAndEmit(settings.isManuallyClosed, settings.operatingHours);
    res.json(settings);
};
