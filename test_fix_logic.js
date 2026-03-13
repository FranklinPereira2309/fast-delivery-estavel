
const now = new Date("2026-03-13T10:30:00Z"); // simulated UTC server time
const spString = now.toLocaleString("en-US", { timeZone: "America/Sao_Paulo" });
const spDate = new Date(spString);

console.log('UTC Now:', now.toISOString());
console.log('SP String:', spString);
console.log('SP Date getHours():', spDate.getHours());
console.log('SP Date getDay():', spDate.getDay());
console.log('SP Date getMinutes():', spDate.getMinutes());
