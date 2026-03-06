/**
 * TabManager — manages active tab state and sidebar panel visibility.
 *
 * Layer visibility is owned entirely by the floating Layer Panel checkboxes
 * (layer-panel.js) — tab switches no longer show/hide map layers.
 */

import { getSelectedAoi } from '@/utils/aoi-store.js';

/** Tabs that require an AoI to be selected. */
const ANALYSIS_TABS = new Set([
    'imagery', 'monitoring-setting', 'ai',
    'crop-health', 'disaster-risk', 'yield-prediction',
]);

/** All registered tab IDs (drives restoreFromHash). */
const ALL_TABS = [
    'asset-management', 'monitoring-setting', 'summary', 'imagery',
    'ai', 'crop-health', 'disaster-risk', 'yield-prediction',
];

/** All tabs show the time slider (global). */
const TEMPORAL_TABS = new Set(ALL_TABS);

export class TabManager {
    /**
     * @param {maplibregl.Map} map
     */
    constructor(map) {
        this.map = map;
        this.activeTab = null;
        this._bindUI();

        // Re-evaluate the AoI notice whenever selection changes.
        window.addEventListener('aoi-changed', () => {
            if (this.activeTab) this._updateAoiNotice(this.activeTab);
        });
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

        // Update AoI required notice for analysis tabs
        this._updateAoiNotice(tabId);

        // Notify time slider and other listeners whether this is a temporal tab
        window.dispatchEvent(new CustomEvent('temporal-tab-changed', {
            detail: { tabId, isTemporal: TEMPORAL_TABS.has(tabId) },
        }));

        // Update URL hash for bookmarking
        window.location.hash = tabId;
    }

    /**
     * Show or hide the AoI-required notice banner in an analysis tab panel.
     * The notice is shown whenever no AoI is selected; hidden once one is.
     */
    _updateAoiNotice(tabId) {
        if (!ANALYSIS_TABS.has(tabId)) return;
        const panel = document.getElementById(`panel-${tabId}`);
        if (!panel) return;
        const notice = panel.querySelector('.aoi-notice');
        if (!notice) return;
        notice.hidden = Boolean(getSelectedAoi());
    }

    /** Restore active tab from URL hash on page load */
    restoreFromHash() {
        const hash = window.location.hash.replace('#', '');
        const initial = ALL_TABS.includes(hash) ? hash : 'asset-management';
        this.activateTab(initial);
    }
}
