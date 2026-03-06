/**
 * monitoring-setting.js — "Monitoring Setting" tab
 *
 * Provides:
 *  - AOI selector (populated from authenticated API)
 *  - Per-layer analysis schedule configuration (interval + alert threshold)
 *  - "Last Run" status grid
 *  - Save Schedule / Run Now buttons
 */

import { getAOIs }        from '@/api/food-security.js';
import { getLatestScene, runAnalysis } from '@/api/food-security.js';
import { authManager }    from '@/auth/auth-manager.js';
import { setSelectedAoi } from '@/utils/aoi-store.js';

// ── Layer definitions ─────────────────────────────────────────────────────
const MONITORING_LAYERS = [
    { id: 'delineation',     label: 'Delineation',     group: 'AI Analysis' },
    { id: 'classification',  label: 'Classification',  group: 'AI Analysis' },
    { id: 'ndvi',            label: 'NDVI',            group: 'Crop Health' },
    { id: 'fertilizer',      label: 'Fertilizer Zone', group: 'Crop Health' },
    { id: 'flood',           label: 'Flood Risk',      group: 'Disaster Risk' },
    { id: 'drought',         label: 'Drought Risk',    group: 'Disaster Risk' },
    { id: 'yield',           label: 'Yield Prediction',group: 'Yield' },
];

// ── Helpers ───────────────────────────────────────────────────────────────

function _statusBadge(status = 'idle') {
    const map = {
        ok:       { cls: 'badge-success', text: 'OK' },
        running:  { cls: 'badge-info',    text: 'Running…' },
        error:    { cls: 'badge-danger',  text: 'Error' },
        idle:     { cls: 'badge-muted',   text: 'Not run' },
    };
    const { cls, text } = map[status] ?? map.idle;
    return `<span class="badge ${cls}">${text}</span>`;
}

function _renderLayerRows() {
    const container = document.getElementById('monitoring-layer-table');
    if (!container) return;

    container.innerHTML = MONITORING_LAYERS.map(({ id, label, group }) => `
        <div class="monitoring-row" data-layer="${id}">
            <div class="ml-header">
                <span class="ml-group-badge">${group}</span>
                <span class="ml-name">${label}</span>
                <span class="ml-status" id="ms-status-${id}">${_statusBadge()}</span>
            </div>
            <div class="ml-controls">
                <select class="ml-interval-select form-control" data-layer="${id}" style="flex:1">
                    <option value="1d">Daily</option>
                    <option value="3d">Every 3 days</option>
                    <option value="7d" selected>Weekly</option>
                    <option value="14d">Bi-weekly</option>
                    <option value="30d">Monthly</option>
                    <option value="manual">Manual</option>
                </select>
                <input class="ml-threshold-input form-control" type="number" min="0" max="100"
                       placeholder="Alert %" data-layer="${id}" style="width:80px;flex-shrink:0" />
            </div>
        </div>
    `).join('');
}

async function _populateAoiSelect() {
    const sel = document.getElementById('monitoring-aoi-select');
    if (!sel) return;

    sel.innerHTML = '<option value="">Loading AOIs…</option>';
    sel.disabled  = true;

    try {
        if (!authManager.isAuthenticated()) throw new Error('Not authenticated');
        const aois = await getAOIs();

        if (!aois || aois.length === 0) {
            sel.innerHTML = '<option value="">No AOIs found</option>';
            return;
        }

        sel.innerHTML = '<option value="">— Select AOI —</option>' +
            aois.map((a) => `<option value="${a.id}">${a.name ?? a.id}</option>`).join('');
        sel.disabled = false;
    } catch (err) {
        console.error('[Monitoring] Failed to load AOIs:', err);
        sel.innerHTML = '<option value="">Failed to load AOIs</option>';
        sel.disabled  = false;
    }
}

function _bindAoiSelect() {
    const sel          = document.getElementById('monitoring-aoi-select');
    const configSec    = document.getElementById('monitoring-config-section');
    const statusSec    = document.getElementById('monitoring-status-section');

    if (!sel) return;

    sel.addEventListener('change', () => {
        const hasAoi = Boolean(sel.value);
        if (configSec)  configSec.style.display = hasAoi ? '' : 'none';
        if (statusSec)  statusSec.style.display  = hasAoi ? '' : 'none';
        // Propagate to global AoI store.
        const id  = Number(sel.value) || null;
        setSelectedAoi(id ? { id } : null);
    });
}

function _bindButtons() {
    const saveBtn   = document.getElementById('monitoring-save-btn');
    const runBtn    = document.getElementById('monitoring-run-btn');
    const aoiSel    = document.getElementById('monitoring-aoi-select');

    saveBtn?.addEventListener('click', () => {
        const aoiId    = aoiSel?.value;
        if (!aoiId) return;

        const config = {};
        document.querySelectorAll('.ml-interval-select').forEach((s) => {
            config[s.dataset.layer] = { interval: s.value };
        });
        document.querySelectorAll('.ml-threshold-input').forEach((inp) => {
            if (config[inp.dataset.layer]) {
                config[inp.dataset.layer].threshold = inp.value || null;
            }
        });

        // TODO: POST config to backend /api/monitoring/schedule
        console.info('[Monitoring] Schedule saved:', { aoiId, config });
        saveBtn.textContent = 'Saved ✓';
        setTimeout(() => (saveBtn.textContent = 'Save Schedule'), 2000);
    });

    runBtn?.addEventListener('click', async () => {
        const aoiId = aoiSel?.value;
        if (!aoiId) return;

        runBtn.disabled    = true;
        runBtn.textContent = 'Running…';

        try {
            // Get the most recently archived scene for this AOI
            const { scene_id } = await getLatestScene(Number(aoiId));

            // Run Sentinel-2 NDVI + yield analysis
            const result = await runAnalysis(scene_id);

            runBtn.textContent = '✓ Done';
            console.info('[Monitoring] Analysis complete:', result);

            // Brief success feedback then reset
            setTimeout(() => {
                runBtn.disabled    = false;
                runBtn.textContent = '▶ Run Analysis Now';
            }, 3000);
        } catch (err) {
            console.error('[Monitoring] Analysis failed:', err);
            runBtn.disabled    = false;
            runBtn.textContent = '▶ Run Analysis Now';
            alert(`Analysis failed: ${err.message}`);
        }
    });
}

// ── Public API ────────────────────────────────────────────────────────────

/**
 * Initialise the Monitoring Setting tab.
 * Call once after the DOM is ready (doesn't need the map instance).
 *
 * @param {maplibregl.Map} _map  Unused — kept for API consistency.
 */
export function initMonitoringSettingTab(_map) {
    _renderLayerRows();
    _bindAoiSelect();
    _bindButtons();

    // Populate AOIs if already authenticated, or wait for auth-changed
    if (authManager.isAuthenticated()) {
        _populateAoiSelect();
    }

    window.addEventListener('auth-changed', (e) => {
        if (e.detail?.authenticated) _populateAoiSelect();
    });
}
