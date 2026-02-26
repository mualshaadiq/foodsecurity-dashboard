/**
 * Yield Prediction layers: Yield zone choropleth
 * Source-layer: 'yield_zones' (defined in tegola/config.toml)
 * @param {maplibregl.Map} map
 */
export function addYieldLayers(map) {
    map.addLayer({
        id: 'yield-zones',
        type: 'fill',
        source: 'gis-tiles',
        'source-layer': 'yield_zones',
        layout: { visibility: 'none' },
        paint: {
            'fill-color': [
                'interpolate', ['linear'], ['get', 'predicted_yield'],
                0,    '#fee2e2',
                2,    '#fca5a5',
                4,    '#fde68a',
                6,    '#86efac',
                8,    '#16a34a',
            ],
            'fill-opacity': 0.7,
        },
    });

    map.addLayer({
        id: 'yield-zones-outline',
        type: 'line',
        source: 'gis-tiles',
        'source-layer': 'yield_zones',
        layout: { visibility: 'none' },
        paint: { 'line-color': '#1e293b', 'line-width': 0.5 },
    });
}

export const YIELD_LAYER_IDS = ['yield-zones', 'yield-zones-outline'];
