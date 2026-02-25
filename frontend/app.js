// Main Application Logic
import maplibregl from 'maplibre-gl';

let map;
let currentBasemap = 'esri-dark';
let currentFilters = {
    category: null,
    showPoints: true,
    showLines: true,
    showPolygons: true
};

// Available basemaps
const basemaps = {
    'esri-dark': {
        name: 'Esri Dark',
        type: 'raster',
        tiles: ['https://services.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}'],
        attribution: '© Esri'
    },
    'esri-streets': {
        name: 'Esri Streets',
        type: 'raster',
        tiles: ['https://services.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}'],
        attribution: '© Esri'
    },
    'esri-satellite': {
        name: 'Esri Satellite',
        type: 'raster',
        tiles: ['https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
        attribution: '© Esri'
    },
    'osm': {
        name: 'OpenStreetMap',
        type: 'raster',
        tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
        attribution: '© OpenStreetMap contributors'
    },
    'carto-light': {
        name: 'Carto Light',
        type: 'raster',
        tiles: ['https://a.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png'],
        attribution: '© CartoDB'
    },
    'carto-dark': {
        name: 'Carto Dark',
        type: 'raster',
        tiles: ['https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png'],
        attribution: '© CartoDB'
    }
};

// Initialize the application
function initApp() {
    initMap();
    initEventListeners();
    initBasemapSelector();
    loadCategories();
    
    // Listen for auth changes
    window.addEventListener('auth-changed', handleAuthChange);
    
    // Load stats if authenticated
    if (authManager.isAuthenticated()) {
        loadStats();
    }
}

// Initialize MapLibre map
function initMap() {
    const basemapConfig = basemaps[currentBasemap];
    
    map = new maplibregl.Map({
        container: 'map',
        style: {
            version: 8,
            sources: {
                'basemap': {
                    type: basemapConfig.type,
                    tiles: basemapConfig.tiles,
                    tileSize: 256,
                    attribution: basemapConfig.attribution
                },
                'gis-tiles': {
                    type: 'vector',
                    tiles: [window.location.origin + '/tiles/gis_map/{z}/{x}/{y}.pbf'],
                    minzoom: 0,
                    maxzoom: 16
                }
            },
            layers: [
                {
                    id: 'basemap',
                    type: 'raster',
                    source: 'basemap'
                }
            ]
        },
        center: [118.0, -2.5], // Indonesia
        zoom: 5
    });

    // Add navigation controls
    map.addControl(new maplibregl.NavigationControl(), 'top-right');
    map.addControl(new maplibregl.ScaleControl(), 'bottom-left');
    map.addControl(new maplibregl.FullscreenControl(), 'top-right');

    // Wait for map to load before adding vector layers
    map.on('load', () => {
        addVectorLayers();
        setupMapInteractions();
    });
}

// Add vector tile layers
function addVectorLayers() {
    // Polygon layer
    map.addLayer({
        id: 'polygons',
        type: 'fill',
        source: 'gis-tiles',
        'source-layer': 'polygons',
        paint: {
            'fill-color': [
                'match',
                ['get', 'category'],
                'urban', '#ef4444',
                'forest', '#10b981',
                'water', '#3b82f6',
                'agriculture', '#f59e0b',
                '#94a3b8'  // default
            ],
            'fill-opacity': 0.6,
            'fill-outline-color': '#000000'
        }
    });

    // Polygon outline
    map.addLayer({
        id: 'polygons-outline',
        type: 'line',
        source: 'gis-tiles',
        'source-layer': 'polygons',
        paint: {
            'line-color': '#000000',
            'line-width': 1
        }
    });

    // Line layer
    map.addLayer({
        id: 'lines',
        type: 'line',
        source: 'gis-tiles',
        'source-layer': 'lines',
        paint: {
            'line-color': [
                'match',
                ['get', 'category'],
                'highway', '#ef4444',
                'river', '#3b82f6',
                'railway', '#8b5cf6',
                '#475569'  // default
            ],
            'line-width': [
                'interpolate',
                ['linear'],
                ['zoom'],
                8, 1,
                16, 4
            ]
        }
    });

    // Point layer
    map.addLayer({
        id: 'points',
        type: 'circle',
        source: 'gis-tiles',
        'source-layer': 'points',
        paint: {
            'circle-radius': [
                'interpolate',
                ['linear'],
                ['zoom'],
                8, 3,
                16, 8
            ],
            'circle-color': [
                'match',
                ['get', 'category'],
                'city', '#ef4444',
                'facility', '#10b981',
                'landmark', '#f59e0b',
                '#6366f1'  // default
            ],
            'circle-stroke-width': 1,
            'circle-stroke-color': '#ffffff'
        }
    });
}

// Setup map interactions
function setupMapInteractions() {
    // Change cursor on hover
    ['polygons', 'lines', 'points'].forEach(layer => {
        map.on('mouseenter', layer, () => {
            map.getCanvas().style.cursor = 'pointer';
        });

        map.on('mouseleave', layer, () => {
            map.getCanvas().style.cursor = '';
        });

        // Click handler
        map.on('click', layer, (e) => {
            if (e.features.length > 0) {
                showFeaturePopup(e.features[0], e.lngLat);
            }
        });
    });
}

// Show feature popup
function showFeaturePopup(feature, lngLat) {
    const properties = feature.properties;
    
    let htmlContent = '<table class="feature-info-table">';
    htmlContent += `<tr><td>ID:</td><td>${properties.id || 'N/A'}</td></tr>`;
    htmlContent += `<tr><td>Name:</td><td>${properties.name || 'N/A'}</td></tr>`;
    htmlContent += `<tr><td>Category:</td><td>${properties.category || 'N/A'}</td></tr>`;
    htmlContent += `<tr><td>Type:</td><td>${properties.geom_type || 'N/A'}</td></tr>`;
    htmlContent += '</table>';

    new maplibregl.Popup()
        .setLngLat(lngLat)
        .setHTML(htmlContent)
        .addTo(map);
}

// Initialize basemap selector
function initBasemapSelector() {
    const toggle = document.getElementById('basemap-toggle');
    const options = document.getElementById('basemap-options');
    const basemapOptions = document.querySelectorAll('.basemap-option');
    
    // Toggle basemap options visibility
    toggle.addEventListener('click', () => {
        options.classList.toggle('show');
        toggle.textContent = options.classList.contains('show') ? '▲' : '▼';
    });
    
    // Handle basemap selection
    basemapOptions.forEach(option => {
        option.addEventListener('click', () => {
            const selectedBasemap = option.getAttribute('data-basemap');
            if (selectedBasemap !== currentBasemap) {
                switchBasemap(selectedBasemap);
                
                // Update active state
                basemapOptions.forEach(opt => opt.classList.remove('active'));
                option.classList.add('active');
                
                // Close dropdown
                options.classList.remove('show');
                toggle.textContent = '▼';
            }
        });
    });
}

// Switch basemap
function switchBasemap(basemapId) {
    const basemapConfig = basemaps[basemapId];
    if (!basemapConfig || !map) return;
    
    currentBasemap = basemapId;
    
    // Update basemap source
    if (map.getSource('basemap')) {
        map.removeLayer('basemap');
        map.removeSource('basemap');
    }
    
    // Add new basemap
    map.addSource('basemap', {
        type: basemapConfig.type,
        tiles: basemapConfig.tiles,
        tileSize: 256,
        attribution: basemapConfig.attribution
    });
    
    // Add basemap layer (before vector layers)
    const firstVectorLayer = map.getLayer('polygons') ? 'polygons' : undefined;
    map.addLayer({
        id: 'basemap',
        type: 'raster',
        source: 'basemap'
    }, firstVectorLayer);
}

// Initialize event listeners
function initEventListeners() {
    // Filter buttons
    document.getElementById('apply-filters-btn').addEventListener('click', applyFilters);
    document.getElementById('reset-filters-btn').addEventListener('click', resetFilters);

    // Geometry type checkboxes
    document.getElementById('show-points').addEventListener('change', toggleGeometryLayer);
    document.getElementById('show-lines').addEventListener('change', toggleGeometryLayer);
    document.getElementById('show-polygons').addEventListener('change', toggleGeometryLayer);

    // Search
    const searchInput = document.getElementById('search-input');
    let searchTimeout;
    searchInput.addEventListener('input', (e) => {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => performSearch(e.target.value), 500);
    });

    // Export buttons
    document.getElementById('export-geojson-btn').addEventListener('click', () => exportData('geojson'));
    document.getElementById('export-shapefile-btn').addEventListener('click', () => exportData('shapefile'));
    document.getElementById('export-csv-btn').addEventListener('click', () => exportData('csv'));
}

