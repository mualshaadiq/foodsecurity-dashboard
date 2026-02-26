/**
 * AI tab layers: Farm Boundary (delineation) + Crop Classification
 * Source-layer: 'ai_boundaries' (defined in tegola/config.toml)
 * @param {maplibregl.Map} map
 */
export function addAILayers(map) {
    // Farm boundary fill
    map.addLayer({
        id: 'farm-boundary',
        type: 'fill',
        source: 'gis-tiles',
        'source-layer': 'ai_boundaries',
        filter: ['==', ['get', 'category'], 'farm_boundary'],
        layout: { visibility: 'none' },
        paint: {
            'fill-color': '#86efac',
            'fill-opacity': 0.4,
        },
    });

    map.addLayer({
        id: 'farm-boundary-outline',
        type: 'line',
        source: 'gis-tiles',
        'source-layer': 'ai_boundaries',
        filter: ['==', ['get', 'category'], 'farm_boundary'],
        layout: { visibility: 'none' },
        paint: { 'line-color': '#16a34a', 'line-width': 1.5 },
    });

    // Crop classification fill
    map.addLayer({
        id: 'crop-classification',
        type: 'fill',
        source: 'gis-tiles',
        'source-layer': 'ai_boundaries',
        filter: ['==', ['get', 'category'], 'crop_classification'],
        layout: { visibility: 'none' },
        paint: {
            'fill-color': [
                'match', ['get', 'crop_type'],
                'rice',      '#16a34a',
                'corn',      '#ca8a04',
                'soybean',   '#7c3aed',
                'sugarcane', '#0891b2',
                'other',     '#94a3b8',
                '#94a3b8',
            ],
            'fill-opacity': 0.65,
        },
    });
}

export const AI_LAYER_IDS = ['farm-boundary', 'farm-boundary-outline', 'crop-classification'];
