import { listArchivedScenes } from '@/api/scene-archive.js';
import { runAnalysis } from '@/api/food-security.js';
import { initNdviLayer, showNdviLayer, hideNdviLayer } from '@/map/layers/ndvi-layer.js';

// Holds the GeoJSON Feature of the currently selected archived scene
// so showNdviLayer can use its geometry for the bbox hint.
let _lastScene      = null;
let _archivedScenes = [];

/**
 * Crop Health Monitoring tab — NDVI layer, fertilizer zone toggle,
 * and NDVI analysis runner.
 * @param {maplibregl.Map} map
 */
export function initCropHealthTab(map) {
    initNdviLayer(map);
    _bindNdviToggle(map);
    _bindVisibilityToggle(map, 'toggle-fertilizer', 'fertilizer-zones');
    _bindNdviRunButton(map);

    window.addEventListener('temporal-date-changed', (e) => {
        if (e.detail.mode !== 'data') return;

        const toggle = document.getElementById('toggle-ndvi');
        const { scene, analysis } = e.detail;

        if (toggle?.checked && analysis?.ndvi_tile_url) {
            // Show the NDVI raster for this date's analysis result.
            // Use the scene geometry from the event payload for the bbox hint.
            showNdviLayer(analysis.ndvi_tile_url, scene?.geometry ?? null);
        } else if (analysis && !analysis.ndvi_tile_url) {
            // Analysis exists but no COG yet (still processing) — hide stale layer.
            hideNdviLayer();
        } else if (!analysis) {
            // No analysis on this date — hide the NDVI layer.
            hideNdviLayer();
        }
    });

    // Keep the scene selector in sync with the global AOI slider \u2014 when the
    // slider moves and the new date has a scene, pre-select it in the dropdown.
    window.addEventListener('temporal-date-changed', (e) => {
        if (e.detail.mode !== 'data') return;
        const sceneEl = document.getElementById('ndvi-scene-select');
        if (!sceneEl || !e.detail.scene) return;
        const sceneId = String(e.detail.scene.id ?? '');
        if (sceneEl.value !== sceneId) sceneEl.value = sceneId;
        _lastScene = e.detail.scene;
    });
}

// ── Scene selector ────────────────────────────────────────────────────────

async function _populateSceneSelect(aoiId) {
    const sel = document.getElementById('ndvi-scene-select');
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
        console.error('[crop-health] scene load failed:', err);
    }
}

// ── NDVI run button ───────────────────────────────────────────────────────

function _bindNdviRunButton(map) {
    const runBtn   = document.getElementById('ndvi-run-btn');
    const sceneEl  = document.getElementById('ndvi-scene-select');
    const statusEl = document.getElementById('ndvi-run-status');

    if (!runBtn) return;

    // Refresh scene list when archives change (imagery tab fires this)
    window.addEventListener('archived-scenes-updated', (e) => {
        _populateSceneSelect(e.detail?.aoi_id || null);
    });

    // Lazy-load scenes on first focus
    sceneEl?.addEventListener('focus', () => {
        if (sceneEl.options.length <= 1) _populateSceneSelect(null);
    });

    // Track selected scene feature for geometry bbox hint
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
            statusEl.textContent   = '⏳ Downloading bands and computing NDVI raster…';
        }

        try {
            const result = await runAnalysis(sceneId);
            const ndvi   = Number(result.ndvi_mean).toFixed(3);
            const area   = Number(result.estimated_area_ha).toFixed(1);
            const yld    = Number(result.predicted_yield_ton).toFixed(1);

            // Show the NDVI COG as a raster tile layer on the map
            if (result.ndvi_tile_url) {
                // Find the scene geometry for bbox hint
                const sceneFeature = _lastScene;
                showNdviLayer(result.ndvi_tile_url, sceneFeature?.geometry ?? null);
                // Sync the toggle checkbox
                const toggle = document.getElementById('toggle-ndvi');
                if (toggle) toggle.checked = true;
            }

            // Notify the global slider so it gains the new NDVI tick
            window.dispatchEvent(new CustomEvent('analysis-complete', {
                detail: { aoi_id: result.aoi_id, scene_id: result.scene_id, acq_date: result.acq_date },
            }));

            if (statusEl) {
                const procAt = result.ndvi_processed_at
                    ? new Date(result.ndvi_processed_at).toLocaleString()
                    : '';
                statusEl.innerHTML =
                    `✓ NDVI <strong>${ndvi}</strong> (${result.ndvi_class})`
                    + ` &middot; ${area}&nbsp;ha &middot; Yield ≈ ${yld}&nbsp;t`
                    + (procAt ? `<br><small>Processed at ${procAt} &middot; Acq. ${result.acq_date || ''}</small>` : '');
            }
        } catch (err) {
            if (statusEl) statusEl.textContent = `✗ ${err.message}`;
            console.error('[crop-health] NDVI run failed:', err);
        } finally {
            runBtn.disabled    = false;
            runBtn.textContent = '▶ Run NDVI Analysis';
        }
    });
}

// ── NDVI raster visibility toggle ───────────────────────────────────────

function _bindNdviToggle(_map) {
    const el = document.getElementById('toggle-ndvi');
    if (!el) return;
    el.addEventListener('change', () => {
        if (el.checked) {
            // Layer already visible from last runAnalysis — nothing to do
            // unless user wants to re-show; handled by showNdviLayer above.
        } else {
            hideNdviLayer();
        }
    });
}

// ── Layer visibility toggle ───────────────────────────────────────────────

function _bindVisibilityToggle(map, checkboxId, layerId) {
    const el = document.getElementById(checkboxId);
    if (!el) return;
    el.addEventListener('change', () => {
        if (map.getLayer(layerId)) {
            map.setLayoutProperty(layerId, 'visibility', el.checked ? 'visible' : 'none');
        }
    });
}
