/**
 * Render a weather info card into a container element.
 * @param {HTMLElement} container
 * @param {object} data - response from GET /api/food-security/weather
 *   Expected shape: { province_name, current: { temperature, humidity, rainfall, wind_speed }, forecast: [] }
 */
export function renderWeatherCard(container, data) {
    if (!data) {
        container.innerHTML = '<p>No weather data available.</p>';
        return;
    }

    const { current = {} } = data;

    container.innerHTML = `
        <div class="weather-card">
            <div class="weather-header">${data.province_name ?? ''}</div>
            <div class="weather-grid">
                <div class="weather-metric">
                    <span class="weather-icon">🌡️</span>
                    <span class="weather-value">${current.temperature ?? '—'}°C</span>
                    <span class="weather-label">Temperature</span>
                </div>
                <div class="weather-metric">
                    <span class="weather-icon">💧</span>
                    <span class="weather-value">${current.humidity ?? '—'}%</span>
                    <span class="weather-label">Humidity</span>
                </div>
                <div class="weather-metric">
                    <span class="weather-icon">🌧️</span>
                    <span class="weather-value">${current.rainfall ?? '—'} mm</span>
                    <span class="weather-label">Rainfall</span>
                </div>
                <div class="weather-metric">
                    <span class="weather-icon">🌬️</span>
                    <span class="weather-value">${current.wind_speed ?? '—'} km/h</span>
                    <span class="weather-label">Wind Speed</span>
                </div>
            </div>
        </div>
    `;
}
