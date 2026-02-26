import { authManager } from '@/auth/auth-manager.js';
import { fetchStats } from '@/api/features.js';

/**
 * Initialize the stats sidebar panel.
 * @param {maplibregl.Map} map - needed to fitBounds when bbox is present
 */
export async function loadStats(map) {
    const container = document.getElementById('stats-display');
    if (!container) return;

    if (!authManager.isAuthenticated()) {
        container.innerHTML = '<p>Login to view statistics</p>';
        return;
    }

    try {
        const stats = await fetchStats();

        let html = `<p><strong>Total Features:</strong> ${stats.total_features.toLocaleString()}</p>`;
        html += '<p><strong>By Type:</strong></p><ul class="stats-list">';
        Object.entries(stats.by_geometry_type).forEach(([type, count]) => {
            html += `<li>${type}: ${count.toLocaleString()}</li>`;
        });
        html += '</ul>';

        if (stats.bbox && map) {
            map.fitBounds(
                [[stats.bbox[0], stats.bbox[1]], [stats.bbox[2], stats.bbox[3]]],
                { padding: 50 }
            );
        }

        container.innerHTML = html;
    } catch (err) {
        console.error('Failed to load stats:', err);
        container.innerHTML = '<p>Failed to load statistics</p>';
    }
}
