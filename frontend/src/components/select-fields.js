/**
 * select-fields.js
 *
 * Creates and mounts all SelectField instances used across the sidebar.
 * Call mountSelectFields() once after the DOM is ready (from main.js boot).
 * Import the named instances in tab/component files to wire up onChange handlers.
 */
import { createSelectField } from '@/components/select-field.js';
import { getAOIs } from '@/api/food-security.js';

// ── AOI selector — Disaster Risk tab ─────────────────────────────────────
export const sfDisasterAoi = createSelectField({
    id:          'sf-disaster-province',
    label:       'Area of Interest',
    placeholder: '— all AOIs —',
    mode:        'single',
    hasSearch:   true,
});

// ── AOI selector — Yield Prediction tab ──────────────────────────────────
export const sfYieldAoi = createSelectField({
    id:          'sf-yield-province',
    label:       'Area of Interest',
    placeholder: 'All AOIs',
    mode:        'single',
    hasSearch:   true,
});

// ── AOI filter — Summary Dashboard tab ───────────────────────────────────
export const sfSummaryAoi = createSelectField({
    id:          'sf-summary-province',
    label:       'Area of Interest',
    placeholder: 'All AOIs',
    mode:        'single',
    hasSearch:   true,
});

// ── Category filter — Base Map tab ────────────────────────────────────────
export const sfCategoryFilter = createSelectField({
    id:          'sf-category-filter',
    label:       'Category',
    placeholder: 'All Categories',
    mode:        'single',
    hasSearch:   false,
});

/**
 * Attach all SelectField elements to their mount points in the DOM.
 * Must be called after DOMContentLoaded.
 */
export function mountSelectFields() {
    const mounts = [
        ['disaster-province-select-mount', sfDisasterAoi],
        ['yield-province-select-mount',    sfYieldAoi],
        ['summary-province-filter-mount',  sfSummaryAoi],
        ['category-filter-mount',          sfCategoryFilter],
    ];

    for (const [id, sf] of mounts) {
        const el = document.getElementById(id);
        if (el) el.appendChild(sf.el);
    }
}

/**
 * Populate all three AOI selectors with options derived from the AOI list.
 * @param {Array} aois  — array of GeoJSON Feature objects from getAOIs()
 */
export function populateAoiSelectors(aois) {
    const options = (aois || []).map((aoi) => ({
        value: String(aoi.id),
        label: aoi.properties?.name ?? `AOI ${aoi.id}`,
    }));
    sfDisasterAoi.setOptions(options);
    sfYieldAoi.setOptions(options);
    sfSummaryAoi.setOptions(options);
}

/**
 * Fetch AOIs from the API and populate all AOI selectors.
 * Call this once after authentication and again whenever AOIs change.
 */
export async function initAoiSelectors() {
    try {
        const aois = await getAOIs();
        populateAoiSelectors(aois);
    } catch (err) {
        console.warn('[select-fields] Could not load AOIs for selectors:', err);
    }
}
