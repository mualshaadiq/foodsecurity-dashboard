/**
 * aoi-layer.js — GeoJSON-backed MapLibre layers for saved AoI polygons.
 *
 * Unlike the Tegola vector tile layers, this source is loaded directly from
 * the FastAPI /api/food-security/aoi endpoint so it reflects DB state
 * immediately without needing Tegola to serve the data.
 *
 * Usage:
 *   initAoiLayer(map)       — call once after map style is loaded
 *   refreshAoiLayer()       — re-fetches data and updates the source
 *   setAoiLayerVisible(bool)— show / hide all AoI layers
 *   zoomToAoi(aoi)          — fitBounds to a specific AoI feature
 */
import { getAOIs } from '@/api/food-security.js';

const SOURCE_ID = 'aoi-geojson';
const FILL_ID   = 'aoi-geojson-fill';
const LINE_ID   = 'aoi-geojson-line';
const LABEL_ID  = 'aoi-geojson-label';

let _map  = null;
let _ready = false;

// ── Public ────────────────────────────────────────────────────────────────

export function initAoiLayer(map) {
    _map = map;

    map.addSource(SOURCE_ID, {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
    });

    // Fill
    map.addLayer({
        id: FILL_ID,
        type: 'fill',
        source: SOURCE_ID,
        layout: { visibility: 'visible' },
        paint: {
            'fill-color': '#a78bfa',
            'fill-opacity': 0.18,
        },
    });

    // Dashed outline — white so it stands out on any basemap
    map.addLayer({
        id: LINE_ID,
        type: 'line',
        source: SOURCE_ID,
        layout: { visibility: 'visible' },
        paint: {
            'line-color': '#ffffff',
            'line-width': 2,
            'line-dasharray': [4, 2],
        },
    });

    // Label at centroid
    map.addLayer({
        id: LABEL_ID,
        type: 'symbol',
        source: SOURCE_ID,
        layout: {
            visibility: 'visible',
            'text-field': ['get', 'name'],
            'text-size': 11,
            'text-font': ['Open Sans Regular', 'Arial Unicode MS Regular'],
            'text-anchor': 'center',
            'text-max-width': 10,
        },
        paint: {
            'text-color': '#ffffff',
            'text-halo-color': '#7c3aed',
            'text-halo-width': 1.5,
        },
    });

    _ready = true;

    // Auto-load data immediately so AOIs appear without needing a toggle
    refreshAoiLayer();
}

/**
 * Fetch all saved AoIs from the API and push them into the GeoJSON source.
 * Safe to call multiple times.
 */
export async function refreshAoiLayer() {
    if (!_map || !_ready) return;
    try {
        const aois = await getAOIs();
        const fc = {
            type: 'FeatureCollection',
            features: aois
                .filter((a) => a.geometry)
                .map((a) => ({
                    type: 'Feature',
                    id: a.id,
                    geometry: a.geometry,
                    properties: { ...(a.properties ?? {}), name: a.properties?.name ?? 'AOI' },
                })),
        };
        _map.getSource(SOURCE_ID)?.setData(fc);
    } catch (err) {
        console.warn('[aoi-layer] Could not refresh AoI layer:', err);
    }
}

/**
 * Show or hide all AoI GeoJSON layers.
 * @param {boolean} visible
 */
export function setAoiLayerVisible(visible) {
    if (!_map || !_ready) return;
    const v = visible ? 'visible' : 'none';
    [FILL_ID, LINE_ID, LABEL_ID].forEach((id) => {
        if (_map.getLayer(id)) _map.setLayoutProperty(id, 'visibility', v);
    });
}

/**
 * Fly the map to fit the bounding box of an AoI feature.
 * @param {{ geometry: object }} aoi  — a GeoJSON Feature (from the API)
 */
export function zoomToAoi(aoi) {
    if (!_map || !aoi?.geometry) return;
    const bbox = _geomBbox(aoi.geometry);
    if (!bbox) return;
    _map.fitBounds(
        [[bbox[0], bbox[1]], [bbox[2], bbox[3]]],
        { padding: 80, maxZoom: 16, duration: 600 },
    );
}

// ── Private ───────────────────────────────────────────────────────────────

function _geomBbox(geometry) {
    let coords = [];
    if (geometry.type === 'Polygon')      coords = geometry.coordinates.flat();
    else if (geometry.type === 'MultiPolygon') coords = geometry.coordinates.flat(2);
    if (!coords.length) return null;
    const lngs = coords.map((c) => c[0]);
    const lats  = coords.map((c) => c[1]);
    return [Math.min(...lngs), Math.min(...lats), Math.max(...lngs), Math.max(...lats)];
}
