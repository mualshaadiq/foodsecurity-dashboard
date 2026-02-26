/**
 * draw-control.js — thin wrapper around @mapbox/mapbox-gl-draw
 * compatible with MapLibre GL JS.
 *
 * The default MapboxDraw theme uses `line-dasharray: [0, 2, 2]` as a bare
 * numeric array inside GL expressions.  MapLibre GL JS requires those to be
 * wrapped in `["literal", [...]]`.  We pass a fixed custom styles array.
 */
import MapboxDraw from '@mapbox/mapbox-gl-draw';

// ── Fixed styles (dasharray numeric arrays → ["literal", [...]] ) ──────────
const DRAW_STYLES = [
    // Polygon fill — inactive
    {
        id: 'gl-draw-polygon-fill-inactive',
        type: 'fill',
        filter: ['all', ['==', 'active', 'false'], ['==', '$type', 'Polygon'], ['!=', 'mode', 'static']],
        paint: { 'fill-color': '#b87010', 'fill-outline-color': '#b87010', 'fill-opacity': 0.1 },
    },
    // Polygon fill — active
    {
        id: 'gl-draw-polygon-fill-active',
        type: 'fill',
        filter: ['all', ['==', 'active', 'true'], ['==', '$type', 'Polygon']],
        paint: { 'fill-color': '#fbbf24', 'fill-outline-color': '#fbbf24', 'fill-opacity': 0.1 },
    },
    // Polygon midpoint
    {
        id: 'gl-draw-polygon-midpoint',
        type: 'circle',
        filter: ['all', ['==', '$type', 'Point'], ['==', 'meta', 'midpoint']],
        paint: { 'circle-radius': 3, 'circle-color': '#fbbf24' },
    },
    // Polygon stroke — inactive (FIXED: literal dasharray)
    {
        id: 'gl-draw-polygon-stroke-inactive',
        type: 'line',
        filter: ['all', ['==', 'active', 'false'], ['==', '$type', 'Polygon'], ['!=', 'mode', 'static']],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': '#b87010', 'line-width': 2 },
    },
    // Polygon stroke — active (FIXED: literal dasharray)
    {
        id: 'gl-draw-polygon-stroke-active',
        type: 'line',
        filter: ['all', ['==', 'active', 'true'], ['==', '$type', 'Polygon']],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': '#fbbf24', 'line-dasharray': ['literal', [0.2, 2]], 'line-width': 2 },
    },
    // Line — inactive (FIXED: literal dasharray)
    {
        id: 'gl-draw-line-inactive',
        type: 'line',
        filter: ['all', ['==', 'active', 'false'], ['==', '$type', 'LineString'], ['!=', 'mode', 'static']],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': '#b87010', 'line-width': 2 },
    },
    // Line — active (FIXED: literal dasharray)
    {
        id: 'gl-draw-line-active',
        type: 'line',
        filter: ['all', ['==', 'active', 'true'], ['==', '$type', 'LineString']],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': '#fbbf24', 'line-dasharray': ['literal', [0.2, 2]], 'line-width': 2 },
    },
    // Vertex point — halo
    {
        id: 'gl-draw-polygon-and-line-vertex-stroke-inactive',
        type: 'circle',
        filter: ['all', ['==', 'meta', 'vertex'], ['==', '$type', 'Point'], ['!=', 'mode', 'static']],
        paint: { 'circle-radius': 5, 'circle-color': '#fff' },
    },
    // Vertex point
    {
        id: 'gl-draw-polygon-and-line-vertex-inactive',
        type: 'circle',
        filter: ['all', ['==', 'meta', 'vertex'], ['==', '$type', 'Point'], ['!=', 'mode', 'static']],
        paint: { 'circle-radius': 3, 'circle-color': '#fbbf24' },
    },
    // Point — inactive
    {
        id: 'gl-draw-point-point-stroke-inactive',
        type: 'circle',
        filter: ['all', ['==', 'active', 'false'], ['==', '$type', 'Point'], ['==', 'meta', 'feature'], ['!=', 'mode', 'static']],
        paint: { 'circle-radius': 5, 'circle-opacity': 1, 'circle-color': '#fff' },
    },
    {
        id: 'gl-draw-point-inactive',
        type: 'circle',
        filter: ['all', ['==', 'active', 'false'], ['==', '$type', 'Point'], ['==', 'meta', 'feature'], ['!=', 'mode', 'static']],
        paint: { 'circle-radius': 3, 'circle-color': '#b87010' },
    },
    // Point — active
    {
        id: 'gl-draw-point-stroke-active',
        type: 'circle',
        filter: ['all', ['==', '$type', 'Point'], ['==', 'active', 'true'], ['!=', 'meta', 'midpoint']],
        paint: { 'circle-radius': 7, 'circle-color': '#fff' },
    },
    {
        id: 'gl-draw-point-active',
        type: 'circle',
        filter: ['all', ['==', '$type', 'Point'], ['!=', 'meta', 'midpoint'], ['==', 'active', 'true']],
        paint: { 'circle-radius': 5, 'circle-color': '#fbbf24' },
    },
    // Static polygon fill
    {
        id: 'gl-draw-polygon-fill-static',
        type: 'fill',
        filter: ['all', ['==', 'mode', 'static'], ['==', '$type', 'Polygon']],
        paint: { 'fill-color': '#404040', 'fill-outline-color': '#404040', 'fill-opacity': 0.1 },
    },
    // Static polygon stroke
    {
        id: 'gl-draw-polygon-stroke-static',
        type: 'line',
        filter: ['all', ['==', 'mode', 'static'], ['==', '$type', 'Polygon']],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': '#404040', 'line-width': 2 },
    },
    // Static line
    {
        id: 'gl-draw-line-static',
        type: 'line',
        filter: ['all', ['==', 'mode', 'static'], ['==', '$type', 'LineString']],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': '#404040', 'line-width': 2 },
    },
    // Static point
    {
        id: 'gl-draw-point-static',
        type: 'circle',
        filter: ['all', ['==', 'mode', 'static'], ['==', '$type', 'Point']],
        paint: { 'circle-radius': 5, 'circle-color': '#404040' },
    },
];

let _draw = null;

/**
 * Create and attach the draw control to the map.
 * Call once during map initialisation.
 * @param {maplibregl.Map} map
 */
export function initDrawControl(map) {
    _draw = new MapboxDraw({
        displayControlsDefault: false,
        controls: {},
        styles: DRAW_STYLES,
    });
    map.addControl(_draw, 'top-right');
    return _draw;
}

/** Start drawing a polygon. Clears any previous drawn feature first. */
export function activateDraw() {
    if (!_draw) return;
    _draw.deleteAll();
    _draw.changeMode('draw_polygon');
}

/** Exit draw mode and clear the drawn feature. */
export function deactivateDraw() {
    if (!_draw) return;
    try { _draw.changeMode('simple_select'); } catch (_) { /* noop if not yet loaded */ }
    _draw.deleteAll();
}

/**
 * Return the first drawn GeoJSON Feature (or null).
 * @returns {GeoJSON.Feature|null}
 */
export function getDrawnFeature() {
    if (!_draw) return null;
    const data = _draw.getAll();
    return data.features.length > 0 ? data.features[0] : null;
}

/** Raw MapboxDraw instance — for event listening. */
export function getDraw() {
    return _draw;
}
