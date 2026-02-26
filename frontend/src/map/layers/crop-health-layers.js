/**
 * Crop Health Monitoring layers: NDVI zones + Fertilizer (crop zoning)
 * Source-layer: 'crop_health' (defined in tegola/config.toml)
 * @param {maplibregl.Map} map
 */
export function addCropHealthLayers(map) {
    // NDVI zone fill
    map.addLayer({
        id: 'ndvi-zones',
        type: 'fill',
        source: 'gis-tiles',
        'source-layer': 'crop_health',
        filter: ['==', ['get', 'category'], 'ndvi_zone'],
        layout: { visibility: 'none' },
        paint: {
            'fill-color': [
                'match', ['get', 'ndvi_class'],
                'critical', '#dc2626',
                'low',      '#f97316',
                'moderate', '#facc15',
                'healthy',  '#16a34a',
                '#94a3b8',
            ],
            'fill-opacity': 0.7,
        },
    });

    // Fertilizer / crop zoning
    map.addLayer({
        id: 'fertilizer-zones',
        type: 'fill',
        source: 'gis-tiles',
        'source-layer': 'crop_health',
        filter: ['==', ['get', 'category'], 'fertilizer_zone'],
        layout: { visibility: 'none' },
        paint: {
            'fill-color': [
                'match', ['get', 'zone_level'],
                'high',   '#7c3aed',
                'medium', '#a78bfa',
                'low',    '#ddd6fe',
                '#94a3b8',
            ],
            'fill-opacity': 0.6,
        },
    });
}

export const CROP_HEALTH_LAYER_IDS = ['ndvi-zones', 'fertilizer-zones'];
