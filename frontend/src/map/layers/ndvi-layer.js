/**
 * ndvi-layer.js
 *
 * Renders a per-scene NDVI GeoTIFF as a MapLibre raster layer, served via
 * TiTiler using the rdylgn colormap (red = critical, green = healthy).
 *
 * Source is a TiTiler tile-URL template returned by POST /api/analysis/run.
 * The COG lives in MinIO; TiTiler fetches it server-side so the browser only
 * talks to /titiler/* (same-origin, no CORS).
 *
 * Usage:
 *   initNdviLayer(map);
 *   showNdviLayer(tileUrl, geometry);   // after runAnalysis()
 *   hideNdviLayer();
 */

const SOURCE_ID = 'ndvi-cog-source';
const LAYER_ID  = 'ndvi-cog-layer';

let _map = null;

export function initNdviLayer(map) {
    _map = map;
}

/**
 * Display the NDVI raster on the map.
 *
 * @param {string} tileUrl   TiTiler tile-URL template, e.g.
 *   "/titiler/cog/tiles/WebMercatorQuad/{z}/{x}/{y}?url=...&colormap_name=rdylgn&rescale=-1,1"
 * @param {object} [geometry]  GeoJSON geometry for bounding-box hint (optional)
 */
export function showNdviLayer(tileUrl, geometry = null) {
    if (!_map || !tileUrl) return;
    _removeNdviLayer();

    const bbox = geometry ? _geometryBbox(geometry) : null;

    _map.addSource(SOURCE_ID, {
        type:     'raster',
        tiles:    [tileUrl],
        tileSize: 256,
        minzoom:  1,
        maxzoom:  24,
        ...(bbox ? { bounds: bbox } : {}),
        attribution: 'NDVI · ESA / Copernicus',
    });

    const beforeId = _firstVectorLayer();
    _map.addLayer({
        id:     LAYER_ID,
        type:   'raster',
        source: SOURCE_ID,
        paint:  {
            'raster-opacity':       0.85,
            'raster-fade-duration': 300,
            'raster-resampling':    'linear',
        },
    }, beforeId);
}

export function hideNdviLayer() {
    _removeNdviLayer();
}

export function isNdviLayerVisible() {
    return !!(_map && _map.getLayer(LAYER_ID));
}

// ── Private ───────────────────────────────────────────────────────────────

function _removeNdviLayer() {
    if (!_map) return;
    if (_map.getLayer(LAYER_ID))   _map.removeLayer(LAYER_ID);
    if (_map.getSource(SOURCE_ID)) _map.removeSource(SOURCE_ID);
}

function _firstVectorLayer() {
    if (!_map) return undefined;
    const candidates = ['polygons', 'lines', 'points', 'lsd-fill', 'lbs-fill'];
    for (const id of candidates) {
        if (_map.getLayer(id)) return id;
    }
    const layers = _map.getStyle()?.layers ?? [];
    const first  = layers.find((l) => l.type !== 'raster' && l.type !== 'background');
    return first?.id;
}

function _geometryBbox(geometry) {
    try {
        const flat = geometry.coordinates.flat(4);
        const lons = flat.filter((_, i) => i % 2 === 0);
        const lats = flat.filter((_, i) => i % 2 === 1);
        return [Math.min(...lons), Math.min(...lats), Math.max(...lons), Math.max(...lats)];
    } catch {
        return null;
    }
}
