/**
 * Asset Management tab — layer toggles, AOI draw button, legend.
 * Wires up the #panel-asset-management sidebar panel.
 * @param {maplibregl.Map} map
 */
export function initAssetManagementTab(map) {
    _bindLayerToggle(map, 'toggle-lsd',         'asset-polygons',         'lsd');
    _bindLayerToggle(map, 'toggle-lbs',         'asset-polygons',         'lbs');
    _bindLayerToggle(map, 'toggle-food-estate', 'asset-polygons',         'food_estate');
    _bindLayerToggle(map, 'toggle-aoi',         'asset-polygons',         'aoi');
    _bindLayerToggle(map, 'toggle-irrigation',  'irrigation-lines',       null);

    const drawBtn = document.getElementById('draw-aoi-btn');
    if (drawBtn) {
        drawBtn.addEventListener('click', () => {
            // TODO: activate AOI draw mode (Phase 5.7)
            alert('AOI draw mode — coming soon');
        });
    }
}

function _bindLayerToggle(map, checkboxId, layerId, filterCategory) {
    const el = document.getElementById(checkboxId);
    if (!el) return;

    el.addEventListener('change', () => {
        if (!map.getLayer(layerId)) return;

        if (filterCategory) {
            // Layer is shared; apply/remove a filter expression for this category
            // Individual category filters are handled by the layer filter in asset-layers.js
            // For now simply toggle overall visibility when the relevant checkbox changes
        }

        const vis = el.checked ? 'visible' : 'none';
        map.setLayoutProperty(layerId, 'visibility', vis);
    });
}
