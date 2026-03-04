import { listArchivedScenes } from '@/api/scene-archive.js';
import { runAnalysis } from '@/api/food-security.js';

/**
 * Crop Health Monitoring tab — NDVI layer, fertilizer zone toggle,
 * and NDVI analysis runner.
 * @param {maplibregl.Map} map
 */
export function initCropHealthTab(map) {
    _bindVisibilityToggle(map, 'toggle-ndvi',       'ndvi-zones');
    _bindVisibilityToggle(map, 'toggle-fertilizer', 'fertilizer-zones');
    _bindNdviRunButton(map);

    // React to global time slider date changes
    window.addEventListener('temporal-date-changed', (e) => {
        console.debug('[crop-health] temporal date changed ->', e.detail.date);
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

    runBtn.addEventListener('click', async () => {
        const sceneId = Number(sceneEl?.value);
        if (!sceneId) {
            alert('Select an archived scene first. Archive one in the Imagery tab.');
            return;
        }

        runBtn.disabled    = true;
        runBtn.textContent = 'Running…';
        if (statusEl) {
            statusEl.style.display = '';
            statusEl.textContent   = '⏳ Fetching band statistics via TiTiler…';
        }

        try {
            const result = await runAnalysis(sceneId);
            const ndvi   = Number(result.ndvi_mean).toFixed(3);
            const area   = Number(result.estimated_area_ha).toFixed(1);
            const yld    = Number(result.predicted_yield_ton).toFixed(1);

            if (statusEl) {
                statusEl.textContent =
                    `✓ NDVI ${ndvi} (${result.ndvi_class}) · Area ${area} ha · Yield ≈ ${yld} t`;
            }

            // Force tile refresh so ndvi_zone polygons appear immediately
            if (map.getLayer('ndvi-zones')) {
                map.setLayoutProperty('ndvi-zones', 'visibility', 'none');
                requestAnimationFrame(() =>
                    map.setLayoutProperty('ndvi-zones', 'visibility', 'visible'));
            }
            if (map.getLayer('yield-zones')) {
                map.setLayoutProperty('yield-zones', 'visibility', 'none');
                requestAnimationFrame(() =>
                    map.setLayoutProperty('yield-zones', 'visibility', 'visible'));
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
