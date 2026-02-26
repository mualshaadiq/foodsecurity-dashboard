/**
 * aoi-modal.js — AoI creation flow.
 *
 * States:
 *  1. "configure" — user fills name, interval, layers
 *  2. "drawing"   — modal closed, MapboxDraw polygon mode active
 *  3. "confirm"   — modal re-opens after draw.create, Save enabled
 *
 * Exposed:
 *  initAoiModal(map, onSave)  — call once after map ready
 *  openAoiModal()             — open from draw-aoi-btn click
 */
import { createAOI } from '@/api/food-security.js';
import { activateDraw, deactivateDraw, getDrawnFeature } from '@/map/draw-control.js';

let _drawnGeometry = null;

// ── Public ────────────────────────────────────────────────────────────────

/**
 * @param {maplibregl.Map} map
 * @param {() => void} onSave  — called after a successful save; refresh the AoI list
 */
export function initAoiModal(map, onSave) {
    const modal    = document.getElementById('aoi-modal');
    const closeBtn = modal.querySelector('.aoi-modal-close');
    const drawBtn  = document.getElementById('aoi-draw-btn');
    const saveBtn  = document.getElementById('aoi-save-btn');
    const cancelBtn = document.getElementById('aoi-cancel-btn');
    const hint     = document.getElementById('draw-hint');
    const nameInput = document.getElementById('aoi-name');

    // Validate on name change
    nameInput.addEventListener('input', _updateSaveBtn);

    // Close / Cancel
    closeBtn.addEventListener('click', () => _closeModal(true));
    cancelBtn.addEventListener('click', () => _closeModal(true));
    modal.addEventListener('click', (e) => { if (e.target === modal) _closeModal(true); });

    // ESC cancels active drawing
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && hint.classList.contains('visible')) {
            hint.classList.remove('visible');
            deactivateDraw();
            _drawnGeometry = null;
        }
    });

    // "Draw Area" — close the modal, activate polygon draw
    drawBtn.addEventListener('click', () => {
        _stashForm();
        _hideModal();
        activateDraw();
        hint.classList.add('visible');
    });

    // MapLibre / MapboxDraw fires draw.create on polygon completion
    map.on('draw.create', () => {
        hint.classList.remove('visible');
        _drawnGeometry = getDrawnFeature()?.geometry ?? null;
        deactivateDraw();
        _restoreForm();
        _openModal();
        _updateDrawStatus();
    });

    // Save
    saveBtn.addEventListener('click', () => _handleSave(onSave));

    _updateSaveBtn();
}

export function openAoiModal() {
    _drawnGeometry = null;
    _updateDrawStatus();
    _openModal();
}

// ── Private ───────────────────────────────────────────────────────────────

const _stash = {};

function _stashForm() {
    _stash.name     = document.getElementById('aoi-name').value;
    _stash.desc     = document.getElementById('aoi-desc').value;
    _stash.interval = document.getElementById('aoi-interval').value;
    _stash.unit     = document.getElementById('aoi-interval-unit').value;
    _stash.layers   = Array.from(
        document.querySelectorAll('#aoi-layers-group input[type="checkbox"]:checked')
    ).map((cb) => cb.value);
}

function _restoreForm() {
    if ('name' in _stash) document.getElementById('aoi-name').value = _stash.name;
    if ('desc' in _stash) document.getElementById('aoi-desc').value = _stash.desc;
    if ('interval' in _stash) document.getElementById('aoi-interval').value = _stash.interval;
    if ('unit' in _stash) document.getElementById('aoi-interval-unit').value = _stash.unit;
    if ('layers' in _stash) {
        document.querySelectorAll('#aoi-layers-group input[type="checkbox"]').forEach((cb) => {
            cb.checked = _stash.layers.includes(cb.value);
        });
    }
}

function _openModal() {
    const modal = document.getElementById('aoi-modal');
    modal.style.display = 'flex';
    requestAnimationFrame(() => modal.classList.add('active'));
    _updateSaveBtn();
}

function _hideModal() {
    const modal = document.getElementById('aoi-modal');
    modal.classList.remove('active');
    modal.style.display = 'none';
}

function _closeModal(reset = true) {
    _hideModal();
    if (reset) {
        _drawnGeometry = null;
        deactivateDraw();
        document.getElementById('aoi-name').value    = '';
        document.getElementById('aoi-desc').value    = '';
        document.getElementById('aoi-interval').value = '7';
        document.getElementById('aoi-interval-unit').value = 'days';
        document.querySelectorAll('#aoi-layers-group input').forEach((cb) => { cb.checked = false; });
        _updateDrawStatus();
        document.getElementById('aoi-error').classList.remove('active');
    }
}

function _updateDrawStatus() {
    const el = document.getElementById('aoi-draw-status');
    if (!el) return;
    if (_drawnGeometry) {
        el.innerHTML = '<span class="draw-status-ok">✓ Boundary drawn</span>';
    } else {
        el.innerHTML = '<span class="draw-status-empty">No boundary — click &quot;Draw Area&quot;</span>';
    }
    _updateSaveBtn();
}

function _updateSaveBtn() {
    const btn  = document.getElementById('aoi-save-btn');
    const name = document.getElementById('aoi-name')?.value.trim();
    if (btn) btn.disabled = !_drawnGeometry || !name;
}

async function _handleSave(onSave) {
    const name        = document.getElementById('aoi-name').value.trim();
    const description = document.getElementById('aoi-desc').value.trim();
    const interval    = parseInt(document.getElementById('aoi-interval').value) || 7;
    const intervalUnit = document.getElementById('aoi-interval-unit').value;
    const layers = Array.from(
        document.querySelectorAll('#aoi-layers-group input[type="checkbox"]:checked')
    ).map((cb) => cb.value);

    if (!name || !_drawnGeometry) return;

    const errorEl = document.getElementById('aoi-error');
    const saveBtn = document.getElementById('aoi-save-btn');
    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving…';

    // Compute nextRunAt
    const now = new Date();
    const unitMs = { days: 86400000, weeks: 604800000, months: 2592000000 };
    const nextRunAt = new Date(now.getTime() + interval * (unitMs[intervalUnit] ?? 86400000)).toISOString();

    try {
        await createAOI({
            type: 'Feature',
            geometry: _drawnGeometry,
            properties: {
                name,
                description,
                category: 'aoi',
                monitoringInterval: interval,
                intervalUnit,
                layers,
                nextRunAt,
            },
        });
        _closeModal(true);
        if (onSave) onSave();
    } catch (err) {
        errorEl.textContent = err.message || 'Failed to save AoI';
        errorEl.classList.add('active');
        saveBtn.disabled = false;
        saveBtn.textContent = 'Save AoI';
    }
}
