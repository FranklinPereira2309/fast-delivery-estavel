import { Request, Response } from 'express';
import prisma from '../prisma';
import bcrypt from 'bcryptjs';

export const getDrivers = async (req: Request, res: Response) => {
    const drivers = await prisma.deliveryDriver.findMany();
    const mappedDrivers = drivers.map(d => ({
        ...d,
        vehicle: {
            plate: d.vehiclePlate,
            model: d.vehicleModel,
            brand: d.vehicleBrand,
            type: d.vehicleType
        }
    }));
    res.json(mappedDrivers);
};

export const saveDriver = async (req: Request, res: Response) => {
    try {
        const data = req.body;
        console.log('Receiving driver data:', data);
        const { vehicle, ...rest } = data;

        if (!vehicle) {
            console.error('Vehicle data missing');
            return res.status(400).json({ error: 'Vehicle data is required' });
        }

        const driverData = {
            ...rest,
            vehiclePlate: vehicle.plate || 'N/A',
            vehicleModel: vehicle.model || '',
            vehicleBrand: vehicle.brand || '',
            vehicleType: vehicle.type || 'Moto'
        };

        console.log('Saving driver with data:', driverData);

        const driver = await prisma.deliveryDriver.upsert({
            where: { id: data.id || '' },
            update: driverData,
            create: driverData
        });

        const responseData = {
            ...driver,
            vehicle: {
                plate: driver.vehiclePlate,
                model: driver.vehicleModel,
                brand: driver.vehicleBrand,
                type: driver.vehicleType
            }
        };

        console.log('Driver saved successfully:', responseData.id);
        res.json(responseData);
    } catch (error: any) {
        console.error('Error saving driver:', error);
        res.status(500).json({ error: error.message });
    }
};

export const deleteDriver = async (req: Request, res: Response) => {
    const id = req.params.id as string;
    await prisma.deliveryDriver.delete({ where: { id: id as string } });
    res.json({ message: 'Motorista removido' });
};

export const getRejections = async (req: Request, res: Response) => {
    const rejections = await prisma.orderRejection.findMany();
    res.json(rejections);
};

export const toggleDriverStatus = async (req: Request, res: Response) => {
    const { id, active } = req.body;
    try {
        await prisma.deliveryDriver.update({
            where: { id },
            data: { active }
        });
        res.json({ message: 'Status alterado' });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

export const resetDriver = async (req: Request, res: Response) => {
    const { id } = req.body;
    try {
        const driver = await prisma.deliveryDriver.findUnique({ where: { id } });
        if (!driver || !driver.email) {
            return res.status(404).json({ error: 'Entregador ou e-mail não encontrado' });
        }

        // Find associated user
        const user = await prisma.user.findFirst({
            where: {
                email: {
                    equals: driver.email.toLowerCase(),
                    mode: 'insensitive'
                }
            }
        });

        if (user) {
            const hashedPassword = await bcrypt.hash('123', 10);
            await prisma.user.update({
                where: { id: user.id },
                data: {
                    password: hashedPassword,
                    mustChangePassword: true,
                    recoveryCode: Math.random().toString(36).substring(2, 8).toUpperCase()
                }
            });
            res.json({ message: 'Segurança resetada' });
        } else {
            res.status(404).json({ error: 'Conta de usuário não vinculada ao e-mail do entregador' });
        }
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};
