/**
 * imagery-layers.js
 *
 * Manages satellite imagery raster layers on the map.
 *
 * Currently supported: Sentinel-2 cloudless (EOX IT Services WMTS)
 * Planned:             Planet API high-resolution daily imagery
 */

const SENTINEL_TILES = {
    '2020': 'https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2020_3857/default/g/{z}/{y}/{x}.jpg',
    '2021': 'https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2021_3857/default/g/{z}/{y}/{x}.jpg',
    '2022': 'https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2022_3857/default/g/{z}/{y}/{x}.jpg',
    '2023': 'https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2023_3857/default/g/{z}/{y}/{x}.jpg',
};

const SOURCE_ID = 'sentinel-imagery';
const LAYER_ID  = 'sentinel-imagery-layer';

let _map = null;

/**
 * Add the Sentinel-2 layer to the map (idempotent).
 * Inserts above basemap but below all vector overlays.
 * @param {maplibregl.Map} map
 */
export function initSentinelLayer(map) {
    _map = map;
    if (map.getSource(SOURCE_ID)) return;

    map.addSource(SOURCE_ID, {
        type:        'raster',
        tiles:       [SENTINEL_TILES['2023']],
        tileSize:    256,
        attribution: 'Sentinel-2 cloudless © EOX IT Services GmbH · Contains modified Copernicus Sentinel data',
    });

    // Insert between basemap and vector layers
    const insertBefore = map.getLayer('polygons') ? 'polygons' : undefined;
    map.addLayer({
        id:     LAYER_ID,
        type:   'raster',
        source: SOURCE_ID,
        paint:  { 'raster-opacity': 1 },
        layout: { visibility: 'visible' },
    }, insertBefore);
}

/**
 * Switch to a different Sentinel-2 cloudless year.
 * @param {string} year  — '2020' | '2021' | '2022' | '2023'
 */
export function setSentinelYear(year) {
    const url = SENTINEL_TILES[year];
    if (!url || !_map) return;
    const src = _map.getSource(SOURCE_ID);
    if (src) src.setTiles([url]);
}

/**
 * Set Sentinel layer opacity (0–1).
 * @param {number} opacity
 */
export function setSentinelOpacity(opacity) {
    if (!_map || !_map.getLayer(LAYER_ID)) return;
    _map.setPaintProperty(LAYER_ID, 'raster-opacity', Math.max(0, Math.min(1, opacity)));
}

/**
 * Show or hide the Sentinel layer.
 * @param {boolean} visible
 */
export function setSentinelVisible(visible) {
    if (!_map || !_map.getLayer(LAYER_ID)) return;
    _map.setLayoutProperty(LAYER_ID, 'visibility', visible ? 'visible' : 'none');
}
