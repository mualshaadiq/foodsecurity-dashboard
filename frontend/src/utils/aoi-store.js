/**
 * aoi-store.js — global selected-AoI state shared across all tabs.
 *
 * Any tab that lets the user pick an AoI should call setSelectedAoi() on
 * change.  Any tab that needs to react to the selection should listen to the
 * 'aoi-changed' CustomEvent dispatched on window.
 *
 * Native <select class="aoi-sync-select"> elements are managed here:
 *   • initAoiSync(aois) populates their options and wires their change events.
 *   • setSelectedAoi() keeps their displayed value in sync automatically.
 */

let _aoi  = null;   // null | { id, name, ... }
let _aois = [];     // cached full list, used to repopulate selects

// Track which native selects are already wired so we don't double-bind.
const _wired = new WeakSet();

// ── Public getters/setters ────────────────────────────────────────────────

/** Return the currently selected AoI object, or null if none is selected. */
export function getSelectedAoi() {
    return _aoi;
}

/**
 * Update the global selected AoI and notify all listeners.
 * Pass null / undefined to clear the selection.
 *
 * @param {object|null} aoi   Object with at least an `id` property, or null.
 */
export function setSelectedAoi(aoi) {
    const newId = aoi?.id ?? null;
    const oldId = _aoi?.id ?? null;
    if (newId === oldId) return;   // no change — avoid infinite loops

    _aoi = aoi ?? null;

    // Keep all aoi-sync-select elements in sync (no spurious change event).
    document.querySelectorAll('.aoi-sync-select').forEach((el) => {
        el.value = _aoi ? String(_aoi.id) : '';
    });

    window.dispatchEvent(new CustomEvent('aoi-changed', { detail: { aoi: _aoi } }));
}

// ── Native-select sync ───────────────────────────────────────────────────

/**
 * Populate all <select class="aoi-sync-select"> elements with the given AoI
 * list and wire their change events to setSelectedAoi().
 * Safe to call multiple times (re-populates options, avoids double-binding).
 *
 * @param {Array} aois   Array of GeoJSON Feature objects from getAOIs().
 */
export function initAoiSync(aois) {
    _aois = aois || [];

    const opts =
        '<option value="">— select AoI —</option>' +
        _aois
            .map((a) => {
                const name = a.properties?.name ?? a.name ?? `AoI ${a.id}`;
                return `<option value="${a.id}">${name}</option>`;
            })
            .join('');

    document.querySelectorAll('.aoi-sync-select').forEach((el) => {
        el.innerHTML = opts;
        el.disabled  = false;

        // Restore current selection if it's still in the list.
        if (_aoi) el.value = String(_aoi.id);

        if (!_wired.has(el)) {
            el.addEventListener('change', _onNativeChange);
            _wired.add(el);
        }
    });
}

// ── Private ───────────────────────────────────────────────────────────────

function _onNativeChange(e) {
    const id  = Number(e.target.value) || null;
    const aoi = id ? (_aois.find((a) => a.id === id) ?? { id }) : null;
    setSelectedAoi(aoi);
}
