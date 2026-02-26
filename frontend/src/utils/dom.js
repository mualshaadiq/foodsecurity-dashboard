/**
 * Lightweight DOM helpers used across the app.
 */

/** @param {string} id @returns {HTMLElement|null} */
export const getEl = (id) => document.getElementById(id);

/** Show an element (removes display:none) */
export const show = (el) => {
    if (el) el.style.display = '';
};

/** Hide an element (sets display:none) */
export const hide = (el) => {
    if (el) el.style.display = 'none';
};

/** Toggle visibility */
export const toggle = (el, visible) => {
    if (el) el.style.display = visible ? '' : 'none';
};

/**
 * Set innerHTML safely (no sanitisation — keep inputs trusted).
 * @param {string} id
 * @param {string} html
 */
export const setHTML = (id, html) => {
    const el = getEl(id);
    if (el) el.innerHTML = html;
};
