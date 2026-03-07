
/**
 * Simple helper to title case strings
 */
const toTitleCase = (str: string) => {
    if (!str) return '';
    return str.toLowerCase().split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
};

/**
 * Formats a structured address into a single string for order persistence and display.
 */
export const formatAddress = (data: any): string => {
    if (!data) return 'Endereço não informado';

    const { street, number, addressNumber, complement, neighborhood, city, state, cep } = data;
    const actualNumber = number || addressNumber;

    if (!street) {
        return data.address || 'Endereço não informado';
    }

    const parts = [];
    if (street) parts.push(toTitleCase(street));
    if (actualNumber) parts.push(actualNumber);
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
