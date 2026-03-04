/**
 * notifications.js — download task tracker + notification bell UI
 *
 * Tracks background COG download jobs that are kicked off when a user
 * archives a Sentinel-2 scene.  State is persisted in localStorage so
 * tasks survive page reloads.
 *
 * Public API:
 *   initNotifications()
 *   addDownloadTask({ sceneId, sceneName, aoiName, totalBands })
 *   getNotifications()  → Task[]
 */

const STORAGE_KEY = 'foodsec_notifications';
const POLL_MS     = 6_000;   // check pending tasks every 6 s
const MAX_TASKS   = 50;

// Expected downloadable bands count (B02–B12 + SCL + visual = 12)
const EXPECTED_BANDS = 12;

// ── State ─────────────────────────────────────────────────────────────────
let _tasks        = [];   // Task[]
let _pollTimer    = null;
let _bellEl       = null;
let _badgeEl      = null;
let _panelEl      = null;
let _listEl       = null;
let _unreadCount  = 0;

// ── Task shape ────────────────────────────────────────────────────────────
// {
//   id:            string  (scene id + timestamp)
//   sceneId:       number
//   sceneName:     string
//   aoiName:       string
//   totalBands:    number   (expected — usually 12)
//   downloaded:    number
//   status:        'pending' | 'downloading' | 'complete' | 'error'
//   createdAt:     string   ISO date
//   completedAt:   string | null
//   read:          boolean
// }

// ── Persistence ───────────────────────────────────────────────────────────

function _load() {
    try {
        _tasks = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]');
    } catch {
        _tasks = [];
    }
}

function _save() {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(_tasks.slice(0, MAX_TASKS)));
    } catch { /* quota exceeded — ignore */ }
}

// ── Public API ────────────────────────────────────────────────────────────

/**
 * Add a new download task and start / continue the poll loop.
 */
export function addDownloadTask({ sceneId, sceneName, aoiName, totalBands = EXPECTED_BANDS }) {
    _load();
    // Don't add duplicate for same sceneId
    if (_tasks.find((t) => t.sceneId === sceneId)) return;

    const task = {
        id:          `${sceneId}-${Date.now()}`,
        sceneId,
        sceneName,
        aoiName:     aoiName ?? '',
        totalBands,
        downloaded:  0,
        status:      'pending',
        createdAt:   new Date().toISOString(),
        completedAt: null,
        read:        false,
    };
    _tasks.unshift(task);
    _save();
    _unreadCount++;
    _renderBadge();
    _renderList();
    _startPoll();
}

export function getNotifications() {
    _load();
    return [..._tasks];
}

/** Mark all as read (clears badge). */
export function markAllRead() {
    _tasks.forEach((t) => { t.read = true; });
    _unreadCount = 0;
    _save();
    _renderBadge();
}

/** Remove all completed / errored tasks. */
export function clearCompleted() {
    _tasks = _tasks.filter((t) => t.status !== 'complete' && t.status !== 'error');
    _save();
    _renderList();
}

// ── Init ──────────────────────────────────────────────────────────────────

export function initNotifications() {
    _bellEl  = document.getElementById('notif-bell');
    _badgeEl = document.getElementById('notif-badge');
    _panelEl = document.getElementById('notif-panel');
    _listEl  = document.getElementById('notif-list');

    if (!_bellEl) return;

    _load();
    _unreadCount = _tasks.filter((t) => !t.read).length;
    _renderBadge();
    _renderList();

    // Toggle panel open / close
    _bellEl.addEventListener('click', (e) => {
        e.stopPropagation();
        const open = _panelEl.classList.toggle('visible');
        if (open) {
            markAllRead();
            _renderList();
        }
    });

    // Close panel when clicking outside
    document.addEventListener('click', (e) => {
        if (_panelEl.classList.contains('visible') &&
            !_panelEl.contains(e.target) &&
            e.target !== _bellEl) {
            _panelEl.classList.remove('visible');
        }
    });

    // Clear completed button
    document.getElementById('notif-clear-btn')?.addEventListener('click', () => {
        clearCompleted();
    });

    // Resume polling for any still-pending tasks from a previous session
    const hasPending = _tasks.some(
        (t) => t.status === 'pending' || t.status === 'downloading',
    );
    if (hasPending) _startPoll();
}

