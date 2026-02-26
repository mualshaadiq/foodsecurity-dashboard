import { sfCategoryFilter } from '@/components/select-fields.js';

/**
 * Generic sidebar helpers — show/hide panels and manage export buttons.
 * @param {maplibregl.Map} map
 * @param {{ category: string|null }} filters - mutable filters object from main.js
 * @param {Function} exportDataFn - from @/api/export.js
 */
export function initSidebarControls(map, filters, exportDataFn) {
    // Geometry type visibility checkboxes
    const checkboxes = {
        points:   document.getElementById('show-points'),
        lines:    document.getElementById('show-lines'),
        polygons: document.getElementById('show-polygons'),
    };

    Object.entries(checkboxes).forEach(([type, el]) => {
        if (!el) return;
        el.addEventListener('change', () => {
            const vis = el.checked ? 'visible' : 'none';
            if (type === 'polygons') {
                map.setLayoutProperty('polygons',         'visibility', vis);
                map.setLayoutProperty('polygons-outline', 'visibility', vis);
            } else {
                map.setLayoutProperty(type, 'visibility', vis);
            }
        });
    });

    // Apply / Reset filter buttons
    const applyBtn = document.getElementById('apply-filters-btn');
    const resetBtn = document.getElementById('reset-filters-btn');

    if (applyBtn) {
        applyBtn.addEventListener('click', () => {
            filters.category = sfCategoryFilter.getValue()[0] || null;
        });
    }

    if (resetBtn) {
        resetBtn.addEventListener('click', () => {
            filters.category = null;
            sfCategoryFilter.setValue([]);
            Object.values(checkboxes).forEach((el) => { if (el) el.checked = true; });
            ['polygons', 'polygons-outline', 'lines', 'points'].forEach((id) =>
                map.setLayoutProperty(id, 'visibility', 'visible')
            );
        });
    }

    // Export buttons
    ['geojson', 'shapefile', 'csv'].forEach((format) => {
        const btn = document.getElementById(`export-${format}-btn`);
        if (!btn) return;
        btn.addEventListener('click', async () => {
            try {
                showLoading(true);
                const bounds = map.getBounds();
                const bbox = `${bounds.getWest()},${bounds.getSouth()},${bounds.getEast()},${bounds.getNorth()}`;
                await exportDataFn(format, bbox, filters.category);
            } catch (err) {
                alert('Export failed: ' + err.message);
            } finally {
                showLoading(false);
            }
        });
    });
}

export function showLoading(show) {
    const el = document.getElementById('loading');
    if (el) el.style.display = show ? 'block' : 'none';
}
