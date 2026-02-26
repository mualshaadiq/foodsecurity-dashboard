import { authManager } from '@/auth/auth-manager.js';
import { searchFeatures } from '@/api/features.js';
import { zoomToFeature } from '@/map/interactions.js';

/**
 * Initialize the search input + results list.
 * @param {maplibregl.Map} map
 */
export function initSearch(map) {
    const input   = document.getElementById('search-input');
    const results = document.getElementById('search-results');
    if (!input || !results) return;

    let debounceTimer;

    input.addEventListener('input', (e) => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => performSearch(map, e.target.value, results), 500);
    });
}

async function performSearch(map, query, resultsDiv) {
    if (!query || query.length < 2) {
        resultsDiv.innerHTML = '';
        return;
    }

    if (!authManager.isAuthenticated()) {
        resultsDiv.innerHTML = '<div class="search-result-item">Login to search</div>';
        return;
    }

    try {
        const data = await searchFeatures(query);

        if (!data.features.length) {
            resultsDiv.innerHTML = '<div class="search-result-item">No results found</div>';
            return;
        }

        resultsDiv.innerHTML = data.features
            .map(
                (f) => `
                <div class="search-result-item" data-feature='${JSON.stringify(f)}'>
                    <strong>${f.properties.name || 'Unnamed'}</strong><br>
                    <small>${f.properties.category || 'No category'} — ${f.properties.geom_type || ''}</small>
                </div>`
            )
            .join('');

        resultsDiv.querySelectorAll('.search-result-item').forEach((item) => {
            item.addEventListener('click', () => {
                const feature = JSON.parse(item.dataset.feature);
                zoomToFeature(map, feature);
            });
        });
    } catch (err) {
        console.error('Search failed:', err);
        resultsDiv.innerHTML = '<div class="search-result-item" style="color:red;">Search failed</div>';
    }
}