// Toggle geometry layer visibility
function toggleGeometryLayer() {
    const showPoints = document.getElementById('show-points').checked;
    const showLines = document.getElementById('show-lines').checked;
    const showPolygons = document.getElementById('show-polygons').checked;

    map.setLayoutProperty('points', 'visibility', showPoints ? 'visible' : 'none');
    map.setLayoutProperty('lines', 'visibility', showLines ? 'visible' : 'none');
    map.setLayoutProperty('polygons', 'visibility', showPolygons ? 'visible' : 'none');
    map.setLayoutProperty('polygons-outline', 'visibility', showPolygons ? 'visible' : 'none');
}

// Apply filters (currently just updates the state)
function applyFilters() {
    currentFilters.category = document.getElementById('category-filter').value || null;
    
    // For client-side filtering, you would need to reload the tile source with query params
    // Or use filter expressions in MapLibre
    alert('Filters applied. Note: Full server-side filtering requires tile source reloading.');
}

// Reset filters
function resetFilters() {
    document.getElementById('category-filter').value = '';
    document.getElementById('show-points').checked = true;
    document.getElementById('show-lines').checked = true;
    document.getElementById('show-polygons').checked = true;
    
    currentFilters = {
        category: null,
        showPoints: true,
        showLines: true,
        showPolygons: true
    };

    toggleGeometryLayer();
}

