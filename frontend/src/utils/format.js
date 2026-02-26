/**
 * Format a hectare value with thousands separator and unit.
 * @param {number} ha
 * @returns {string}  e.g. "12,345 ha"
 */
export function formatHa(ha) {
    return `${Number(ha).toLocaleString('id-ID')} ha`;
}

/**
 * Format tonnes.
 * @param {number} ton
 * @returns {string}
 */
export function formatTon(ton) {
    return `${Number(ton).toLocaleString('id-ID')} ton`;
}

/**
 * Format a 0–1 ratio as a percentage string.
 * @param {number} ratio
 * @param {number} [decimals=1]
 * @returns {string}
 */
export function formatPercent(ratio, decimals = 1) {
    return `${(ratio * 100).toFixed(decimals)}%`;
}

/**
 * Format yield in tonnes per hectare.
 * @param {number} value
 * @returns {string}
 */
export function formatYield(value) {
    return `${Number(value).toFixed(2)} t/ha`;
}
