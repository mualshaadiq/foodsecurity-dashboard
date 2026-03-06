import { getWeather } from '@/api/food-security.js';
import { runNdwiAnalysis } from '@/api/food-security.js';
import { listArchivedScenes } from '@/api/scene-archive.js';
import { renderWeatherCard } from '@/components/weather-card.js';
import { sfDisasterAoi } from '@/components/select-fields.js';
import { setSelectedAoi } from '@/utils/aoi-store.js';
import { initNdwiLayer, showNdwiLayer, hideNdwiLayer } from '@/map/layers/ndwi-layer.js';

let _lastScene      = null;
let _archivedScenes = [];

/**
 * Disaster Risk Management tab — Flood risk, drought, weather panel, NDWI analysis.
 * Wires up the #panel-disaster-risk sidebar panel.
 * @param {maplibregl.Map} map
 */
export function initDisasterRiskTab(map) {
    _bindVisibilityToggle(map, 'toggle-flood-risk', 'flood-risk');
    _bindVisibilityToggle(map, 'toggle-drought',    'drought-zones');

    initNdwiLayer(map);
    _bindNdwiToggle();
    _bindNdwiRunButton();

    // Sync with global data-mode slider
    window.addEventListener('temporal-date-changed', (e) => {
        if (e.detail.mode !== 'data') return;
        const toggleEl = document.getElementById('toggle-ndwi-raster');
        const { scene, analysis } = e.detail;

        if (toggleEl?.checked && analysis?.ndwi_tile_url) {
            showNdwiLayer(analysis.ndwi_tile_url, scene?.geometry ?? null);
        } else {
            hideNdwiLayer();
        }
    });

    // Keep scene selector in sync with slider
    window.addEventListener('temporal-date-changed', (e) => {
        if (e.detail.mode !== 'data') return;
        const sceneEl = document.getElementById('ndwi-scene-select');
        if (!sceneEl || !e.detail.scene) return;
        const sceneId = String(e.detail.scene.id ?? '');
        if (sceneEl.value !== sceneId) sceneEl.value = sceneId;
        _lastScene = e.detail.scene;
    });

    // Refresh scene list when archives update
    window.addEventListener('archived-scenes-updated', (e) => {
        _populateNdwiSceneSelect(e.detail?.aoi_id || null);
    });

    sfDisasterAoi.setOnChange((vals) => {
        const id = Number(vals[0]) || null;
        setSelectedAoi(id ? { id } : null);
        loadWeather(vals[0] || '');
    });
    if (sfDisasterAoi.getValue().length) loadWeather(sfDisasterAoi.getValue()[0]);
}

// ── NDWI scene selector ───────────────────────────────────────────────────

async function _populateNdwiSceneSelect(aoiId) {
    const sel = document.getElementById('ndwi-scene-select');
    if (!sel) return;
    try {
        const scenes = await listArchivedScenes(aoiId || null);
        if (!scenes.length) {
            sel.innerHTML = '<option value="">No archived scenes — use Imagery tab</option>';
            return;
        }
        sel.innerHTML = '<option value="">— select scene —</option>' +
            scenes.map((s) => {
                const p    = s.properties ?? {};
                const date = p.acq_date || `Scene ${s.id}`;
                const cc   = p.cloud_cover != null
                    ? ` ☁ ${Number(p.cloud_cover).toFixed(1)}%`
                    : '';
                return `<option value="${s.id}">${date}${cc}</option>`;
            }).join('');
        _archivedScenes = scenes;
    } catch (err) {
        sel.innerHTML = '<option value="">Failed to load scenes</option>';
        console.error('[disaster-risk] scene load failed:', err);
    }
}

// ── NDWI run button ───────────────────────────────────────────────────────

function _bindNdwiRunButton() {
    const runBtn   = document.getElementById('ndwi-run-btn');
    const sceneEl  = document.getElementById('ndwi-scene-select');
    const statusEl = document.getElementById('ndwi-run-status');

    if (!runBtn) return;

    sceneEl?.addEventListener('focus', () => {
        if (sceneEl.options.length <= 1) _populateNdwiSceneSelect(null);
    });

    sceneEl?.addEventListener('change', () => {
        const id = Number(sceneEl.value);
        _lastScene = _archivedScenes.find((s) => s.id === id) ?? null;
    });

    runBtn.addEventListener('click', async () => {
        const sceneId = Number(sceneEl?.value);
        if (!sceneId) {
            alert('Select an archived scene first. Archive one in the Imagery tab.');
            return;
        }

        runBtn.disabled    = true;
        runBtn.textContent = 'Computing…';
        if (statusEl) {
            statusEl.style.display = '';
            statusEl.textContent   = '⏳ Downloading bands and computing NDWI raster…';
        }

        try {
            const result = await runNdwiAnalysis(sceneId);
            const ndwi   = Number(result.ndwi_mean).toFixed(3);

            if (result.ndwi_tile_url) {
                showNdwiLayer(result.ndwi_tile_url, _lastScene?.geometry ?? null);
                const toggleEl = document.getElementById('toggle-ndwi-raster');
                if (toggleEl) toggleEl.checked = true;
            }

            window.dispatchEvent(new CustomEvent('analysis-complete', {
                detail: { aoi_id: result.aoi_id, scene_id: result.scene_id, acq_date: result.acq_date },
            }));

            if (statusEl) {
                const procAt = result.ndwi_processed_at
                    ? new Date(result.ndwi_processed_at).toLocaleString()
                    : '';
                statusEl.innerHTML =
                    `✓ NDWI <strong>${ndwi}</strong> (${result.ndwi_class})`
                    + (procAt ? `<br><small>Processed at ${procAt} · Acq. ${result.acq_date || ''}</small>` : '');
            }
        } catch (err) {
            if (statusEl) statusEl.textContent = `✗ ${err.message}`;
            console.error('[disaster-risk] NDWI run failed:', err);
        } finally {
            runBtn.disabled    = false;
            runBtn.textContent = '▶ Run NDWI Analysis';
        }
    });
}

// ── NDWI raster visibility toggle ────────────────────────────────────────

function _bindNdwiToggle() {
    const el = document.getElementById('toggle-ndwi-raster');
    if (!el) return;
    el.addEventListener('change', () => {
        if (!el.checked) hideNdwiLayer();
    });
}

// ── Weather ───────────────────────────────────────────────────────────────

async function loadWeather(aoiId) {
    const container = document.getElementById('weather-card-container');
    if (!container || !aoiId) return;

    try {
        const data = await getWeather(aoiId);
        renderWeatherCard(container, data);
    } catch (err) {
        container.innerHTML = `<p class="text-danger">Failed to load weather data.</p>`;
    }
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

