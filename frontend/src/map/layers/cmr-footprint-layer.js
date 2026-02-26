/**
 * cmr-footprint-layer.js
 *
 * Displays the spatial footprint of a selected CMR granule on the map.
 * Renders as a dashed amber/yellow polygon to distinguish from AOI layers.
 */

const SOURCE_ID = 'cmr-footprint';
const FILL_ID   = 'cmr-footprint-fill';
const LINE_ID   = 'cmr-footprint-line';

let _map = null;

const EMPTY_FC = { type: 'FeatureCollection', features: [] };

/**
 * Add the CMR footprint source and layers to the map (idempotent).
 * @param {maplibregl.Map} map
 */
export function initCmrFootprintLayer(map) {
    _map = map;
    if (map.getSource(SOURCE_ID)) return;

    map.addSource(SOURCE_ID, { type: 'geojson', data: EMPTY_FC });

    map.addLayer({
        id:     FILL_ID,
        type:   'fill',
        source: SOURCE_ID,
        paint:  { 'fill-color': '#f59e0b', 'fill-opacity': 0.12 },
    });

    map.addLayer({
        id:     LINE_ID,
        type:   'line',
        source: SOURCE_ID,
        paint:  {
            'line-color':     '#f59e0b',
            'line-width':     2,
            'line-dasharray': [4, 3],
        },
    });
}

/**
 * Show a single granule footprint as a GeoJSON feature.
 * @param {object|null} feature  GeoJSON Feature from granuleToGeoJson()
 */
export function showGranuleFootprint(feature) {
    if (!_map) return;
    const src = _map.getSource(SOURCE_ID);
    if (src) src.setData(feature
        ? { type: 'FeatureCollection', features: [feature] }
        : EMPTY_FC,
    );
}

/**
 * Remove the granule footprint from the map.
 */
export function clearGranuleFootprint() {
    showGranuleFootprint(null);
}
