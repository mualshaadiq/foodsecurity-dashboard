/**
 * imagery.js
 *
 * Imagery tab:
 *  - Sentinel-2 cloudless mosaic (EOX WMTS) with year/opacity controls
 *  - Scene Search: query NASA CMR for the best (lowest cloud cover)
 *    Sentinel-2 acquisition over a selected AOI in a given timeframe
 *
 * @param {maplibregl.Map} map
 */
import {
    initSentinelLayer,
    setSentinelYear,
    setSentinelOpacity,
    setSentinelVisible,
} from '@/map/layers/imagery-layers.js';
import {
    initCmrFootprintLayer,
    showGranuleFootprint,
    clearGranuleFootprint,
} from '@/map/layers/cmr-footprint-layer.js';
import { searchSentinel2, granuleToGeoJson, getBrowseUrl, bboxFromFeature } from '@/api/cmr.js';
import { getAOIs } from '@/api/food-security.js';
import { archiveScene, listArchivedScenes, deleteArchivedScene } from '@/api/scene-archive.js';
import {
    initArchivedScenesLayer,
    showArchivedScenes,
    zoomToArchivedScene,
    clearArchivedScenes,
    _setMapRef,
} from '@/map/layers/archived-scenes-layer.js';

// ── State ──────────────────────────────────────────────────────────────────
let _map            = null;
let _aois           = [];
let _results        = [];     // last STAC search results
let _archivedScenes = [];     // scenes saved to archive

// ── Entry point ───────────────────────────────────────────────────────────
export async function initImageryTab(map) {
    _map = map;

    // Sentinel-2 cloudless mosaic
    initSentinelLayer(map);

    // CMR granule footprint layer
    initCmrFootprintLayer(map);

    // Archived scenes layer
    initArchivedScenesLayer(map);
    _setMapRef(map);

    // ── Cloudless mosaic controls ──────────────────────────────────────
    const toggleEl  = document.getElementById('toggle-sentinel');
    const yearEl    = document.getElementById('sentinel-year-select');
    const opacityEl = document.getElementById('sentinel-opacity');

    toggleEl?.addEventListener('change',  () => setSentinelVisible(toggleEl.checked));
    yearEl?.addEventListener('change',    () => setSentinelYear(yearEl.value));
    opacityEl?.addEventListener('input',  () => setSentinelOpacity(Number(opacityEl.value) / 100));

    // ── Scene search controls ──────────────────────────────────────────
    _initDefaultDates();
    await _populateAoiSelect();

    // Load archived scenes whenever AOI selection changes
    document.getElementById('imagery-aoi-select')?.addEventListener('change', (e) => {
        const id = Number(e.target.value) || null;
        _loadArchivedScenes(id);
    });

    const cloudSlider  = document.getElementById('imagery-cloud-cover');
    const cloudDisplay = document.getElementById('cloud-cover-display');
    cloudSlider?.addEventListener('input', () => {
        if (cloudDisplay) cloudDisplay.textContent = `${cloudSlider.value}%`;
    });

    document.getElementById('imagery-search-btn')?.addEventListener('click', _runSearch);
}

// ── Helpers ───────────────────────────────────────────────────────────────

function _initDefaultDates() {
    const today  = new Date();
    const past   = new Date(today - 30 * 86_400_000);  // 30 days ago
    const fmt    = (d) => d.toISOString().slice(0, 10);

    const startEl = document.getElementById('imagery-date-start');
    const endEl   = document.getElementById('imagery-date-end');
    if (startEl) startEl.value = fmt(past);
    if (endEl)   endEl.value   = fmt(today);
}

async function _populateAoiSelect() {
    const select = document.getElementById('imagery-aoi-select');
    if (!select) return;
    try {
        _aois = await getAOIs();
        select.innerHTML = '<option value="">— select AOI —</option>' +
            _aois.map((a) => `<option value="${a.id}">${a.properties?.name ?? `AOI ${a.id}`}</option>`).join('');
    } catch {
        select.innerHTML = '<option value="">Could not load AOIs</option>';
    }
}

