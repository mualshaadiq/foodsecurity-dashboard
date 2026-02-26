/**
 * Render a color-swatch legend into a container element.
 *
 * @param {HTMLElement} container
 * @param {Array<{color: string, label: string}>} items
 */
export function renderLegend(container, items) {
    container.innerHTML = items
        .map(
            ({ color, label }) => `
            <div class="legend-item">
                <span class="legend-swatch" style="background:${color};"></span>
                <span class="legend-label">${label}</span>
            </div>`
        )
        .join('');
}

// Predefined legends for each food security layer group

export const ASSET_LEGEND = [
    { color: '#4ade80', label: 'LSD' },
    { color: '#facc15', label: 'LBS' },
    { color: '#f97316', label: 'Food Estate' },
    { color: '#a78bfa', label: 'AOI' },
    { color: '#38bdf8', label: 'Irrigation' },
];

export const NDVI_LEGEND = [
    { color: '#dc2626', label: 'Critical  (<0.2)' },
    { color: '#f97316', label: 'Low  (0.2–0.4)' },
    { color: '#facc15', label: 'Moderate  (0.4–0.6)' },
    { color: '#16a34a', label: 'Healthy  (>0.6)' },
];

export const CROP_LEGEND = [
    { color: '#16a34a', label: 'Rice' },
    { color: '#ca8a04', label: 'Corn' },
    { color: '#7c3aed', label: 'Soybean' },
    { color: '#0891b2', label: 'Sugarcane' },
    { color: '#94a3b8', label: 'Other' },
];

export const FLOOD_LEGEND = [
    { color: '#dc2626', label: 'High Risk' },
    { color: '#f97316', label: 'Medium Risk' },
    { color: '#fbbf24', label: 'Low Risk' },
];

export const YIELD_LEGEND = [
    { color: '#fee2e2', label: '0–2 t/ha' },
    { color: '#fca5a5', label: '2–4 t/ha' },
    { color: '#fde68a', label: '4–6 t/ha' },
    { color: '#86efac', label: '6–8 t/ha' },
    { color: '#16a34a', label: '>8 t/ha' },
];
