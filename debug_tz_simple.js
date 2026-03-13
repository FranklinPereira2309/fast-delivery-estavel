
try {
    const now = new Date();
    const dayOfWeek = now.toLocaleDateString('en-US', { timeZone: 'America/Sao_Paulo', weekday: 'short' });
    const timeString = now.toLocaleTimeString('en-US', { timeZone: 'America/Sao_Paulo', hour12: false });
    
    console.log('Now (UTC):', now.toISOString());
    console.log('DayOfWeek (SP):', dayOfWeek);
    console.log('Time (SP):', timeString);
    
    const dayMap = { 'Sun': 0, 'Mon': 1, 'Tue': 2, 'Wed': 3, 'Thu': 4, 'Fri': 5, 'Sat': 6 };
    console.log('Calculated DayNum:', dayMap[dayOfWeek]);
} catch (e) {
    console.error(e);
}
