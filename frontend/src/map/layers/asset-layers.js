/**
 * Asset Management layers: LSD, LBS, Food Estate, AOI, Irrigation
 * Source-layer: 'asset_polygons' and 'irrigation_lines' (defined in tegola/config.toml)
 * @param {maplibregl.Map} map
 */
export function addAssetLayers(map) {
    // Asset polygons (LSD, LBS, Food Estate, AOI)
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
                'lbs',         '#facc15',
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
export const ASSET_LAYER_IDS = ['asset-polygons', 'asset-polygons-outline', 'irrigation-lines'];
