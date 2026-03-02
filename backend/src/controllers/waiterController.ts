import { Request, Response } from 'express';
import prisma from '../prisma';
import bcrypt from 'bcryptjs';

export const getWaiters = async (req: Request, res: Response) => {
    const waiters = await prisma.waiter.findMany();
    res.json(waiters);
};

export const saveWaiter = async (req: Request, res: Response) => {
    const data = req.body;
    const { email, phone, name, id } = data;

    // 1. Save Waiter
    const waiter = await prisma.waiter.upsert({
        where: { id: id || '' },
        update: { name, phone, email },
        create: { name, phone, email }
    });

    // 2. Sync with User (if email provided)
    if (email) {
        const existingUser = await prisma.user.findUnique({ where: { email } });
        const hashedPassword = await bcrypt.hash('123456', 10); // Default password for new waiters

        if (existingUser) {
            // Update existing user permissions to include waiter if not present
            const permissions = new Set(existingUser.permissions);
            permissions.add('waiter');
            await prisma.user.update({
                where: { id: existingUser.id },
                data: {
                    name,
                    phone,
                    permissions: Array.from(permissions)
                }
            });
        } else {
            // Create new user for waiter app
            await prisma.user.create({
                data: {
                    name,
                    email,
                    phone,
                    password: hashedPassword,
                    permissions: ['waiter', 'dashboard'], // Essential permissions
                    active: true
                }
            });
        }
    }

    res.json(waiter);
};

export const deleteWaiter = async (req: Request, res: Response) => {
    const id = req.params.id as string;
    const waiter = await prisma.waiter.findUnique({ where: { id } });

    if (waiter?.email) {
        // Deactivate corresponding user instead of deleting to keep history
        const user = await prisma.user.findUnique({ where: { email: waiter.email } });
        if (user) {
            await prisma.user.update({
                where: { id: user.id },
                data: { active: false }
            });
        }
    }

    await prisma.waiter.delete({ where: { id: id as string } });
    res.json({ message: 'Garçom removido' });
};
