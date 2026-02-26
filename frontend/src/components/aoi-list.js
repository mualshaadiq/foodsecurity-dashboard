/**
 * aoi-list.js — renders and manages the AoI list in the Asset Management panel.
 */
import { getAOIs, deleteAOI } from '@/api/food-security.js';
import { authManager } from '@/auth/auth-manager.js';
import { formatDate } from '@/utils/date.js';
import { zoomToAoi } from '@/map/layers/aoi-layer.js';

/** Module-level AoI store — populated on each load, used by zoom handlers */
let _aois = [];

/**
 * Call once after map is ready to store a reference for the zoom handler.
 * (zoomToAoi pulls the map ref from aoi-layer.js, so this is just a guard)
 */
export function initAoiList() {
    // intentionally minimal — zoom logic lives in aoi-layer.js
}

/**
 * Fetch AoIs from API and render them into #aoi-list.
 * Safe to call multiple times (re-renders).
 */
export async function loadAoiList() {
    const container = document.getElementById('aoi-list');
    if (!container) return;

    if (!authManager.isAuthenticated()) {
        container.innerHTML = '<p class="aoi-list-empty">Login to manage AOIs.</p>';
        return;
    }

    container.innerHTML = '<p class="aoi-list-loading">Loading…</p>';

    try {
        const aois = await getAOIs();
        _aois = aois ?? [];

        if (!_aois.length) {
            container.innerHTML = '<p class="aoi-list-empty">No AOIs yet. Draw one above.</p>';
            return;
        }

        container.innerHTML = _aois.map((aoi) => {
            const p    = aoi.properties ?? aoi;
            const name = p.name ?? 'Unnamed AOI';
            const desc = p.description ?? '';
            const n    = p.monitoringInterval ?? '—';
            const unit = p.intervalUnit ?? 'days';
            const next = p.nextRunAt ? formatDate(p.nextRunAt) : null;
            const layers = Array.isArray(p.layers) ? p.layers : [];

            return `
            <div class="aoi-card" data-id="${aoi.id}">
                <div class="aoi-card-head">
                    <span class="aoi-card-name">${name}</span>
                    <div class="aoi-card-actions">
                        <button class="aoi-zoom-btn" data-id="${aoi.id}" title="Zoom to AOI">
                            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
                                <circle cx="6.5" cy="6.5" r="4.5"/>
                                <line x1="10" y1="10" x2="14" y2="14"/>
                                <line x1="4.5" y1="6.5" x2="8.5" y2="6.5"/>
                                <line x1="6.5" y1="4.5" x2="6.5" y2="8.5"/>
                            </svg>
                        </button>
                        <button class="aoi-delete-btn" data-id="${aoi.id}" title="Delete AOI">✕</button>
                    </div>
                </div>
                ${desc ? `<p class="aoi-card-desc">${desc}</p>` : ''}
                <div class="aoi-card-meta">
                    <span class="aoi-badge">Every ${n} ${unit}</span>
                    ${layers.map((l) => `<span class="aoi-layer-tag">${l}</span>`).join('')}
                </div>
                ${next ? `<p class="aoi-next-run">Next run: ${next}</p>` : ''}
            </div>`;
        }).join('');

        // Bind zoom buttons
        container.querySelectorAll('.aoi-zoom-btn').forEach((btn) => {
            btn.addEventListener('click', () => {
                const aoi = _aois.find((a) => String(a.id) === btn.dataset.id);
                if (aoi) zoomToAoi(aoi);
            });
        });

        // Bind delete buttons
        container.querySelectorAll('.aoi-delete-btn').forEach((btn) => {
            btn.addEventListener('click', async () => {
                if (!confirm('Delete this AOI?')) return;
                try {
                    await deleteAOI(btn.dataset.id);
                    loadAoiList();
                } catch (err) {
                    alert(err.message ?? 'Delete failed');
                }
            });
        });
    } catch (err) {
        container.innerHTML = `<p class="aoi-list-empty">Error: ${err.message}</p>`;
    }
}
