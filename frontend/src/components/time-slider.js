/**
 * time-slider.js — global temporal date slider pinned to the map bottom.
 *
 * Modes:
 *   'temporal' — mock 8-day revisit dates; used by ai/crop-health/etc tabs
 *   'imagery'  — real archived scene dates fed by imagery.js;
 *                shows ● archived markers and ▶ next-run projection
 *
 * Public API:
 *   initTimeSlider(map)
 *   getCurrentTemporalDate() → string
 *   updateSliderWithArchiveDates(scenes)  ← called by imagery.js
 *   resetSliderToTemporal()               ← called when leaving imagery tab
 */

const TEMPORAL_TABS = new Set(['ai', 'crop-health', 'disaster-risk', 'yield-prediction']);
const SENTINEL_REVISIT_DAYS = 5; // approximate S-2 revisit

// ── State ─────────────────────────────────────────────────────────────────
let _map         = null;
let _dates       = [];        // all date strings YYYY-MM-DD on the slider
let _idx         = 0;
let _timer       = null;
let _mode        = 'temporal';           // 'temporal' | 'imagery'
let _archiveDates = new Set();           // acquisition dates that exist in archive
let _nextRunDate  = null;                // projected next acquisition

// ── Helpers ───────────────────────────────────────────────────────────────

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

