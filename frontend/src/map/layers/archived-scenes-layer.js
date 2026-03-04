/**
 * archived-scenes-layer.js
 *
 * MapLibre layer that renders all archived Sentinel-2 scene footprints
 * as filled polygons on the map.
 *
 * Layers:
 *   archived-scenes-fill  — semi-transparent blue fill
 *   archived-scenes-line  — solid border
 *   archived-scenes-label — acquisition date label at centroid
 */

const SOURCE_ID = 'archived-scenes';

// ── Internal helpers ──────────────────────────────────────────────────────

function _emptyCollection() {
    return { type: 'FeatureCollection', features: [] };
}

// ── Public API ────────────────────────────────────────────────────────────

/**
 * Add the source + layers to the map. Call once after map load.
 * @param {maplibregl.Map} map
 */
export function initArchivedScenesLayer(map) {
    if (map.getSource(SOURCE_ID)) return;

    map.addSource(SOURCE_ID, {
        type: 'geojson',
        data: _emptyCollection(),
    });

    // Border (outline only — no fill)
    map.addLayer({
        id:     'archived-scenes-line',
        type:   'line',
        source: SOURCE_ID,
        paint: {
            'line-color':   '#2563eb',
            'line-width':   1.5,
            'line-dasharray': [4, 3],
        },
    });
}

/**
 * Replace the layer data with an array of archived-scene GeoJSON Features.
 * @param {object[]} features  array of GeoJSON Features from backend
 */
export function showArchivedScenes(features) {
    // lazy guard — called before initArchivedScenesLayer in some timing paths
    if (typeof features !== 'object') return;
    _updateSource({ type: 'FeatureCollection', features: features ?? [] });
}

/**
 * Highlight (zoom + thick outline) a single archived scene by db id.
 * @param {maplibregl.Map} map
 * @param {number}         dbId
 * @param {object[]}       features  current feature list
 */
export function zoomToArchivedScene(map, dbId, features) {
    const feat = features.find((f) => f.id === dbId);
    if (!feat?.geometry) return;
    const coords = feat.geometry.coordinates.flat(3);
    const lons = coords.filter((_, i) => i % 2 === 0);
    const lats = coords.filter((_, i) => i % 2 === 1);
    const w = Math.min(...lons), e = Math.max(...lons);
    const s = Math.min(...lats), n = Math.max(...lats);
    map.fitBounds([[w, s], [e, n]], { padding: 60, maxZoom: 10 });
}

/**
 * Remove all archived-scene footprints from the map.
 */
export function clearArchivedScenes() {
    _updateSource(_emptyCollection());
}

// ── Private ───────────────────────────────────────────────────────────────

let _mapRef = null;

export function _setMapRef(map) { _mapRef = map; }

function _updateSource(data) {
    if (!_mapRef) return;
    const src = _mapRef.getSource(SOURCE_ID);
    if (src) src.setData(data);
}
