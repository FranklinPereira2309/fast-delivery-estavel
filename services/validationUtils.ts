
export const validateEmail = (email: string): boolean => {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(email);
};

export const validateCPF = (cpf: string): boolean => {
    const cleanCPF = cpf.replace(/\D/g, '');
    if (cleanCPF.length !== 11 || /^(\d)\1+$/.test(cleanCPF)) return false;

    let sum = 0;
    let rest;

    for (let i = 1; i <= 9; i++) sum = sum + parseInt(cleanCPF.substring(i - 1, i)) * (11 - i);
    rest = (sum * 10) % 11;
    if ((rest === 10) || (rest === 11)) rest = 0;
    if (rest !== parseInt(cleanCPF.substring(9, 10))) return false;

    sum = 0;
    for (let i = 1; i <= 10; i++) sum = sum + parseInt(cleanCPF.substring(i - 1, i)) * (12 - i);
    rest = (sum * 10) % 11;
    if ((rest === 10) || (rest === 11)) rest = 0;
    if (rest !== parseInt(cleanCPF.substring(10, 11))) return false;

    return true;
};

export const validateCNPJ = (cnpj: string): boolean => {
    const cleanCNPJ = cnpj.replace(/\D/g, '');
    if (cleanCNPJ.length !== 14 || /^(\d)\1+$/.test(cleanCNPJ)) return false;

    let length = cleanCNPJ.length - 2;
    let numbers = cleanCNPJ.substring(0, length);
    const digits = cleanCNPJ.substring(length);
    let sum = 0;
    let pos = length - 7;

    for (let i = length; i >= 1; i--) {
        sum += parseInt(numbers.charAt(length - i)) * pos--;
        if (pos < 2) pos = 9;
    }

    let result = sum % 11 < 2 ? 0 : 11 - (sum % 11);
    if (result !== parseInt(digits.charAt(0))) return false;

    length = length + 1;
    numbers = cleanCNPJ.substring(0, length);
    sum = 0;
    pos = length - 7;
    for (let i = length; i >= 1; i--) {
        sum += parseInt(numbers.charAt(length - i)) * pos--;
        if (pos < 2) pos = 9;
    }

    result = sum % 11 < 2 ? 0 : 11 - (sum % 11);
    if (result !== parseInt(digits.charAt(1))) return false;

    return true;
};

export const maskPhone = (value: string): string => {
    const cleanValue = value.replace(/\D/g, '');
    if (cleanValue.length <= 10) {
        return cleanValue
            .replace(/(\d{2})(\d)/, '($1) $2')
            .replace(/(\d{4})(\d)/, '$1-$2');
    } else {
        return cleanValue
            .replace(/(\d{2})(\d)/, '($1) $2')
            .replace(/(\d{5})(\d)/, '$1-$2')
            .slice(0, 15);
    }
};

export const maskDocument = (value: string): string => {
    const cleanValue = value.replace(/\D/g, '');
    if (cleanValue.length <= 11) {
        // CPF
        return cleanValue
            .replace(/(\d{3})(\d)/, '$1.$2')
            .replace(/(\d{3})(\d)/, '$1.$2')
            .replace(/(\d{3})(\d{1,2})/, '$1-$2')
            .slice(0, 14);
    } else {
        // CNPJ
        return cleanValue
            .replace(/(\d{2})(\d)/, '$1.$2')
            .replace(/(\d{3})(\d)/, '$1.$2')
            .replace(/(\d{3})(\d)/, '$1/$2')
            .replace(/(\d{4})(\d{1,2})/, '$1-$2')
            .slice(0, 18);
    }
};

export const validateCreditCard = (number: string): boolean => {
    const cleanNumber = number.replace(/\D/g, '');
    if (cleanNumber.length < 13 || cleanNumber.length > 19) return false;

    let sum = 0;
    let shouldDouble = false;
    for (let i = cleanNumber.length - 1; i >= 0; i--) {
        let digit = parseInt(cleanNumber.charAt(i));
        if (shouldDouble) {
            digit *= 2;
            if (digit > 9) digit -= 9;
        }
        sum += digit;
        shouldDouble = !shouldDouble;
    }
    return (sum % 10) === 0;
};

export const getCardBrand = (number: string): string => {
    const cleanNumber = number.replace(/\D/g, '');
    const re: Record<string, RegExp> = {
        visa: /^4/,
        mastercard: /^5[1-5]/,
        amex: /^3[47]/,
        elo: /^(4011(78|79)|43(1274|8935)|45(1417|7393)|50(4175|6699|67|90)|627780|63(6297|6368))/,
        hipercard: /^(606282|3841)/,
        visa_electron: /^(4026|417500|4405|4508|4844|4913|4917)/,
        maestro: /^(5018|5020|5038|6304|6759|6761|6763)/
    };

    for (const brand in re) {
        if (re[brand].test(cleanNumber)) {
            return brand.toUpperCase();
        }
    }
    return 'DESCONHECIDO';
};

export const maskCardNumber = (value: string): string => {
    return value.replace(/\D/g, '').replace(/(\d{4})(?=\d)/g, '$1 ').slice(0, 19);
};

export const maskExpiry = (value: string): string => {
    return value.replace(/\D/g, '').replace(/(\d{2})(\d)/, '$1/$2').slice(0, 5);
};
