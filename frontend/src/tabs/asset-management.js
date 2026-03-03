import { initAoiModal, openAoiModal } from '@/components/aoi-modal.js';
import { loadAoiList } from '@/components/aoi-list.js';
import { initAoiLayer, refreshAoiLayer, setAoiLayerVisible } from '@/map/layers/aoi-layer.js';

/**
 * Asset Management tab — layer toggles, AOI draw button, AOI list.
 * @param {maplibregl.Map} map
 */
export function initAssetManagementTab(map) {
    // Vector-tile layers (Tegola)
    _bindMultiLayerToggle(map, 'toggle-lsd', ['lsd-fill']);
    // LBS has its own dedicated source-layer served from food_monitoring Tegola map
    _bindMultiLayerToggle(map, 'toggle-lbs', ['lbs-fill']);
    _bindLayerToggle(map, 'toggle-food-estate', 'asset-polygons',   'food_estate');
    _bindLayerToggle(map, 'toggle-irrigation',  'irrigation-lines', null);

    // AoI is served from a local GeoJSON source (not Tegola) so use a dedicated toggle
    initAoiLayer(map);
    _bindAoiToggle();

    // On save: refresh list AND map layer
    const _onAoiSave = () => {
        loadAoiList();
        refreshAoiLayer();
    };

    // Initialise AoI modal
    initAoiModal(map, _onAoiSave);

    // Draw AoI button opens the modal
    const drawBtn = document.getElementById('draw-aoi-btn');
    if (drawBtn) drawBtn.addEventListener('click', () => openAoiModal());

    // Initial list load (will show "Login to manage" if not authenticated)
    loadAoiList();

    // Reload list on login/logout
    window.addEventListener('auth-changed', () => loadAoiList());
}

function _bindAoiToggle() {
    const el = document.getElementById('toggle-aoi');
    if (!el) return;
    el.addEventListener('change', async () => {
        setAoiLayerVisible(el.checked);
        if (el.checked) {
            await refreshAoiLayer();
        }
    });
}

/**
 * Toggle a single Tegola-backed layer (optionally scoped to a category).
 */
function _bindLayerToggle(map, checkboxId, layerId, filterCategory) {
    const el = document.getElementById(checkboxId);
    if (!el) return;

    el.addEventListener('change', () => {
        if (!map.getLayer(layerId)) return;

        if (filterCategory) {
            // Layer is shared; for now simply toggle overall visibility
            // (individual category filters can be added later).
        }

        const vis = el.checked ? 'visible' : 'none';
        map.setLayoutProperty(layerId, 'visibility', vis);
    });
}

/**
 * Toggle multiple layers at once (e.g. a fill + outline pair).
 */
function _bindMultiLayerToggle(map, checkboxId, layerIds) {
    const el = document.getElementById(checkboxId);
    if (!el) return;

    el.addEventListener('change', () => {
        const vis = el.checked ? 'visible' : 'none';
        layerIds.forEach(id => {
            if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', vis);
        });
    });
}
