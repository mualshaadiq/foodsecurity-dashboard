import Chart from 'chart.js/auto';
import { getAssetStats, getCropStats, getMonthlyReport } from '@/api/food-security.js';
import { sfSummaryProvince } from '@/components/select-fields.js';

let farmAreaChart = null;
let paddyAreaChart = null;
let cropTypeChart  = null;

/**
 * Summary Dashboard tab — charts + monthly report table.
 * Wires up the #panel-summary sidebar panel.
 */
export async function initSummaryTab() {
    await Promise.all([
        loadAssetCharts(),
        loadCropTypeChart(),
        loadMonthlyReport(),
    ]);

    sfSummaryProvince.setOnChange(async (vals) => {
        const province = vals[0] || null;
        await Promise.all([
            loadAssetCharts(province),
            loadMonthlyReport(null, null, province),
        ]);
    });
}

async function loadAssetCharts(province = null) {
    try {
        const data = await getAssetStats();
        const items = province
            ? data.filter((d) => d.province_code === province)
            : data;

        const labels  = items.map((d) => d.province_name ?? d.province_code);
        const farmHa  = items.map((d) => d.farm_area_ha);
        const paddyHa = items.map((d) => d.paddy_area_ha);

        _renderBarChart('chart-farm-area',  farmAreaChart,  labels, farmHa,  'Farm Area (ha)',  '#4ade80');
        _renderBarChart('chart-paddy-area', paddyAreaChart, labels, paddyHa, 'Paddy Area (ha)', '#60a5fa');
    } catch (err) {
        console.error('Failed to load asset charts:', err);
    }
}

async function loadCropTypeChart() {
    try {
        const data = await getCropStats();
        const labels = data.map((d) => d.crop_type);
        const counts = data.map((d) => d.count);

        const ctx = document.getElementById('chart-crop-type');
        if (!ctx) return;

        if (cropTypeChart) cropTypeChart.destroy();
        cropTypeChart = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels,
                datasets: [{ data: counts, backgroundColor: ['#4ade80','#60a5fa','#f472b6','#facc15','#fb923c','#a78bfa'] }],
            },
            options: { plugins: { legend: { position: 'bottom' } } },
        });
    } catch (err) {
        console.error('Failed to load crop type chart:', err);
    }
}

async function loadMonthlyReport(month = null, year = null, province = null) {
    const now   = new Date();
    const m     = month ?? now.getMonth() + 1;
    const y     = year  ?? now.getFullYear();
    const tbody = document.querySelector('#monthly-report-table tbody');
    if (!tbody) return;

    try {
        const data = await getMonthlyReport(m, y);
        const rows = province ? data.filter((d) => d.province_code === province) : data;

        tbody.innerHTML = rows.map((r) => `
            <tr>
                <td>${r.province_code}</td>
                <td>${Number(r.farm_area_ha).toLocaleString()}</td>
                <td>${Number(r.paddy_area_ha).toLocaleString()}</td>
                <td>${Number(r.predicted_yield).toFixed(2)}</td>
                <td>${Number(r.fertilizer_used_ton).toLocaleString()}</td>
            </tr>
        `).join('') || '<tr><td colspan="5">No data for this period.</td></tr>';
    } catch (err) {
        tbody.innerHTML = '<tr><td colspan="5">Failed to load report.</td></tr>';
    }
}

function _renderBarChart(canvasId, chartRef, labels, data, label, color) {
    const ctx = document.getElementById(canvasId);
    if (!ctx) return;
    if (chartRef) chartRef.destroy();

    return new Chart(ctx, {
        type: 'bar',
        data: {
            labels,
            datasets: [{ label, data, backgroundColor: color }],
        },
        options: {
            responsive: true,
            plugins: { legend: { display: false } },
            scales: { y: { beginAtZero: true } },
        },
    });
}
