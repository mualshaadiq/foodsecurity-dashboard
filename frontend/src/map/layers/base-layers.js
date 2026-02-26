/**
 * Add the original base vector tile layers (polygons, lines, points)
 * from the gis-tiles source.
 * @param {maplibregl.Map} map
 */
export function addBaseLayers(map) {
    // Polygon fill
    map.addLayer({
        id: 'polygons',
        type: 'fill',
        source: 'gis-tiles',
        'source-layer': 'polygons',
        paint: {
            'fill-color': [
                'match', ['get', 'category'],
                'urban',       '#ef4444',
                'forest',      '#10b981',
                'water',       '#3b82f6',
                'agriculture', '#f59e0b',
                '#94a3b8',
            ],
            'fill-opacity': 0.6,
            'fill-outline-color': '#000000',
        },
    });

    // Polygon outline
    map.addLayer({
        id: 'polygons-outline',
        type: 'line',
        source: 'gis-tiles',
        'source-layer': 'polygons',
        paint: {
            'line-color': '#000000',
            'line-width': 1,
        },
    });

    // Lines
    map.addLayer({
        id: 'lines',
        type: 'line',
        source: 'gis-tiles',
        'source-layer': 'lines',
        paint: {
            'line-color': [
                'match', ['get', 'category'],
                'highway', '#ef4444',
                'river',   '#3b82f6',
                'railway', '#8b5cf6',
                '#475569',
            ],
            'line-width': [
                'interpolate', ['linear'], ['zoom'],
                8, 1,
                16, 4,
            ],
        },
    });

    // Points
    map.addLayer({
        id: 'points',
        type: 'circle',
        source: 'gis-tiles',
        'source-layer': 'points',
        paint: {
            'circle-radius': [
                'interpolate', ['linear'], ['zoom'],
                8, 3,
                16, 8,
            ],
            'circle-color': [
                'match', ['get', 'category'],
                'city',     '#ef4444',
                'facility', '#10b981',
                'landmark', '#f59e0b',
                '#6366f1',
            ],
            'circle-stroke-width': 1,
            'circle-stroke-color': '#ffffff',
        },
    });
}

/**
 * Toggle visibility of the base geometry layers.
 * @param {maplibregl.Map} map
 * @param {{ points: boolean, lines: boolean, polygons: boolean }} visibility
 */
export function setBaseLayerVisibility(map, { points, lines, polygons }) {
    map.setLayoutProperty('points',           'visibility', points   ? 'visible' : 'none');
    map.setLayoutProperty('lines',            'visibility', lines    ? 'visible' : 'none');
    map.setLayoutProperty('polygons',         'visibility', polygons ? 'visible' : 'none');
    map.setLayoutProperty('polygons-outline', 'visibility', polygons ? 'visible' : 'none');
}
