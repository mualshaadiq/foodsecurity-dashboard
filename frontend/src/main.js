// ── Styles ───────────────────────────────────────────────────────────────
import 'maplibre-gl/dist/maplibre-gl.css';
import './styles/main.css';
import './styles/navbar.css';
import './styles/tabs.css';
import './styles/sidebar.css';
import './styles/map.css';
import './styles/components.css';
import './styles/legend.css';
import './styles/charts.css';
import './styles/summary.css';
import './styles/select-field.css';

// ── Auth ─────────────────────────────────────────────────────────────────
import { authManager } from './auth/auth-manager.js';
import { initModal }   from './components/modal.js';

// ── Map core ─────────────────────────────────────────────────────────────
import { initMap, getMap }              from './map/map-init.js';
import { basemaps, currentBasemap }     from './map/basemap.js';
import { addBaseLayers }                from './map/layers/base-layers.js';
import { addAssetLayers }               from './map/layers/asset-layers.js';
import { addAILayers }                  from './map/layers/ai-layers.js';
import { addCropHealthLayers }          from './map/layers/crop-health-layers.js';
import { addDisasterLayers }            from './map/layers/disaster-layers.js';
import { addYieldLayers }               from './map/layers/yield-layers.js';
import { setupMapInteractions }         from './map/interactions.js';

// ── Tabs ──────────────────────────────────────────────────────────────────
import { TabManager }                   from './tabs/tab-manager.js';
import { initAssetManagementTab }       from './tabs/asset-management.js';
import { initAITab }                    from './tabs/ai.js';
import { initCropHealthTab }            from './tabs/crop-health.js';
import { initDisasterRiskTab }          from './tabs/disaster-risk.js';
import { initYieldPredictionTab }       from './tabs/yield-prediction.js';
import { initSummaryTab }               from './tabs/summary.js';

// ── Components ────────────────────────────────────────────────────────────
import { initSearch }                   from './components/search.js';
import { loadStats }                    from './components/stats.js';
import { initSidebarControls }          from './components/sidebar.js';
import { mountSelectFields,
         sfCategoryFilter }             from './components/select-fields.js';

// ── API ───────────────────────────────────────────────────────────────────
import { exportData }                   from './api/export.js';
import { fetchStats }                   from './api/features.js';

// ── App state ─────────────────────────────────────────────────────────────
const filters = { category: null };

// ── Bootstrap ────────────────────────────────────────────────────────────
function boot() {
    // 1. Login modal
    initModal();

    // 2. Init map
    const bm = basemaps[currentBasemap];
    const map = initMap(bm.tiles, bm.attribution, (map) => {
        // Add all layers (food-security layers default to visibility:none)
        addBaseLayers(map);
        addAssetLayers(map);
        addAILayers(map);
        addCropHealthLayers(map);
        addDisasterLayers(map);
        addYieldLayers(map);

        // Map interactions (click popups, hover cursor)
        setupMapInteractions(map);

        // Tabs
        const tabManager = new TabManager(map);
        tabManager.restoreFromHash();

        // Tab-specific controls
        initAssetManagementTab(map);
        initAITab(map);
        initCropHealthTab(map);
        initDisasterRiskTab(map);
        initYieldPredictionTab(map);

        // Summary tab (async — loads charts)
        if (authManager.isAuthenticated()) initSummaryTab();

        // Sidebar common controls
        initSidebarControls(map, filters, exportData);

        // Mount custom SelectField widgets
        mountSelectFields();

        // Search
        initSearch(map);

        // Stats (if authenticated)
        if (authManager.isAuthenticated()) loadStats(map);

        // Populate category filter
        if (authManager.isAuthenticated()) loadCategoryFilter();
    });

    // 3. Auth-changed listener
    window.addEventListener('auth-changed', (e) => {
        const map = getMap();
        if (e.detail.authenticated) {
            loadStats(map);
            loadCategoryFilter();
            initSummaryTab();
        } else {
            const statsEl = document.getElementById('stats-display');
            if (statsEl) statsEl.innerHTML = '<p>Login to view statistics</p>';
            sfCategoryFilter.setOptions([]);
        }
    });
}

async function loadCategoryFilter() {
    if (!authManager.isAuthenticated()) return;
    try {
        const stats = await fetchStats();
        const cats  = Object.keys(stats.by_category ?? {});
        sfCategoryFilter.setOptions(
            cats.map((cat) => ({
                value: cat,
                label: `${cat} (${stats.by_category[cat]})`,
            }))
        );
    } catch (err) {
        console.error('Failed to load categories:', err);
    }
}

// ── Start ────────────────────────────────────────────────────────────────
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
} else {
    boot();
}

// HMR
if (import.meta.hot) import.meta.hot.accept();