// ── Polling ───────────────────────────────────────────────────────────────

function _startPoll() {
    if (_pollTimer) return;
    _pollTimer = setInterval(_pollAll, POLL_MS);
    // Fire immediately so we don't wait 6s on page load
    _pollAll();
}

function _stopPoll() {
    if (_pollTimer) { clearInterval(_pollTimer); _pollTimer = null; }
}

async function _pollAll() {
    const active = _tasks.filter(
        (t) => t.status === 'pending' || t.status === 'downloading',
    );
    if (!active.length) { _stopPoll(); return; }

    await Promise.allSettled(active.map(_pollTask));
    _save();
    _renderList();

    // Notify other components that some scene statuses may have changed
    window.dispatchEvent(new CustomEvent('cog-status-changed'));
}

async function _pollTask(task) {
    try {
        const resp = await fetch(`/api/archive/scenes/${task.sceneId}`);
        if (!resp.ok) return;
        const data = await resp.json();

        const status     = data.cog_status ?? 'pending';
        const downloaded = data.bands_downloaded ?? 0;

        task.downloaded = downloaded;
        task.status     = status === 'complete' ? 'complete'
                        : status === 'error'    ? 'error'
                        : downloaded > 0        ? 'downloading'
                        : 'pending';

        if (task.status === 'complete' || task.status === 'error') {
            task.completedAt = new Date().toISOString();
            task.read = false;   // mark unread so bell badge shows
            _unreadCount++;
            _renderBadge();
            // Notify imagery tab to refresh archived scene list
            window.dispatchEvent(new CustomEvent('scene-download-complete', {
                detail: { sceneId: task.sceneId, status: task.status },
            }));
        }
    } catch { /* network error — ignore, retry next tick */ }
}

// ── Render ────────────────────────────────────────────────────────────────

function _renderBadge() {
    if (!_badgeEl) return;
    const count = _unreadCount;
    _badgeEl.textContent  = count > 9 ? '9+' : String(count);
    _badgeEl.style.display = count > 0 ? '' : 'none';
}

function _renderList() {
    if (!_listEl) return;
    if (!_tasks.length) {
        _listEl.innerHTML = '<p class="notif-empty">No notifications yet.</p>';
        return;
    }

    _listEl.innerHTML = _tasks.map((t) => {
        const pct    = t.totalBands ? Math.round((t.downloaded / t.totalBands) * 100) : 0;
        const cls    = `notif-item notif-item--${t.status}`;
        const icon   = t.status === 'complete'    ? '✅'
                     : t.status === 'error'       ? '❌'
                     : t.status === 'downloading' ? '⬇'
                     : '🕐';
        const label  = t.status === 'complete'    ? 'Download complete'
                     : t.status === 'error'       ? 'Download failed'
                     : t.status === 'downloading' ? `Downloading… ${pct}%`
                     : 'Queued';
        const time   = new Intl.DateTimeFormat('en', {
            month: 'short', day: 'numeric',
            hour: '2-digit', minute: '2-digit',
        }).format(new Date(t.createdAt));

        const bar = (t.status === 'downloading' || t.status === 'pending')
            ? `<div class="notif-progress"><div class="notif-progress-fill" style="width:${pct}%"></div></div>`
            : '';

        return `
        <div class="${cls}">
            <span class="notif-icon">${icon}</span>
            <div class="notif-body">
                <div class="notif-title">${_esc(t.sceneName)}</div>
                <div class="notif-sub">${_esc(t.aoiName)} &bull; ${time}</div>
                <div class="notif-status">${label}</div>
                ${bar}
            </div>
        </div>`;
    }).join('');
}

function _esc(s) {
    return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
