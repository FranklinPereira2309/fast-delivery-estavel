import { Order, BusinessSettings, OrderStatusLabels } from '../types';
import { db } from './db';

export const sendOrderToThermalPrinter = async (orderToPrint: Order, settings: BusinessSettings) => {
    // Always fallback to browser print as per user request to remove printer IP config
    window.print();
    return { success: true, fallback: true };
};
