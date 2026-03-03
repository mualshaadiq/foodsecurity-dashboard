/**
 * layer-panel.js — Floating bottom-right Layer Panel
 *
 * Wires each .lp-check checkbox to MapLibre layer visibility via the
 * `data-layers` attribute (comma-separated layer IDs).  State is persisted
 * in localStorage so toggles survive page reloads.
 *
 * Usage:
 *   initLayerPanel(map)   — call once after map 'load' fires.
 */

const LS_PREFIX    = 'lp-';
const LS_COLLAPSED = 'lp-collapsed';

/**
 * Apply MapLibre visibility for every layer ID listed in `cb.dataset.layers`.
 * Silently skips layers that haven't been added to the map yet.
 *
 * @param {maplibregl.Map} map
 * @param {HTMLInputElement} cb
 */
function _applyLayers(map, cb) {
    const visibility = cb.checked ? 'visible' : 'none';
    const layerIds   = (cb.dataset.layers || '').split(',').map((s) => s.trim()).filter(Boolean);

    layerIds.forEach((id) => {
        try {
            if (map.getLayer(id)) {
                map.setLayoutProperty(id, 'visibility', visibility);
            }
        } catch (_) {
            // layer added asynchronously — ignore until re-triggered
        }
    });
}

/**
 * Initialise the Layer Panel.
 *
 * @param {maplibregl.Map} map  Fully-loaded MapLibre map instance.
 */
export function initLayerPanel(map) {
    const panel  = document.getElementById('layer-panel');
    const toggle = document.getElementById('layer-panel-toggle');
    const body   = document.getElementById('layer-panel-body');

    if (!panel || !toggle || !body) {
        console.warn('[LayerPanel] DOM elements not found — skipping init.');
        return;
    }

    // ── Restore collapse state ────────────────────────────────────────────
    if (localStorage.getItem(LS_COLLAPSED) === 'true') {
        panel.classList.add('lp-collapsed');
    }

    toggle.addEventListener('click', () => {
        panel.classList.toggle('lp-collapsed');
        localStorage.setItem(LS_COLLAPSED, panel.classList.contains('lp-collapsed'));
    });

    // ── Wire each checkbox ────────────────────────────────────────────────
    document.querySelectorAll('.lp-check').forEach((cb) => {
        // Restore saved state (default: OFF / unchecked)
        const saved = localStorage.getItem(LS_PREFIX + cb.id);
        cb.checked = saved === 'true';

        // Apply initial visibility once map layers exist
        _applyLayers(map, cb);

        cb.addEventListener('change', () => {
            _applyLayers(map, cb);
            localStorage.setItem(LS_PREFIX + cb.id, cb.checked);
        });
    });

    // ── Re-apply after any style reload (basemap switch, etc.) ───────────
    map.on('style.load', () => {
        document.querySelectorAll('.lp-check').forEach((cb) => _applyLayers(map, cb));
    });
}
