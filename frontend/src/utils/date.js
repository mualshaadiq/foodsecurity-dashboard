/**
 * Format a JavaScript Date or ISO string to DD/MM/YYYY.
 * @param {Date|string} date
 * @returns {string}
 */
export function formatDate(date) {
    const d = date instanceof Date ? date : new Date(date);
    return d.toLocaleDateString('id-ID', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

/**
 * Format a month/year as "Januari 2026".
 * @param {number} month - 1–12
 * @param {number} year
 * @returns {string}
 */
export function monthYear(month, year) {
    return new Date(year, month - 1, 1).toLocaleDateString('id-ID', {
        month: 'long',
        year: 'numeric',
    });
}

/**
 * Format an ISO date string into YYYY-MM-DD.
 * @param {Date|string} date
 * @returns {string}
 */
export function toISODate(date) {
    const d = date instanceof Date ? date : new Date(date);
    return d.toISOString().split('T')[0];
}
