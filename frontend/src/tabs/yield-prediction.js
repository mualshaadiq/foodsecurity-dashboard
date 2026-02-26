import { getYieldPredictions } from '@/api/food-security.js';
import { sfYieldProvince } from '@/components/select-fields.js';

/**
 * Yield Prediction tab — province selector + choropleth layer.
 * Wires up the #panel-yield-prediction sidebar panel.
 * @param {maplibregl.Map} map
 */
export function initYieldPredictionTab(map) {
    _bindVisibilityToggle(map, 'toggle-yield-zones', 'yield-zones');
    _bindVisibilityToggle(map, 'toggle-yield-zones', 'yield-zones-outline');

    const statsContainer = document.getElementById('yield-stats-container');

    sfYieldProvince.setOnChange(async (vals) => {
        if (!statsContainer) return;
        try {
            const data = await getYieldPredictions(vals[0] || '');
            _renderYieldStats(statsContainer, data);
        } catch (err) {
            statsContainer.innerHTML = `<p class="text-danger">Failed to load predictions.</p>`;
        }
    });
}

function _renderYieldStats(container, data) {
    if (!data || !data.length) {
        container.innerHTML = '<p>No prediction data available.</p>';
        return;
    }

    const rows = data
        .map((d) => `
            <tr>
                <td>${d.farm_name ?? d.feature_id}</td>
                <td>${Number(d.predicted_yield_ton_ha).toFixed(2)} t/ha</td>
                <td>${Math.round(d.confidence * 100)}%</td>
            </tr>
        `)
        .join('');

    container.innerHTML = `
        <table class="data-table">
            <thead><tr><th>Farm</th><th>Predicted Yield</th><th>Confidence</th></tr></thead>
            <tbody>${rows}</tbody>
        </table>
    `;
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
