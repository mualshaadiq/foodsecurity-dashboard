import { authManager } from '@/auth/auth-manager.js';

const BASE = '/api/food-security';

/** GET /api/food-security/asset-stats */
export async function getAssetStats() {
    const res = await authManager.fetchWithAuth(`${BASE}/asset-stats`);
    if (!res.ok) throw new Error('Failed to fetch asset stats');
    return res.json();
}

/**
 * GET /api/food-security/ndvi
 * @param {number} farmId
 * @param {string} start - ISO date string
 * @param {string} end   - ISO date string
 */
export async function getNDVI(farmId, start, end) {
    const res = await authManager.fetchWithAuth(
        `${BASE}/ndvi?farm_id=${farmId}&start=${start}&end=${end}`
    );
    if (!res.ok) throw new Error('Failed to fetch NDVI data');
    return res.json();
}

/** GET /api/food-security/weather?province_code=XX */
export async function getWeather(provinceCode) {
    const res = await authManager.fetchWithAuth(
        `${BASE}/weather?province_code=${encodeURIComponent(provinceCode)}`
    );
    if (!res.ok) throw new Error('Failed to fetch weather data');
    return res.json();
}

/** GET /api/food-security/yield-prediction?province_code=XX */
export async function getYieldPredictions(provinceCode) {
    const res = await authManager.fetchWithAuth(
        `${BASE}/yield-prediction?province_code=${encodeURIComponent(provinceCode)}`
    );
    if (!res.ok) throw new Error('Failed to fetch yield predictions');
    return res.json();
}

/**
 * GET /api/food-security/monthly-report
 * @param {number} month - 1–12
 * @param {number} year
 */
export async function getMonthlyReport(month, year) {
    const res = await authManager.fetchWithAuth(
        `${BASE}/monthly-report?month=${month}&year=${year}`
    );
    if (!res.ok) throw new Error('Failed to fetch monthly report');
    return res.json();
}

/** GET /api/food-security/crop-stats */
export async function getCropStats() {
    const res = await authManager.fetchWithAuth(`${BASE}/crop-stats`);
    if (!res.ok) throw new Error('Failed to fetch crop stats');
    return res.json();
}

/** GET /api/food-security/aoi */
export async function getAOIs() {
    const res = await authManager.fetchWithAuth(`${BASE}/aoi`);
    if (!res.ok) throw new Error('Failed to fetch AOIs');
    return res.json();
}

/**
 * POST /api/food-security/aoi
 * @param {object} geojsonFeature - GeoJSON Polygon feature
 */
export async function createAOI(geojsonFeature) {
    const res = await authManager.fetchWithAuth(`${BASE}/aoi`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(geojsonFeature),
    });
    if (!res.ok) throw new Error('Failed to create AOI');
    return res.json();
}

/**
 * DELETE /api/food-security/aoi/:id
 * @param {number} id
 */
export async function deleteAOI(id) {
    const res = await authManager.fetchWithAuth(`${BASE}/aoi/${id}`, {
        method: 'DELETE',
    });
    if (!res.ok) throw new Error('Failed to delete AOI');
}
