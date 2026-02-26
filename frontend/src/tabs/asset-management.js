import { initAoiModal, openAoiModal } from '@/components/aoi-modal.js';
import { loadAoiList } from '@/components/aoi-list.js';
import { initAoiLayer, refreshAoiLayer, setAoiLayerVisible } from '@/map/layers/aoi-layer.js';

/**
 * Asset Management tab — layer toggles, AOI draw button, AOI list.
 * @param {maplibregl.Map} map
 */
export function initAssetManagementTab(map) {
    // Vector-tile layers (Tegola)
    _bindLayerToggle(map, 'toggle-lsd',         'asset-polygons',   'lsd');
    _bindLayerToggle(map, 'toggle-lbs',         'asset-polygons',   'lbs');
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
