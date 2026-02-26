import maplibregl from 'maplibre-gl';

/**
 * Setup hover cursor and click popup interactions for the base vector layers.
 * @param {maplibregl.Map} map
 */
export function setupMapInteractions(map) {
    ['polygons', 'lines', 'points'].forEach((layer) => {
        map.on('mouseenter', layer, () => {
            map.getCanvas().style.cursor = 'pointer';
        });

        map.on('mouseleave', layer, () => {
            map.getCanvas().style.cursor = '';
        });

        map.on('click', layer, (e) => {
            if (e.features.length > 0) {
                showFeaturePopup(map, e.features[0], e.lngLat);
            }
        });
    });
}

/**
 * Display a MapLibre popup with feature properties.
 * @param {maplibregl.Map} map
 * @param {object} feature - GeoJSON feature
 * @param {maplibregl.LngLat} lngLat
 */
export function showFeaturePopup(map, feature, lngLat) {
    const p = feature.properties;

    let html = '<table class="feature-info-table">';
    html += `<tr><td>ID</td><td>${p.id ?? 'N/A'}</td></tr>`;
    html += `<tr><td>Name</td><td>${p.name ?? 'N/A'}</td></tr>`;
    html += `<tr><td>Category</td><td>${p.category ?? 'N/A'}</td></tr>`;
    html += `<tr><td>Type</td><td>${p.geom_type ?? 'N/A'}</td></tr>`;
    html += '</table>';

    new maplibregl.Popup().setLngLat(lngLat).setHTML(html).addTo(map);
}

/**
 * Fly/fit map to a feature geometry and show its popup.
 * @param {maplibregl.Map} map
 * @param {object} feature - GeoJSON feature
 */
export function zoomToFeature(map, feature) {
    const coords = feature.geometry.coordinates;
    const type = feature.geometry.type;

    if (type === 'Point') {
        map.flyTo({ center: coords, zoom: 14 });
        showFeaturePopup(map, feature, coords);
    } else if (type === 'LineString') {
        const bounds = coords.reduce(
            (b, c) => b.extend(c),
            new maplibregl.LngLatBounds(coords[0], coords[0])
        );
        map.fitBounds(bounds, { padding: 50 });
    } else if (type === 'Polygon') {
        const ring = coords[0];
        const bounds = ring.reduce(
            (b, c) => b.extend(c),
            new maplibregl.LngLatBounds(ring[0], ring[0])
        );
        map.fitBounds(bounds, { padding: 50 });
    }
}
