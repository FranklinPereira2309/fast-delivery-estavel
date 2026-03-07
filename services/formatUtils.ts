import { Client } from '../types';
import { toTitleCase } from './validationUtils';

/**
 * Formats a client's structured address into a single string for display or printing.
 */
export const formatAddress = (client: Client | any): string => {
    if (!client) return 'Nenhum endereço';

    const { street, addressNumber, complement, neighborhood, city, state, cep } = client;

    if (!street && (!client.addresses || client.addresses.length === 0)) {
        return 'Endereço não informado';
    }

    // Fallback to legacy address array if structured fields are missing
    if (!street && client.addresses && client.addresses.length > 0) {
        return client.addresses[0];
    }

    const parts = [];
    if (street) parts.push(toTitleCase(street));
    if (addressNumber) parts.push(addressNumber);
    if (complement) parts.push(complement);

    let mainLine = parts.join(', ');

    const secondLineParts = [];
    if (neighborhood) secondLineParts.push(toTitleCase(neighborhood));
    if (city) secondLineParts.push(toTitleCase(city));
    if (state) secondLineParts.push(state.toUpperCase());

    const secondLine = secondLineParts.join(', ');

    let full = mainLine;
    if (secondLine) full += ` - ${secondLine}`;
    if (cep) full += ` (CEP: ${cep})`;

    return full;
};
