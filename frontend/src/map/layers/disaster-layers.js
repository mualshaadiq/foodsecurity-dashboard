/**
 * Disaster Risk Management layers: Flood Risk + Drought zones
 * Source-layer: 'disaster_risk' (defined in tegola/config.toml)
 * @param {maplibregl.Map} map
 */
export function addDisasterLayers(map) {
    // Flood risk
    map.addLayer({
        id: 'flood-risk',
        type: 'fill',
        source: 'gis-tiles',
        'source-layer': 'disaster_risk',
        filter: ['==', ['get', 'category'], 'flood_risk'],
        layout: { visibility: 'none' },
        paint: {
            'fill-color': [
                'match', ['get', 'risk_level'],
                'high',   '#dc2626',
                'medium', '#f97316',
                'low',    '#fbbf24',
                '#94a3b8',
            ],
            'fill-opacity': 0.6,
        },
    });

    // Drought zones
    map.addLayer({
        id: 'drought-zones',
        type: 'fill',
        source: 'gis-tiles',
        'source-layer': 'disaster_risk',
        filter: ['==', ['get', 'category'], 'drought_zone'],
        layout: { visibility: 'none' },
        paint: {
            'fill-color': [
                'interpolate', ['linear'], ['get', 'drought_index'],
                0,   '#fef9c3',
                0.5, '#f59e0b',
                1,   '#92400e',
            ],
            'fill-opacity': 0.65,
        },
    });
}

export const DISASTER_LAYER_IDS = ['flood-risk', 'drought-zones'];
