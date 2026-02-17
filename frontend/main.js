// Main entry point for Vite
import 'maplibre-gl/dist/maplibre-gl.css';
import maplibregl from 'maplibre-gl';

// Make maplibregl available globally
window.maplibregl = maplibregl;

// Import application modules
import './auth.js';
import './app.js';

// Hot Module Replacement (HMR) for Vite
if (import.meta.hot) {
    import.meta.hot.accept();
}