// Load categories for filter dropdown
async function loadCategories() {
    if (!authManager.isAuthenticated()) return;

    try {
        const response = await authManager.fetchWithAuth('/api/features/stats');
        const stats = await response.json();

        const categorySelect = document.getElementById('category-filter');
        categorySelect.innerHTML = '<option value="">All Categories</option>';

        Object.keys(stats.by_category).forEach(category => {
            const option = document.createElement('option');
            option.value = category;
            option.textContent = `${category} (${stats.by_category[category]})`;
            categorySelect.appendChild(option);
        });

    } catch (error) {
        console.error('Failed to load categories:', error);
    }
}

// Load statistics
async function loadStats() {
    if (!authManager.isAuthenticated()) {
        document.getElementById('stats-display').innerHTML = '<p>Login to view statistics</p>';
        return;
    }

    try {
        const response = await authManager.fetchWithAuth('/api/features/stats');
        const stats = await response.json();

        let html = `<p><strong>Total Features:</strong> ${stats.total_features.toLocaleString()}</p>`;
        
        html += '<p><strong>By Type:</strong></p><ul style="margin-left: 20px; font-size: 13px;">';
        Object.entries(stats.by_geometry_type).forEach(([type, count]) => {
            html += `<li>${type}: ${count.toLocaleString()}</li>`;
        });
        html += '</ul>';

        if (stats.bbox) {
            // Zoom to data extent
            map.fitBounds([
                [stats.bbox[0], stats.bbox[1]],
                [stats.bbox[2], stats.bbox[3]]
            ], { padding: 50 });
        }

        document.getElementById('stats-display').innerHTML = html;

    } catch (error) {
        console.error('Failed to load stats:', error);
        document.getElementById('stats-display').innerHTML = '<p>Failed to load statistics</p>';
    }
}

