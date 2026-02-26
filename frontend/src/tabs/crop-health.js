import { getNDVI } from '@/api/food-security.js';

/**
 * Crop Health Monitoring tab — NDVI layer + date range slider, fertilizer zone toggle.
 * Wires up the #panel-crop-health sidebar panel.
 * @param {maplibregl.Map} map
 */
export function initCropHealthTab(map) {
    _bindVisibilityToggle(map, 'toggle-ndvi',        'ndvi-zones');
    _bindVisibilityToggle(map, 'toggle-fertilizer',  'fertilizer-zones');

    const dateSlider = document.getElementById('ndvi-date-slider');
    const dateLabel  = document.getElementById('ndvi-date-label');

    if (dateSlider) {
        dateSlider.addEventListener('input', () => {
            if (dateLabel) dateLabel.textContent = dateSlider.value;
            // TODO: reload NDVI tile source filtered to selected date
        });
    }
}

function _bindVisibilityToggle(map, checkboxId, layerId) {
    const el = document.getElementById(checkboxId);
    if (!el) return;
    el.addEventListener('change', () => {
        if (map.getLayer(layerId)) {
            map.setLayoutProperty(layerId, 'visibility', el.checked ? 'visible' : 'none');
        }
    });
}
