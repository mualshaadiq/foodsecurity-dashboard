/**
 * scene-archive.js — archive / retrieve Sentinel-2 scenes via MinIO S3
 *
 * Backed by /api/archive/scenes (FastAPI → MinIO + PostGIS).
 *
 * Storage path: {satellite-provider}/{YYYY}/{MM}/{DD}/{scene-id}-{type}.{ext}
 * e.g.  sentinel-2a/2026/02/26/S2A_31MBN_20260226_0_L2A-preview.jpg
 *       sentinel-2a/2026/02/26/S2A_31MBN_20260226_0_L2A-metadata.json
 */

const BASE = '/api/archive';

/**
 * Archive a STAC scene: downloads preview to MinIO, saves footprint to PostGIS.
 * Returns the saved feature with a presigned `preview_url` from MinIO.
 *
 * @param {object} opts
 * @param {object}  opts.stacItem   - full STAC GeoJSON Feature from Element84
 * @param {number}  opts.aoiId      - AOI database id
 * @param {string}  opts.aoiName    - AOI display name
 * @param {string}  opts.dateStart  - 'YYYY-MM-DD'
 * @param {string}  opts.dateEnd    - 'YYYY-MM-DD'
 * @returns {Promise<object>}  saved GeoJSON Feature + preview_url (presigned MinIO URL)
 */
export async function archiveScene({ stacItem, aoiId, aoiName, dateStart, dateEnd }) {
    const resp = await fetch(`${BASE}/scenes`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
            aoi_id:     aoiId,
            aoi_name:   aoiName,
            date_start: dateStart,
            date_end:   dateEnd,
            stac_item:  stacItem,
        }),
    });
    if (!resp.ok) {
        const text = await resp.text().catch(() => '');
        throw new Error(`Archive failed (${resp.status}): ${text.slice(0, 200)}`);
    }
    return resp.json();
}

/**
 * List archived scenes, optionally filtered by AOI id.
 * Each scene includes a fresh `preview_url` (presigned MinIO URL).
 *
 * @param {number|null} aoiId
 * @returns {Promise<object[]>}  array of GeoJSON Features
 */
export async function listArchivedScenes(aoiId = null) {
    const url = aoiId != null
        ? `${BASE}/scenes?aoi_id=${aoiId}`
        : `${BASE}/scenes`;
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`List archived scenes failed (${resp.status})`);
    return resp.json();
}

/**
 * Delete an archived scene (removes MinIO objects + PostGIS row).
 *
 * @param {number} id  database id
 */
export async function deleteArchivedScene(id) {
    const resp = await fetch(`${BASE}/scenes/${id}`, { method: 'DELETE' });
    if (!resp.ok && resp.status !== 204) {
        throw new Error(`Delete failed (${resp.status})`);
    }
}
