/**
 * select-fields.js
 *
 * Creates and mounts all SelectField instances used across the sidebar.
 * Call mountSelectFields() once after the DOM is ready (from main.js boot).
 * Import the named instances in tab/component files to wire up onChange handlers.
 */
import { createSelectField } from '@/components/select-field.js';

// ── Province selector — Disaster Risk tab ─────────────────────────────────
export const sfDisasterProvince = createSelectField({
    id:          'sf-disaster-province',
    label:       'Province',
    placeholder: '— select —',
    mode:        'single',
    hasSearch:   true,
});

// ── Province selector — Yield Prediction tab ──────────────────────────────
export const sfYieldProvince = createSelectField({
    id:          'sf-yield-province',
    label:       'Province',
    placeholder: 'All Provinces',
    mode:        'single',
    hasSearch:   true,
});

// ── Province filter — Summary Dashboard tab ───────────────────────────────
export const sfSummaryProvince = createSelectField({
    id:          'sf-summary-province',
    label:       'Province',
    placeholder: 'All Provinces',
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
        ['disaster-province-select-mount', sfDisasterProvince],
        ['yield-province-select-mount',    sfYieldProvince],
        ['summary-province-filter-mount',  sfSummaryProvince],
        ['category-filter-mount',          sfCategoryFilter],
    ];

    for (const [id, sf] of mounts) {
        const el = document.getElementById(id);
        if (el) el.appendChild(sf.el);
    }
}