async function _runSearch() {
    const select    = document.getElementById('imagery-aoi-select');
    const startEl   = document.getElementById('imagery-date-start');
    const endEl     = document.getElementById('imagery-date-end');
    const cloudEl   = document.getElementById('imagery-cloud-cover');
    const resultsEl = document.getElementById('imagery-results');
    const btn       = document.getElementById('imagery-search-btn');

    if (!resultsEl) return;

    const aoiId = select?.value;
    if (!aoiId) {
        resultsEl.innerHTML = '<p class="imagery-msg imagery-msg--warn">Please select an AOI first.</p>';
        return;
    }

    const aoi       = _aois.find((a) => String(a.id) === String(aoiId));
    const bbox      = bboxFromFeature(aoi);
    const startDate = startEl?.value;
    const endDate   = endEl?.value;
    const maxCloud  = Number(cloudEl?.value ?? 30);

    if (!startDate || !endDate) {
        resultsEl.innerHTML = '<p class="imagery-msg imagery-msg--warn">Please set a date range.</p>';
        return;
    }

    // Loading state
    btn.disabled = true;
    btn.textContent = 'Searching…';
    resultsEl.innerHTML = '<p class="imagery-msg">Querying STAC API…</p>';
    clearGranuleFootprint();
    console.debug('[STAC] search params', { bbox, startDate, endDate, maxCloud });

    try {
        _results = await searchSentinel2({ bbox, startDate, endDate, maxCloud, pageSize: 6 });
        console.debug('[STAC] results count', _results.length);

        if (!_results.length) {
            resultsEl.innerHTML = `<p class="imagery-msg">No scenes found with ≤${maxCloud}% cloud cover in this period. Try widening the date range or raising the cloud threshold.</p>`;
            return;
        }

        resultsEl.innerHTML = _results.map((g, i) => _renderCard(g, i)).join('');

        // Wire up card clicks (but not the archive button inside)
        resultsEl.querySelectorAll('.cmr-card').forEach((card) => {
            card.addEventListener('click', (e) => {
                if (e.target.closest('.cmr-archive-btn')) return;
                _selectGranule(Number(card.dataset.idx));
            });
        });

        // Wire up archive buttons
        resultsEl.querySelectorAll('.cmr-archive-btn').forEach((btn) => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                _archiveGranule(Number(btn.dataset.idx));
            });
        });

        // Auto-select the first (best) result
        _selectGranule(0);

    } catch (err) {
        resultsEl.innerHTML = `<p class="imagery-msg imagery-msg--error">CMR search failed: ${err.message}</p>`;
    } finally {
        btn.disabled = false;
        btn.textContent = 'Find Best Scene';
    }
}

function _renderCard(granule, index) {
    // Support both STAC items (properties.datetime / eo:cloud_cover) and legacy CMR fields
    const date    = (granule.properties?.datetime ?? granule.time_start ?? '').slice(0, 10) || '—';
    const rawCloud = granule.properties?.['eo:cloud_cover'] ?? granule.cloud_cover;
    const cloud   = rawCloud != null ? `${Number(rawCloud).toFixed(1)}%` : 'N/A';
    const thumb   = getBrowseUrl(granule);
    const platform = granule.properties?.platform ?? '';
    const name    = platform ? platform.replace('sentinel-', 'S').toUpperCase() : 'Sentinel-2';
    const best    = index === 0 ? '<span class="cmr-best-badge">★ Best</span>' : '';

    return `
        <div class="cmr-card" data-idx="${index}" title="Click to highlight on map">
            ${thumb ? `<img class="cmr-thumb" src="${thumb}" loading="lazy" alt="Browse">` : '<div class="cmr-thumb cmr-thumb--placeholder">🛰</div>'}
            <div class="cmr-card-body">
                ${best}
                <div class="cmr-card-date">${date}</div>
                <div class="cmr-card-meta">
                    <span class="cmr-cloud-badge">☁ ${cloud}</span>
                    <span class="cmr-short-name">${name}</span>
                </div>
            </div>
            <button class="cmr-archive-btn" data-idx="${index}" title="Archive this scene">＋</button>
        </div>`;
}

function _selectGranule(index) {
    const granule  = _results[index];
    if (!granule) return;

    // Highlight active card
    document.querySelectorAll('.cmr-card').forEach((c, i) => {
        c.classList.toggle('cmr-card--active', i === index);
    });

    // Show footprint on map
    const feature = granuleToGeoJson(granule);
    if (feature) {
        showGranuleFootprint(feature);
        // Zoom to footprint bbox
        const [w, s, e, n] = bboxFromFeature(feature);
        _map?.fitBounds([[w, s], [e, n]], { padding: 60, maxZoom: 10 });
    }
}

