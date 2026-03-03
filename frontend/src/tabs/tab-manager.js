/**
 * TabManager — manages active tab state, sidebar panel visibility,
 * and MapLibre layer visibility per tab.
 */

/** Map of tab ID → array of MapLibre layer IDs to show when that tab is active.
 *  Analysis layers (AI, crop-health, disaster, yield) are now controlled
 *  exclusively by the floating Layer Panel (layer-panel.js). */
const TAB_LAYERS = {
    'asset-management':  ['lsd-fill', 'lsd-outline', 'lbs-fill', 'lbs-outline', 'asset-polygons', 'asset-polygons-outline', 'irrigation-lines'],
    'monitoring-setting': [],
    'summary':           [],
    'imagery':           [], // imagery layers handled separately by imagery.js
};

/** All food-security layer IDs managed by tab visibility (hidden by default) */
const ALL_FS_LAYERS = Object.values(TAB_LAYERS).flat();

/** Tabs that show temporal data and should display the time slider */
const TEMPORAL_TABS = new Set(['imagery']);

export class TabManager {
    /**
     * @param {maplibregl.Map} map
     */
    constructor(map) {
        this.map = map;
        this.activeTab = null;
        this._bindUI();
    }

    _bindUI() {
        document.querySelectorAll('.tab-btn').forEach((btn) => {
            btn.addEventListener('click', () => {
                this.activateTab(btn.dataset.tab);
            });
        });
    }

    /**
     * Switch to a tab.
     * @param {string} tabId - matches data-tab attr and panel id prefix
     */
    activateTab(tabId) {
        if (this.activeTab === tabId) return;
        this.activeTab = tabId;

        // Update tab button active state
        document.querySelectorAll('.tab-btn').forEach((btn) => {
            btn.classList.toggle('active', btn.dataset.tab === tabId);
        });

        // Show/hide sidebar panels (class-driven so CSS transitions work)
        document.querySelectorAll('.tab-panel').forEach((panel) => {
            panel.classList.toggle('active', panel.id === `panel-${tabId}`);
        });

        // Toggle summary layout
        document.querySelector('.container').classList.toggle('summary-mode', tabId === 'summary');

        // Toggle map layer visibility
        this._applyLayerVisibility(tabId);

        // Notify time slider and other listeners whether this is a temporal tab
        window.dispatchEvent(new CustomEvent('temporal-tab-changed', {
            detail: { tabId, isTemporal: TEMPORAL_TABS.has(tabId) },
        }));

        // Update URL hash for bookmarking
        window.location.hash = tabId;
    }

    _applyLayerVisibility(tabId) {
        const visible = new Set(TAB_LAYERS[tabId] ?? []);

        ALL_FS_LAYERS.forEach((layerId) => {
            if (this.map.getLayer(layerId)) {
                this.map.setLayoutProperty(
                    layerId,
                    'visibility',
                    visible.has(layerId) ? 'visible' : 'none'
                );
            }
        });
    }

    /** Restore active tab from URL hash on page load */
    restoreFromHash() {
        const hash = window.location.hash.replace('#', '');
        const validTabs = Object.keys(TAB_LAYERS);
        const initial = validTabs.includes(hash) ? hash : 'asset-management';
        this.activateTab(initial);
    }
}
