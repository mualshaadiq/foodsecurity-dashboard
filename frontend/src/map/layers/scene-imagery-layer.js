/**
 * scene-imagery-layer.js
 *
 * Renders archived Sentinel-2 scene imagery on the map.
 *
 * Strategy:
 *   • If a visual COG URL is available (stac_asset_urls.visual from STAC)
 *     → use MapLibre 'raster' tile source via TiTiler (dynamic COG tiler)
 *       TiTiler runs on localhost:8083 and fetches the COG server-side,
 *       bypassing any S3 CORS restrictions.
 *
 *   • Otherwise fall back to the presigned MinIO preview JPEG via a
 *     MapLibre 'image' source (proxied through our backend if external).
 *
 * Note: both source types cannot be updated in-place — we remove + re-add.
 */

const SOURCE_ID   = 'scene-preview-image';
const LAYER_ID    = 'scene-preview-layer';

// TiTiler — dynamic COG tile server, proxied same-origin via Vite/nginx
const TITILER_BASE = '/titiler';

// Backend proxy — used only for the fallback 'image' source
const PROXY_BASE  = '/api/archive/proxy-image';

let _map = null;

/** Wrap an external image URL through the backend proxy to avoid CORS. */
function _proxied(url) {
    if (!url) return url;
    if (url.startsWith('/') || url.includes('localhost') || url.includes('127.0.0.1') || url.includes('minio')) {
        return url;
    }
    return `${PROXY_BASE}?url=${encodeURIComponent(url)}`;
}

export function initSceneImageryLayer(map) {
    _map = map;
    // Nothing to pre-create; source/layer are added on demand.
}

/**
 * Show scene imagery on the map.
 *
 * When a visual COG URL is provided, tiles are served via TiTiler for
 * proper zoom-adaptive rendering.  Without a COG URL the presigned preview
 * JPEG is draped as a static image overlay (fallback).
 *
 * @param {string}   previewUrl  presigned MinIO URL (fallback thumbnail)
 * @param {object}   geometry    GeoJSON geometry of the scene footprint
 * @param {number}   [opacity]   0–1 (default 0.85)
 * @param {string}   [visualUrl] STAC visual COG URL — enables TiTiler tiles
 */
export function showSceneImage(previewUrl, geometry, opacity = 1, visualUrl = null) {
    if (!_map || !geometry) return;

    _removeImageLayer();

    if (visualUrl) {
        // ── TiTiler raster tiles from Cloud-Optimized GeoTIFF ──────────
        // Sentinel-2 L2A 'visual' asset is already 8-bit RGB (no rescaling).
        const tileUrl = `${TITILER_BASE}/cog/tiles/WebMercatorQuad/{z}/{x}/{y}` +
                        `?url=${encodeURIComponent(visualUrl)}`;

        const bbox = _geometryBbox(geometry); // [W, S, E, N]

        _map.addSource(SOURCE_ID, {
            type:        'raster',
            tiles:       [tileUrl],
            tileSize:    256,
            minzoom:     1,
            maxzoom:     24,
            ...(bbox ? { bounds: bbox } : {}),
            attribution: '© ESA / Copernicus',
        });
    } else if (previewUrl) {
        // ── Fallback: static preview JPEG draped over footprint bbox ───
        const coords = _bboxCorners(geometry);
        if (!coords) return;

        _map.addSource(SOURCE_ID, {
            type:        'image',
            url:         _proxied(previewUrl),
            coordinates: coords,   // [NW, NE, SE, SW]
        });
    } else {
        return; // nothing to show
    }

    // Insert below all vector/polygon layers — just above the basemap rasters.
    const beforeId = _firstVectorLayer();
    _map.addLayer({
        id:     LAYER_ID,
        type:   'raster',
        source: SOURCE_ID,
        paint:  {
            'raster-opacity':       opacity,
            'raster-fade-duration': 400,
            'raster-resampling':    'linear',
        },
    }, beforeId);
}

/**
 * Remove the preview image overlay from the map.
 */
export function hideSceneImage() {
    _removeImageLayer();
}

// ── Private ───────────────────────────────────────────────────────────────

function _removeImageLayer() {
    if (!_map) return;
    if (_map.getLayer(LAYER_ID))  _map.removeLayer(LAYER_ID);
    if (_map.getSource(SOURCE_ID)) _map.removeSource(SOURCE_ID);
}

/**
 * Return the id of the first non-raster layer so we can insert imagery below it.
 * Falls back to undefined (adds on top) if no vector layers exist yet.
 */
function _firstVectorLayer() {
    if (!_map) return undefined;
    const candidates = ['polygons', 'lines', 'points', 'lsd-fill', 'lbs-fill'];
    for (const id of candidates) {
        if (_map.getLayer(id)) return id;
    }
    // Generic fallback: first layer whose type is not 'raster' or 'background'
    const layers = _map.getStyle()?.layers ?? [];
    const first  = layers.find((l) => l.type !== 'raster' && l.type !== 'background');
    return first?.id;
}

/**
 * Return [W, S, E, N] bbox from a GeoJSON geometry (for MapLibre `bounds`).
 */
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

/**
 * Extract [NW, NE, SE, SW] corners from any GeoJSON geometry.
 * Returns null if coords cannot be parsed (used by fallback image source).
 */
function _bboxCorners(geometry) {
    try {
        // Flatten all coordinate pairs regardless of geometry type
        const flat = geometry.coordinates.flat(4);
        const lons = flat.filter((_, i) => i % 2 === 0);
        const lats = flat.filter((_, i) => i % 2 === 1);
        const w = Math.min(...lons), e = Math.max(...lons);
        const s = Math.min(...lats), n = Math.max(...lats);
        // MapLibre image source: top-left, top-right, bottom-right, bottom-left
        return [
            [w, n],  // NW
            [e, n],  // NE
            [e, s],  // SE
            [w, s],  // SW
        ];
    } catch {
        return null;
    }
}
