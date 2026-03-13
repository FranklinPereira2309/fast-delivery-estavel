
const options = {
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
const formatter = new Intl.DateTimeFormat('en-US', options as any);
const parts = formatter.formatToParts(new Date());
const getPart = (type: string) => parts.find(p => p.type === type)?.value;

const hour = parseInt(getPart('hour') || '0');
const minute = parseInt(getPart('minute') || '0');
const dayOfWeek = new Date().toLocaleDateString('en-US', { timeZone: 'America/Sao_Paulo', weekday: 'short' });
const dayMap = { 'Sun': 0, 'Mon': 1, 'Tue': 2, 'Wed': 3, 'Thu': 4, 'Fri': 5, 'Sat': 6 };
const currentDayNum = (dayMap as any)[dayOfWeek] ?? new Date().getDay();

console.log('Parts:', JSON.stringify(parts));
console.log('Hour:', hour);
console.log('Minute:', minute);
console.log('DayOfWeek string:', dayOfWeek);
console.log('CurrentDayNum:', currentDayNum);
