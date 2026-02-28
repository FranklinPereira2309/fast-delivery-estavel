
/**
 * Returns the current local date in YYYY-MM-DD format.
 * This avoids common issues where new Date().toISOString() returns "tomorrow" 
 * for users in negative timezones (like Brazil) after 9 PM.
 */
export const getLocalIsoDate = (date: Date = new Date()): string => {
    const offset = date.getTimezoneOffset();
    const localDate = new Date(date.getTime() - (offset * 60 * 1000));
    return localDate.toISOString().split('T')[0];
};