// Perform search
async function performSearch(query) {
    const resultsDiv = document.getElementById('search-results');
    
    if (!query || query.length < 2) {
        resultsDiv.innerHTML = '';
        return;
    }

    if (!authManager.isAuthenticated()) {
        resultsDiv.innerHTML = '<div style="padding: 10px;">Login to search</div>';
        return;
    }

    try {
        const response = await authManager.fetchWithAuth(`/api/features/search?q=${encodeURIComponent(query)}&limit=10`);
        const data = await response.json();

        if (data.features.length === 0) {
            resultsDiv.innerHTML = '<div style="padding: 10px;">No results found</div>';
            return;
        }

        resultsDiv.innerHTML = data.features.map(feature => `
            <div class="search-result-item" data-feature='${JSON.stringify(feature)}'>
                <strong>${feature.properties.name || 'Unnamed'}</strong><br>
                <small>${feature.properties.category || 'No category'} - ${feature.properties.geom_type || 'Unknown type'}</small>
            </div>
        `).join('');

        // Add click handlers
        resultsDiv.querySelectorAll('.search-result-item').forEach(item => {
            item.addEventListener('click', () => {
                const feature = JSON.parse(item.dataset.feature);
                zoomToFeature(feature);
            });
        });

    } catch (error) {
        console.error('Search failed:', error);
        resultsDiv.innerHTML = '<div style="padding: 10px; color: red;">Search failed</div>';
    }
}

// Zoom to feature
function zoomToFeature(feature) {
    const coords = feature.geometry.coordinates;
    
    if (feature.geometry.type === 'Point') {
        map.flyTo({ center: coords, zoom: 14 });
    } else if (feature.geometry.type === 'LineString') {
        const bounds = coords.reduce((bounds, coord) => bounds.extend(coord), new maplibregl.LngLatBounds(coords[0], coords[0]));
        map.fitBounds(bounds, { padding: 50 });
    } else if (feature.geometry.type === 'Polygon') {
        const bounds = coords[0].reduce((bounds, coord) => bounds.extend(coord), new maplibregl.LngLatBounds(coords[0][0], coords[0][0]));
        map.fitBounds(bounds, { padding: 50 });
    }

    // Show popup
    const center = map.getCenter();
    showFeaturePopup(feature, center);
}

// Export data
async function exportData(format) {
    if (!authManager.isAuthenticated()) {
        alert('Please login to export data');
        return;
    }

    const bounds = map.getBounds();
    const bbox = `${bounds.getWest()},${bounds.getSouth()},${bounds.getEast()},${bounds.getNorth()}`;
    
    const category = currentFilters.category;
    
    let url = `/api/export/${format}?bbox=${bbox}`;
    if (category) {
        url += `&category=${encodeURIComponent(category)}`;
    }

    try {
        showLoading(true);
        
        const response = await authManager.fetchWithAuth(url);
        
        if (!response.ok) {
            throw new Error('Export failed');
        }

        const blob = await response.blob();
        const downloadUrl = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = downloadUrl;
        a.download = `export.${format === 'shapefile' ? 'zip' : format === 'geojson' ? 'geojson' : 'csv'}`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(downloadUrl);
        a.remove();

        showLoading(false);

    } catch (error) {
        console.error('Export failed:', error);
        alert('Export failed: ' + error.message);
        showLoading(false);
    }
}

// Show/hide loading indicator
function showLoading(show) {
    const loading = document.getElementById('loading');
    loading.style.display = show ? 'block' : 'none';
}

// Handle authentication changes
function handleAuthChange(event) {
    if (event.detail.authenticated) {
        loadStats();
        loadCategories();
    } else {
        document.getElementById('stats-display').innerHTML = '<p>Login to view statistics</p>';
        document.getElementById('category-filter').innerHTML = '<option value="">All Categories</option>';
        document.getElementById('search-results').innerHTML = '';
    }
}

// Initialize app when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
} else {
    initApp();
}
