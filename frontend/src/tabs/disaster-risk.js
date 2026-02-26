import { getWeather } from '@/api/food-security.js';
import { renderWeatherCard } from '@/components/weather-card.js';
import { sfDisasterProvince } from '@/components/select-fields.js';

/**
 * Disaster Risk Management tab — Flood risk, drought, weather panel.
 * Wires up the #panel-disaster-risk sidebar panel.
 * @param {maplibregl.Map} map
 */
export function initDisasterRiskTab(map) {
    _bindVisibilityToggle(map, 'toggle-flood-risk',   'flood-risk');
    _bindVisibilityToggle(map, 'toggle-drought',      'drought-zones');

    sfDisasterProvince.setOnChange((vals) => loadWeather(vals[0] || ''));
    if (sfDisasterProvince.getValue().length) loadWeather(sfDisasterProvince.getValue()[0]);
}

async function loadWeather(provinceCode) {
    const container = document.getElementById('weather-card-container');
    if (!container || !provinceCode) return;

    try {
        const data = await getWeather(provinceCode);
        renderWeatherCard(container, data);
    } catch (err) {
        container.innerHTML = `<p class="text-danger">Failed to load weather data.</p>`;
    }
}

function _bindVisibilityToggle(map, checkboxId, layerId) {
    const el = document.getElementById(checkboxId);
    if (!el) return;
    el.addEventListener('change', () => {
        if (map.getLayer(layerId)) {
            map.setLayoutProperty(layerId, 'visibility', el.checked ? 'visible' : 'none');
        }
    });
}
