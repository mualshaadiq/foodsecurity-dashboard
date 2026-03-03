/**
 * Asset Management layers: LSD, LBS, Food Estate, AOI, Irrigation
 * LBS is served from the dedicated 'food_monitoring' Tegola map (food-monitoring-tiles source).
 * @param {maplibregl.Map} map
 */
export function addAssetLayers(map) {
    // ── LSD – Lahan Sawah Dilindungi ─────────────────────────────────────────
    // Served from the food_monitoring Tegola map → lsd_50k_dilindungi layer.
    map.addLayer({
        id: 'lsd-fill',
        type: 'fill',
        source: 'food-monitoring-tiles',
        'source-layer': 'lsd_50k_dilindungi',
        minzoom: 7,
        layout: { visibility: 'visible' },
        paint: {
            'fill-color': '#15803d',
            'fill-opacity': [
                'interpolate', ['linear'], ['zoom'],
                7,  0.65,
                12, 0.5,
                16, 0.35,
            ],
            'fill-outline-color': 'rgba(0,0,0,0)',
        },
    });

    // ── LBS – Lahan Baku Sawah Nasional ──────────────────────────────────────
    // Served from the food_monitoring Tegola map → lbs_50k_nasional layer.
    map.addLayer({
        id: 'lbs-fill',
        type: 'fill',
        source: 'food-monitoring-tiles',
        'source-layer': 'lbs_50k_nasional',
        minzoom: 7,
        layout: { visibility: 'visible' },
        paint: {
            'fill-color': '#fbbf24',
            'fill-opacity': [
                'interpolate', ['linear'], ['zoom'],
                7,  0.65,
                12, 0.5,
                16, 0.35,
            ],
            'fill-outline-color': 'rgba(0,0,0,0)',
        },
    });

    // ── Placeholder combined asset-polygons (LSD, Food Estate, AOI) ──────────
    // TODO: replace with dedicated layers once those tables are imported.
    map.addLayer({
        id: 'asset-polygons',
        type: 'fill',
        source: 'gis-tiles',
        'source-layer': 'asset_polygons',
        layout: { visibility: 'none' },
        paint: {
            'fill-color': [
                'match', ['get', 'category'],
                'lsd',         '#4ade80',
                'food_estate', '#f97316',
                'aoi',         '#a78bfa',
                '#94a3b8',
            ],
            'fill-opacity': 0.55,
        },
    });

    map.addLayer({
        id: 'asset-polygons-outline',
        type: 'line',
        source: 'gis-tiles',
        'source-layer': 'asset_polygons',
        layout: { visibility: 'none' },
        paint: { 'line-color': '#1e293b', 'line-width': 1 },
    });

    // Irrigation lines
    map.addLayer({
        id: 'irrigation-lines',
        type: 'line',
        source: 'gis-tiles',
        'source-layer': 'irrigation_lines',
        layout: { visibility: 'none' },
        paint: {
            'line-color': '#38bdf8',
            'line-width': ['interpolate', ['linear'], ['zoom'], 8, 1, 16, 3],
            'line-dasharray': [2, 1],
        },
    });
}

/** IDs of all layers managed by this module */
export const ASSET_LAYER_IDS = ['lsd-fill', 'lbs-fill', 'asset-polygons', 'asset-polygons-outline', 'irrigation-lines'];
