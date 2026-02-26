import { authManager } from '@/auth/auth-manager.js';

/**
 * Fetch stats (total, by geometry type, by category, bbox).
 * @returns {Promise<object>}
 */
export async function fetchStats() {
    const res = await authManager.fetchWithAuth('/api/features/stats');
    if (!res.ok) throw new Error('Failed to fetch stats');
    return res.json();
}

/**
 * Search features by text query.
 * @param {string} query
 * @param {number} [limit=10]
 * @returns {Promise<object>} GeoJSON FeatureCollection
 */
export async function searchFeatures(query, limit = 10) {
    const res = await authManager.fetchWithAuth(
        `/api/features/search?q=${encodeURIComponent(query)}&limit=${limit}`
    );
    if (!res.ok) throw new Error('Search failed');
    return res.json();
}
