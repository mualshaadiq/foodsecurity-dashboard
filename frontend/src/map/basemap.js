/** Available basemap definitions */
export const basemaps = {
    'esri-dark': {
        name: 'Esri Dark',
        type: 'raster',
        tiles: ['https://services.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}'],
        attribution: '© Esri',
    },
    'esri-streets': {
        name: 'Esri Streets',
        type: 'raster',
        tiles: ['https://services.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}'],
        attribution: '© Esri',
    },
    'esri-satellite': {
        name: 'Esri Satellite',
        type: 'raster',
        tiles: ['https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
        attribution: '© Esri',
    },
    osm: {
        name: 'OpenStreetMap',
        type: 'raster',
        tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
        attribution: '© OpenStreetMap contributors',
    },
    'carto-light': {
        name: 'Carto Light',
        type: 'raster',
        tiles: ['https://a.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png'],
        attribution: '© CartoDB',
    },
    'carto-dark': {
        name: 'Carto Dark',
        type: 'raster',
        tiles: ['https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png'],
        attribution: '© CartoDB',
    },
};

export let currentBasemap = 'esri-streets';

/**
 * Switch the active basemap on the map.
 * @param {maplibregl.Map} map
 * @param {string} basemapId - key from the basemaps object
 */
export function switchBasemap(map, basemapId) {
    const basemapConfig = basemaps[basemapId];
    if (!basemapConfig || !map) return;

    currentBasemap = basemapId;

    if (map.getSource('basemap')) {
        map.removeLayer('basemap');
        map.removeSource('basemap');
    }

    map.addSource('basemap', {
        type: basemapConfig.type,
        tiles: basemapConfig.tiles,
        tileSize: 256,
        attribution: basemapConfig.attribution,
    });

    // Insert below the first vector layer so it renders underneath
    const firstVectorLayer = map.getLayer('polygons') ? 'polygons' : undefined;
    map.addLayer({ id: 'basemap', type: 'raster', source: 'basemap' }, firstVectorLayer);
}

