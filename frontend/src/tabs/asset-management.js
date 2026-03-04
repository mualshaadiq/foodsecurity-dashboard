import { initAoiModal, openAoiModal } from '@/components/aoi-modal.js';
import { loadAoiList } from '@/components/aoi-list.js';
import { initAoiLayer, refreshAoiLayer, setAoiLayerVisible } from '@/map/layers/aoi-layer.js';

/**
 * Asset Management tab — layer toggles, AOI draw button, AOI list.
 * @param {maplibregl.Map} map
 */
export function initAssetManagementTab(map) {
    // Vector-tile layers (Tegola)
    _bindMultiLayerToggle(map, 'toggle-lsd',          ['lsd-fill']);
    _bindMultiLayerToggle(map, 'toggle-lbs',          ['lbs-fill']);
    _bindMultiLayerToggle(map, 'toggle-food-estate',  ['asset-polygons', 'asset-polygons-outline']);
    _bindMultiLayerToggle(map, 'toggle-irrigation',   ['irrigation-lines']);

    // Sync every layer to its checkbox's default state immediately.
    // This keeps the layers visible (or hidden) when the user switches tabs,
    // since the tab-manager no longer resets asset layers on tab changes.
    _initLayerVisibility(map);

    // AoI is served from a local GeoJSON source (not Tegola) so use a dedicated toggle.
    // initAoiLayer already calls refreshAoiLayer() internally and starts visible.
    initAoiLayer(map);
    _bindAoiToggle();

    // Reload AOIs whenever the user logs in (auth resolves after map boot)
    window.addEventListener('auth-changed', (e) => {
        if (e.detail?.authenticated) refreshAoiLayer();
    });

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

/**
 * Apply each checkbox's initial state to its corresponding map layer(s).
 * Called once at startup so the user's defaults take effect before any
 * tab switch would otherwise hide/show layers.
 */
function _initLayerVisibility(map) {
    const pairs = [
        ['toggle-lsd',          ['lsd-fill']],
        ['toggle-lbs',          ['lbs-fill']],
        ['toggle-food-estate',  ['asset-polygons', 'asset-polygons-outline']],
        ['toggle-irrigation',   ['irrigation-lines']],
    ];
    pairs.forEach(([cbId, layerIds]) => {
        const el = document.getElementById(cbId);
        if (!el) return;
        const vis = el.checked ? 'visible' : 'none';
        layerIds.forEach((id) => {
            if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', vis);
        });
    });
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