function _addDays(dateStr, n) {
    const d = new Date(dateStr + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
}

function _today() {
    return new Date().toISOString().slice(0, 10);
}

// ── DOM refs (set on init) ────────────────────────────────────────────────
let _bar, _slider, _label, _prevBtn, _nextBtn, _playBtn, _ticksEl;

// ── Public ────────────────────────────────────────────────────────────────

export function initTimeSlider(map) {
    _map   = map;
    _dates = _generateMockDates();
    _idx   = _dates.length - 1;

    _bar     = document.getElementById('time-slider-bar');
    _slider  = document.getElementById('time-range');
    _label   = document.getElementById('time-date-label');
    _prevBtn = document.getElementById('time-prev');
    _nextBtn = document.getElementById('time-next');
    _playBtn = document.getElementById('time-play');
    _ticksEl = document.getElementById('ts-ticks');

    if (!_bar || !_slider) return;

    _rebuildSlider();

    _slider.addEventListener('input', () => {
        _idx = parseInt(_slider.value, 10);
        _applyDate();
    });

    _prevBtn.addEventListener('click', () => {
        if (_idx > 0) { _idx--; _applyDate(); }
    });

    _nextBtn.addEventListener('click', () => {
        if (_idx < _dates.length - 1) { _idx++; _applyDate(); }
    });

    _playBtn.addEventListener('click', () => {
        if (_timer) {
            _stopPlay();
        } else {
            _playBtn.textContent = '⏸';
            _playBtn.title = 'Pause';
            _timer = setInterval(() => {
                if (_idx >= _dates.length - 1) { _stopPlay(); return; }
                _idx++;
                _applyDate();
            }, 1200);
        }
    });

    window.addEventListener('temporal-tab-changed', (e) => {
        const { tabId } = e.detail;
        // Slider is always visible (global).
        // Switch to imagery mode on the imagery tab; temporal mode everywhere else.
        if (tabId === 'imagery') {
            if (_mode !== 'imagery') {
                _mode = 'imagery';
                _bar.dataset.mode = 'imagery';
                _rebuildSlider();
                _stopPlay();
            }
        } else {
            if (_mode !== 'temporal') {
                _mode = 'temporal';
                _dates = _generateMockDates();
                _idx   = _dates.length - 1;
                _rebuildSlider();
                _stopPlay();
            }
            _bar.dataset.mode = 'temporal';
        }
        _bar.classList.add('visible');
    });
}

export function getCurrentTemporalDate() {
    return _dates[_idx] ?? null;
}

/**
 * Feed real archived scene dates into the imagery-mode slider.
 * Called by imagery.js whenever the archive list changes.
 *
 * @param {object[]} scenes  - array of archived-scene GeoJSON Features
 */
export function updateSliderWithArchiveDates(scenes) {
    // Extract unique acquisition dates, sorted ascending
    const raw = scenes
        .map((s) => s.properties?.acq_date)
        .filter(Boolean);
    const sorted = [...new Set(raw)].sort();

    _archiveDates = new Set(sorted);

    // Project next run: last date + SENTINEL_REVISIT_DAYS
    const last = sorted[sorted.length - 1];
    if (last) {
        _nextRunDate = _addDays(last, SENTINEL_REVISIT_DAYS);
        // If projected date is in the past, set to today + 1
        if (_nextRunDate < _today()) {
            _nextRunDate = _addDays(_today(), 1);
        }
    } else {
        _nextRunDate = _addDays(_today(), SENTINEL_REVISIT_DAYS);
    }

    // Slider dates = archived dates + next-run projection
    _dates = sorted.length ? [...sorted, _nextRunDate] : [_today(), _nextRunDate];
    _idx   = Math.max(0, _dates.length - 2); // select latest archived, not next-run

    if (_mode === 'imagery') {
        _rebuildSlider();
        // Fire the date-changed event so imagery.js immediately renders the
        // selected scene without the user having to nudge the slider.
        _applyDate();
    }
}

// ── Private ───────────────────────────────────────────────────────────────

function _rebuildSlider() {
    if (!_slider) return;

    if (_mode === 'imagery' && _dates.length === 0) {
        _slider.min = 0; _slider.max = 0; _slider.value = 0;
        if (_label) _label.textContent = 'No archive data';
        _renderTicks();
        return;
    }

    _slider.min   = 0;
    _slider.max   = _dates.length - 1;
    _slider.value = _idx;
    _applyDate(false);  // false = don't fire map update on rebuild
    _renderTicks();
}

function _renderTicks() {
    if (!_ticksEl || !_dates.length) {
        if (_ticksEl) _ticksEl.innerHTML = '';
        return;
    }

    const total = _dates.length - 1 || 1;
    const html  = _dates.map((d, i) => {
        const pct     = (i / total) * 100;
        const isNext  = (_mode === 'imagery' && d === _nextRunDate);
        const isArch  = (_mode === 'imagery' && _archiveDates.has(d));
        const cls     = isNext  ? 'ts-tick ts-tick--next'
                      : isArch  ? 'ts-tick ts-tick--archived'
                      :           'ts-tick ts-tick--default';
        const tip     = isNext  ? `Next run (projected): ${d}`
                      : isArch  ? `Archived: ${d}`
                      :           d;
        return `<span class="${cls}" style="left:${pct}%" title="${tip}" data-idx="${i}"></span>`;
    }).join('');

    _ticksEl.innerHTML = html;

    // Click a tick to jump to that date
    _ticksEl.querySelectorAll('.ts-tick').forEach((tick) => {
        tick.addEventListener('click', () => {
            _idx = parseInt(tick.dataset.idx, 10);
            _slider.value = _idx;
            _applyDate();
        });
    });
}

function _applyDate(fireEvents = true) {
    const date = _dates[_idx];
    if (!date) return;

    if (_slider) _slider.value = _idx;
    if (_label) {
        const isNext = (_mode === 'imagery' && date === _nextRunDate);
        _label.textContent  = isNext ? `▶ ${date}` : date;
        _label.title        = isNext ? 'Projected next acquisition' : date;
        _label.classList.toggle('ts-label--next', isNext);
    }

    // Highlight active tick
    _ticksEl?.querySelectorAll('.ts-tick').forEach((t, i) => {
        t.classList.toggle('ts-tick--active', i === _idx);
    });

    if (!fireEvents) return;

    if (_mode !== 'imagery' && _map) {
        const src = _map.getSource('gis-tiles');
        if (src) src.setTiles([`/tiles/gis_map/{z}/{x}/{y}?date=${date}`]);
    }

    window.dispatchEvent(new CustomEvent('temporal-date-changed', { detail: { date, mode: _mode } }));
}

function _stopPlay() {
    if (_timer) { clearInterval(_timer); _timer = null; }
    if (_playBtn) { _playBtn.textContent = '▶'; _playBtn.title = 'Play'; }
}
