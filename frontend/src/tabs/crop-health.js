/**
 * Crop Health Monitoring tab — NDVI layer, fertilizer zone toggle.
 * Temporal filtering is handled by the global time slider (time-slider.js).
 * @param {maplibregl.Map} map
 */
export function initCropHealthTab(map) {
    _bindVisibilityToggle(map, 'toggle-ndvi',        'ndvi-zones');
    _bindVisibilityToggle(map, 'toggle-fertilizer',  'fertilizer-zones');

    // React to global time slider date changes
    window.addEventListener('temporal-date-changed', (e) => {
        const { date } = e.detail;
        // Source is already re-fetched by time-slider.js via setTiles().
        // Add any Crop-Health-specific tile logic here when backend supports date params.
        console.debug('[crop-health] temporal date changed ->', date);
    });
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
