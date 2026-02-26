import { authManager } from '@/auth/auth-manager.js';

/**
 * Trigger a streaming export download.
 * @param {'geojson'|'shapefile'|'csv'} format
 * @param {string} bbox - "west,south,east,north"
 * @param {string|null} [category]
 */
export async function exportData(format, bbox, category = null) {
    let url = `/api/export/${format}?bbox=${bbox}`;
    if (category) url += `&category=${encodeURIComponent(category)}`;

    const res = await authManager.fetchWithAuth(url);
    if (!res.ok) throw new Error('Export failed');

    const blob = await res.blob();
    const ext = format === 'shapefile' ? 'zip' : format === 'geojson' ? 'geojson' : 'csv';
    const downloadUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = downloadUrl;
    a.download = `export.${ext}`;
    document.body.appendChild(a);
    a.click();
    URL.revokeObjectURL(downloadUrl);
    a.remove();
}
