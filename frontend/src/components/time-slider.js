/**
 * time-slider.js — global temporal date slider pinned to the map bottom.
 *
 * - Shown only when a temporal tab is active (ai, crop-health, disaster-risk, yield-prediction)
 * - On change: re-parameterizes the 'gis-tiles' source URL with ?date=YYYY-MM-DD
 * - Dispatches 'temporal-date-changed' CustomEvent for tab-specific listeners
 * - Dates: mock Sentinel-2 ~8-day revisit cycle; replace with API call when backend ready
 */

const TEMPORAL_TABS = new Set(['ai', 'crop-health', 'disaster-risk', 'yield-prediction']);

/** Generate mock dates — last 30 analysis snapshots (~8-day cadence). */
function _generateMockDates() {
    const dates = [];
    const today = new Date();
    for (let i = 29; i >= 0; i--) {
        const d = new Date(today);
        d.setDate(d.getDate() - i * 8);
        dates.push(d.toISOString().slice(0, 10));
    }
    return dates;
}

let _map     = null;
let _dates   = [];
let _idx     = 0;
let _timer   = null;

// ── Public ─────────────────────────────────────────────────────────────

/**
 * Initialise the time slider.  Call once after map is ready.
 * @param {maplibregl.Map} map
 */
export function initTimeSlider(map) {
    _map   = map;
    _dates = _generateMockDates();
    _idx   = _dates.length - 1; // newest date selected by default

    const bar    = document.getElementById('time-slider-bar');
    const slider = document.getElementById('time-range');
    const label  = document.getElementById('time-date-label');
    const prevBtn = document.getElementById('time-prev');
    const nextBtn = document.getElementById('time-next');
    const playBtn = document.getElementById('time-play');

    if (!bar || !slider) return;

    slider.min   = 0;
    slider.max   = _dates.length - 1;
    slider.value = _idx;
    label.textContent = _dates[_idx];

    slider.addEventListener('input', () => {
        _idx = parseInt(slider.value, 10);
        _applyDate();
    });

    prevBtn.addEventListener('click', () => {
        if (_idx > 0) { _idx--; slider.value = _idx; _applyDate(); }
    });

    nextBtn.addEventListener('click', () => {
        if (_idx < _dates.length - 1) { _idx++; slider.value = _idx; _applyDate(); }
    });

    playBtn.addEventListener('click', () => {
        if (_timer) {
            _stopPlay(playBtn);
        } else {
            playBtn.textContent = '⏸';
            playBtn.title = 'Pause';
            _timer = setInterval(() => {
                if (_idx >= _dates.length - 1) { _stopPlay(playBtn); return; }
                _idx++;
                slider.value = _idx;
                _applyDate();
            }, 1200);
        }
    });

    // React to tab changes
    window.addEventListener('temporal-tab-changed', (e) => {
        if (e.detail.isTemporal) {
            bar.classList.add('visible');
        } else {
            bar.classList.remove('visible');
            _stopPlay(playBtn);
        }
    });
}

/**
 * Returns the currently selected date string (YYYY-MM-DD).
 * @returns {string|null}
 */
export function getCurrentTemporalDate() {
    return _dates[_idx] ?? null;
}

// ── Private ────────────────────────────────────────────────────────────

function _applyDate() {
    const date  = _dates[_idx];
    const label = document.getElementById('time-date-label');
    const slider = document.getElementById('time-range');

    if (label) label.textContent = date;
    if (slider) slider.value = _idx;

    // Re-parameterize tile source
    if (_map) {
        const src = _map.getSource('gis-tiles');
        if (src) src.setTiles([`/tiles/gis_map/{z}/{x}/{y}?date=${date}`]);
    }

    // Notify any tab-specific listeners
    window.dispatchEvent(new CustomEvent('temporal-date-changed', { detail: { date } }));
}

function _stopPlay(playBtn) {
    if (_timer) { clearInterval(_timer); _timer = null; }
    if (playBtn) { playBtn.textContent = '▶'; playBtn.title = 'Play'; }
}
