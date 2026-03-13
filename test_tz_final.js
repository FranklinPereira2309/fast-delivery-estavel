
// Teste de Regressão da Lógica de Status
function calculateStatusSimulated(nowUTC, operatingHours, isManuallyClosed = false) {
    const spString = nowUTC.toLocaleString("en-US", { timeZone: "America/Sao_Paulo" });
    const spDate = new Date(spString);
    const hour = spDate.getHours();
    const minute = spDate.getMinutes();
    const currentDayNum = spDate.getDay();
    const currentTimeInt = hour * 60 + minute;

    if (isManuallyClosed) return { status: 'offline' };

    const hours = JSON.parse(operatingHours);
    const todayConfig = hours.find(h => h.dayOfWeek === currentDayNum);

    if (!todayConfig || !todayConfig.isOpen) return { status: 'offline' };

    const openParts = todayConfig.openTime.split(':').map(Number);
    const closeParts = todayConfig.closeTime.split(':').map(Number);
    const openTimeInt = openParts[0] * 60 + openParts[1];
    let closeTimeInt = closeParts[0] * 60 + closeParts[1];

    let isOpenNow = false;
    if (closeTimeInt < openTimeInt) {
        if (currentTimeInt >= openTimeInt || currentTimeInt < closeTimeInt) isOpenNow = true;
    } else {
        if (currentTimeInt >= openTimeInt && currentTimeInt < closeTimeInt) isOpenNow = true;
    }

    return { 
        status: isOpenNow ? 'online' : 'offline',
        spTime: `${hour}:${minute}`,
        spDay: currentDayNum
    };
}

const hoursConfig = JSON.stringify([
    { dayOfWeek: 5, isOpen: true, openTime: "07:00", closeTime: "23:59" }, // Sexta (Hoje)
    { dayOfWeek: 6, isOpen: true, openTime: "08:00", closeTime: "02:00" }  // Sábado (Madrugada)
]);

// Cenário 1: SEXTA-FEIRA Manhã em SP (Aberto)
// UTC 2026-03-13 10:30 -> SP 07:30
const test1 = calculateStatusSimulated(new Date("2026-03-13T10:30:00Z"), hoursConfig);
console.log('Test 1 (Fri 07:30 SP):', test1.status === 'online' ? '✅ PASS' : '❌ FAIL', test1);

// Cenário 2: SEXTA-FEIRA Madrugada em SP (Fechado - Abre as 07:00)
// UTC 2026-03-13 06:00 -> SP 03:00
const test2 = calculateStatusSimulated(new Date("2026-03-13T06:00:00Z"), hoursConfig);
console.log('Test 2 (Fri 03:00 SP):', test2.status === 'offline' ? '✅ PASS' : '❌ FAIL', test2);

// Cenário 3: SÁBADO Noite em SP (Aberto - Turno vira meia noite)
// UTC 2026-03-14 23:00 -> SP 20:00
const test3 = calculateStatusSimulated(new Date("2026-03-14T23:00:00Z"), hoursConfig);
console.log('Test 3 (Sat 20:00 SP):', test3.status === 'online' ? '✅ PASS' : '❌ FAIL', test3);

// Cenário 4: DOMINGO Madrugada em SP (Aberto - Ainda no turno de Sábado)
// UTC 2026-03-15 04:00 -> SP 01:00
const test4 = calculateStatusSimulated(new Date("2026-03-15T04:00:00Z"), hoursConfig);
console.log('Test 4 (Sun 01:00 SP):', test4.status === 'online' ? '✅ PASS' : '❌ FAIL', test4);
