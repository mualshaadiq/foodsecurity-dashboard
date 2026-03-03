import maplibregl from 'maplibre-gl';

/** Module-level map instance – access via getMap() */
let map = null;

/** @returns {maplibregl.Map} */
export function getMap() {
    return map;
}

/**
 * Create and mount the MapLibre map.
 * @param {string} basemapTiles - tile URL array for the initial basemap
 * @param {string} basemapAttribution
 * @param {Function} onLoad - callback fired after map 'load' event
 */
export function initMap(basemapTiles, basemapAttribution, onLoad) {
    map = new maplibregl.Map({
        container: 'map',
        // Let MapLibre auto-size the tile cache based on viewport (default).
        // A fixed low value (e.g. 40) causes tiles to be evicted too aggressively
        // during panning, resulting in blank areas.
        style: {
            version: 8,
            sources: {
                basemap: {
                    type: 'raster',
                    tiles: basemapTiles,
                    tileSize: 256,
                    attribution: basemapAttribution,
                },
                'gis-tiles': {
                    type: 'vector',
                    tiles: [window.location.origin + '/tiles/gis_map/{z}/{x}/{y}.pbf'],
                    minzoom: 0,
                    maxzoom: 16,
                    bounds: [95.0, -11.0, 141.0, 6.0],
                },
                'food-monitoring-tiles': {
                    type: 'vector',
                    tiles: [window.location.origin + '/tiles/food_monitoring/{z}/{x}/{y}.pbf'],
                    minzoom: 7,
                    maxzoom: 14,
                    bounds: [95.0, -11.0, 141.0, 6.0],
                    attribution: '© BIG – Badan Informasi Geospasial',
                    promoteId: 'id',
                },
            },
            layers: [
                {
                    id: 'basemap',
                    type: 'raster',
                    source: 'basemap',
                },
            ],
        },
        center: [118.0, -2.5], // Indonesia
        zoom: 5,
    });

    map.addControl(new maplibregl.NavigationControl(), 'top-right');
    map.addControl(new maplibregl.ScaleControl(), 'bottom-left');
    map.addControl(new maplibregl.FullscreenControl(), 'top-right');

    map.on('load', () => {
        if (typeof onLoad === 'function') onLoad(map);
    });

    return map;
}
