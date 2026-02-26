/**
 * scene-archive.js — persist / retrieve archived Sentinel-2 scenes
 *
 * Backed by the backend /api/food-security/archived-scenes endpoints
 * which store footprints in the spatial_features PostGIS table
 * (category = 'archived_scene').
 */

const BASE = '/api/food-security';

/**
 * Save a STAC scene to the archive for a given AOI + timeframe.
 *
 * @param {object} opts
 * @param {object}  opts.stacItem   - full STAC GeoJSON Feature
 * @param {number}  opts.aoiId      - AOI database id
 * @param {string}  opts.aoiName    - AOI display name
 * @param {string}  opts.dateStart  - 'YYYY-MM-DD'
 * @param {string}  opts.dateEnd    - 'YYYY-MM-DD'
 * @returns {Promise<object>}  saved GeoJSON Feature from backend
 */
export async function archiveScene({ stacItem, aoiId, aoiName, dateStart, dateEnd }) {
    const resp = await fetch(`${BASE}/archived-scenes`, {
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
        throw new Error(`Archive failed (${resp.status}): ${text.slice(0, 120)}`);
    }
    return resp.json();
}

/**
 * List archived scenes, optionally filtered by AOI id.
 *
 * @param {number|null} aoiId
 * @returns {Promise<object[]>}  array of GeoJSON Features
 */
export async function listArchivedScenes(aoiId = null) {
    const url = aoiId != null
        ? `${BASE}/archived-scenes?aoi_id=${aoiId}`
        : `${BASE}/archived-scenes`;
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`List archived scenes failed (${resp.status})`);
    return resp.json();
}

/**
 * Delete an archived scene by its database id.
 *
 * @param {number} id
 */
export async function deleteArchivedScene(id) {
    const resp = await fetch(`${BASE}/archived-scenes/${id}`, { method: 'DELETE' });
    if (!resp.ok && resp.status !== 204) {
        throw new Error(`Delete failed (${resp.status})`);
    }
}
