export const usePrinter = () => {
    const printElement = async (elementId: string) => {
        const element = document.getElementById(elementId);
        if (!element) {
            console.error(`Elemento com ID ${elementId} não encontrado.`);
            return;
        }

        // Use the browser's native print dialog
        // Elements should be hidden/visible via CSS @media print
        window.print();
    };

    return { printElement };
};
