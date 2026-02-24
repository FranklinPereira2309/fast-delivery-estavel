function test() {
    const options: Intl.DateTimeFormatOptions = {
        timeZone: "America/Sao_Paulo",
        hour: 'numeric',
        minute: 'numeric',
        second: 'numeric',
        weekday: 'short',
        year: 'numeric',
        month: 'numeric',
        day: 'numeric',
        hour12: false
    };
    const formatter = new Intl.DateTimeFormat('en-US', options);
    const parts = formatter.formatToParts(new Date());
    const getPart = (type: string) => parts.find(p => p.type === type)?.value;

    const hour = parseInt(getPart('hour') || '0');
    const minute = parseInt(getPart('minute') || '0');
    const dayOfWeek = new Date().toLocaleDateString('en-US', { timeZone: 'America/Sao_Paulo', weekday: 'short' });
    const dayMap: Record<string, number> = { 'Sun': 0, 'Mon': 1, 'Tue': 2, 'Wed': 3, 'Thu': 4, 'Fri': 5, 'Sat': 6 };
    const currentDayNum = dayMap[dayOfWeek] ?? new Date().getDay();

    console.log(`DayOfWeek: ${dayOfWeek}`);
    console.log(`CurrentDayNum: ${currentDayNum}`);
    console.log(`Hour: ${hour}, Minute: ${minute}`);
}

test();
