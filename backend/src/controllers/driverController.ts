import { Request, Response } from 'express';
import prisma from '../prisma';

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
    const { id } = req.params;
    await prisma.deliveryDriver.delete({ where: { id: id as string } });
    res.json({ message: 'Motorista removido' });
};
