/**
 * cmr.js — Sentinel-2 scene search via Element84 Earth Search STAC API
 *
 * Free, no API key required. CORS-enabled.
 * Endpoint: https://earth-search.aws.element84.com/v1
 * Collection: sentinel-2-l2a  (ESA Sentinel-2 L2A, ~2017-present, global)
 *
 * STAC items are standard GeoJSON Features:
 *   properties.datetime          — acquisition date-time
 *   properties['eo:cloud_cover'] — cloud cover % (always present)
 *   properties.platform          — 'sentinel-2a' | 'sentinel-2b'
 *   assets.thumbnail.href        — browse image URL
 *   geometry                     — actual scene footprint polygon
 */

const STAC_BASE = 'https://earth-search.aws.element84.com/v1';
const COLLECTION = 'sentinel-2-l2a';

/**
 * Search Sentinel-2 L2A scenes sorted by cloud cover ascending.
 *
 * @param {object}  opts
 * @param {number[]} opts.bbox       - [west, south, east, north]
 * @param {string}  opts.startDate  - 'YYYY-MM-DD'
 * @param {string}  opts.endDate    - 'YYYY-MM-DD'
 * @param {number}  [opts.maxCloud=30]
 * @param {number}  [opts.pageSize=6]
 * @returns {Promise<object[]>}  Array of STAC Feature items
 */
export async function searchSentinel2({ bbox, startDate, endDate, maxCloud = 30, pageSize = 6 }) {
    const body = {
        collections: [COLLECTION],
        bbox,
        datetime: `${startDate}T00:00:00Z/${endDate}T23:59:59Z`,
        // Earth Search v1 uses the STAC 'query' extension (not CQL2-JSON filter)
        query: {
            'eo:cloud_cover': { lte: maxCloud },
        },
        sortby: [{ field: 'properties.eo:cloud_cover', direction: 'asc' }],
        limit: pageSize,
    };

    const resp = await fetch(`${STAC_BASE}/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
    if (!resp.ok) {
        const text = await resp.text().catch(() => '');
        throw new Error(`STAC search failed (${resp.status}): ${text.slice(0, 120)}`);
    }
    const json = await resp.json();
    return json.features ?? [];
}

/**
 * STAC items are already GeoJSON Features — return as-is.
 * Normalises property names to the shape the rest of the code expects.
 *
 * @param   {object} item  STAC Feature
 * @returns {object}       GeoJSON Feature (with normalised properties)
 */
export function granuleToGeoJson(item) {
    if (!item?.geometry) return null;
    return {
        ...item,
        properties: {
            ...item.properties,
            // aliases expected by cmr-footprint-layer and imagery.js
            time_start:  item.properties.datetime,
            cloud_cover: item.properties['eo:cloud_cover'],
        },
    };
}

/**
 * Return the thumbnail/browse image URL from a STAC item.
 * @param {object} item  STAC Feature
 * @returns {string|null}
 */
export function getBrowseUrl(item) {
    return (
        item.assets?.thumbnail?.href ??
        item.assets?.overview?.href ??
        item.links?.find((l) => l.rel === 'thumbnail')?.href ??
        null
    );
}

/**
 * Compute a bounding box from a GeoJSON Feature (any geometry type).
 * Returns [west, south, east, north].
 * @param {object} feature - GeoJSON Feature
 * @returns {number[]} [west, south, east, north]
 */
export function bboxFromFeature(feature) {
    const lons = [];
    const lats = [];
    const collect = (c) => {
        if (typeof c[0] === 'number') { lons.push(c[0]); lats.push(c[1]); }
        else { c.forEach(collect); }
    };
    collect(feature.geometry.coordinates);
    return [Math.min(...lons), Math.min(...lats), Math.max(...lons), Math.max(...lats)];
}
