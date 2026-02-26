/**
 * AI tab — Farm Boundary (delineation) + Crop Classification controls.
 * Wires up the #panel-ai sidebar panel.
 * @param {maplibregl.Map} map
 */
export function initAITab(map) {
    _bindVisibilityToggle(map, 'toggle-farm-boundary',    'farm-boundary');
    _bindVisibilityToggle(map, 'toggle-farm-boundary',    'farm-boundary-outline');
    _bindVisibilityToggle(map, 'toggle-crop-classification', 'crop-classification');
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