// ── Archive helpers ───────────────────────────────────────────────────────

async function _archiveGranule(index) {
    const granule = _results[index];
    if (!granule) return;

    const btn = document.querySelector(`.cmr-archive-btn[data-idx="${index}"]`);

    const select   = document.getElementById('imagery-aoi-select');
    const startEl  = document.getElementById('imagery-date-start');
    const endEl    = document.getElementById('imagery-date-end');
    const aoiId    = Number(select?.value);
    const aoi      = _aois.find((a) => a.id === aoiId);
    const aoiName  = aoi?.properties?.name ?? `AOI ${aoiId}`;

    if (!aoiId) {
        alert('Please select an AOI before archiving.');
        return;
    }

    try {
        if (btn) { btn.disabled = true; btn.textContent = '…'; }
        await archiveScene({
            stacItem:  granule,
            aoiId,
            aoiName,
            dateStart: startEl?.value,
            dateEnd:   endEl?.value,
        });
        if (btn) { btn.textContent = '✓'; btn.classList.add('cmr-archive-btn--done'); }
        // refresh archived list
        await _loadArchivedScenes(aoiId);
    } catch (err) {
        console.error('[archive]', err);
        if (btn) { btn.disabled = false; btn.textContent = '＋'; }
        alert(`Archive failed: ${err.message}`);
    }
}

async function _loadArchivedScenes(aoiId) {
    const listEl = document.getElementById('archived-scenes-list');
    if (!listEl) return;

    try {
        _archivedScenes = await listArchivedScenes(aoiId ?? null);
        showArchivedScenes(_archivedScenes);

        if (!_archivedScenes.length) {
            listEl.innerHTML = '<p class="imagery-msg">No archived scenes for this AOI.</p>';
            return;
        }

        listEl.innerHTML = _archivedScenes.map((s) => _renderArchivedCard(s)).join('');

        // Wire delete buttons
        listEl.querySelectorAll('.archived-scene-del').forEach((btn) => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const id = Number(btn.dataset.id);
                btn.disabled = true;
                try {
                    await deleteArchivedScene(id);
                    await _loadArchivedScenes(aoiId ?? null);
                } catch (err) {
                    btn.disabled = false;
                    alert(`Delete failed: ${err.message}`);
                }
            });
        });

        // Wire zoom buttons
        listEl.querySelectorAll('.archived-scene-zoom').forEach((btn) => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                zoomToArchivedScene(_map, Number(btn.dataset.id), _archivedScenes);
            });
        });

    } catch (err) {
        listEl.innerHTML = `<p class="imagery-msg imagery-msg--error">Failed to load archive: ${err.message}</p>`;
    }
}

function _renderArchivedCard(scene) {
    const p       = scene.properties ?? {};
    const date    = p.acq_date || '—';
    const cloud   = p.cloud_cover != null ? `${Number(p.cloud_cover).toFixed(1)}%` : 'N/A';
    const plat    = (p.platform ?? 'S2').replace('sentinel-', 'S').toUpperCase();
    const range   = (p.date_start && p.date_end) ? `${p.date_start} → ${p.date_end}` : '';
    const thumb   = p.thumbnail || '';
    const id      = scene.id;

    return `
        <div class="archived-scene-card">
            ${thumb
                ? `<img class="cmr-thumb" src="${thumb}" loading="lazy" alt="">`
                : '<div class="cmr-thumb cmr-thumb--placeholder">🛰</div>'
            }
            <div class="cmr-card-body">
                <div class="cmr-card-date">${date}</div>
                <div class="cmr-card-meta">
                    <span class="cmr-cloud-badge">☁ ${cloud}</span>
                    <span class="cmr-short-name">${plat}</span>
                </div>
                ${range ? `<div class="archived-scene-range">${range}</div>` : ''}
            </div>
            <div class="archived-scene-actions">
                <button class="archived-scene-zoom" data-id="${id}" title="Zoom to scene">⊕</button>
                <button class="archived-scene-del"  data-id="${id}" title="Remove from archive">✕</button>
            </div>
        </div>`;
}

