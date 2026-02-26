/**
 * SelectField — Aetosky Design System (node 6630:2700)
 *
 * Creates a labelled select trigger + custom dropdown panel.
 * Supports single-select (radio) and multi-select (checkbox) modes,
 * with an optional search bar and scrollable list.
 *
 * Usage:
 *   const sf = createSelectField({
 *     label:       'Province',
 *     placeholder: 'Select…',
 *     mode:        'single' | 'multi',    // default: 'single'
 *     options:     [{ value, label }],
 *     onChange:    (selected) => {},       // array of selected values
 *     hasSearch:   true,                  // default: true
 *     mandatory:   true,                  // shows red *
 *   });
 *   container.appendChild(sf.el);
 *
 *   // Programmatic update
 *   sf.setOptions([{ value, label }]);
 *   sf.setValue(['val1']);
 *   sf.getValue();   // → ['val1']
 *   sf.getLabel();   // → 'Province'
 *   sf.destroy();
 */

/**
 * @typedef {{ value: string, label: string }} SelectOption
 * @typedef {{ value: string | string[], label?: string }} SelectValue
 */

/**
 * @param {object} config
 * @param {string} config.label
 * @param {string} [config.placeholder]
 * @param {'single'|'multi'} [config.mode]
 * @param {SelectOption[]} [config.options]
 * @param {(selected: string[]) => void} [config.onChange]
 * @param {boolean} [config.hasSearch]
 * @param {boolean} [config.mandatory]
 * @param {string}  [config.id]           unique id prefix for a11y
 * @returns {{ el: HTMLElement, setOptions, setValue, getValue, getLabel, destroy }}
 */
export function createSelectField({
    label = 'Label',
    placeholder = 'Select…',
    mode = 'single',
    options = [],
    onChange = null,
    hasSearch = true,
    mandatory = false,
    id = `sf-${Math.random().toString(36).slice(2, 8)}`,
} = {}) {

    // ── State ───────────────────────────────────────────────────────────
    let _options  = [...options];
    let _selected = [];   // array of values
    let _open     = false;
    let _onChange = onChange ?? null;

    // ── Root element ────────────────────────────────────────────────────
    const root = document.createElement('div');
    root.className = 'sf-root';
    root.dataset.sfId = id;

    // ── Label row ───────────────────────────────────────────────────────
    const labelRow = document.createElement('div');
    labelRow.className = 'sf-label-row';

    const labelEl = document.createElement('label');
    labelEl.className = 'sf-label';
    labelEl.htmlFor = `${id}-trigger`;
    labelEl.textContent = label;

    labelRow.appendChild(labelEl);

    if (mandatory) {
        const star = document.createElement('span');
        star.className = 'sf-mandatory';
        star.textContent = '*';
        star.setAttribute('aria-hidden', 'true');
        labelRow.appendChild(star);
    }

    root.appendChild(labelRow);

    // ── Trigger (the visible "select box") ──────────────────────────────
    const trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'sf-trigger';
    trigger.id = `${id}-trigger`;
    trigger.setAttribute('aria-haspopup', 'listbox');
    trigger.setAttribute('aria-expanded', 'false');
    trigger.setAttribute('aria-controls', `${id}-dropdown`);

    const triggerText = document.createElement('span');
    triggerText.className = 'sf-trigger-text sf-placeholder';
    triggerText.textContent = placeholder;

    const chevron = document.createElement('span');
    chevron.className = 'sf-chevron';
    chevron.setAttribute('aria-hidden', 'true');
    chevron.innerHTML = `<svg width="12" height="8" viewBox="0 0 12 8" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M1 1.5L6 6.5L11 1.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>`;

    trigger.appendChild(triggerText);
    trigger.appendChild(chevron);
    root.appendChild(trigger);

    // ── Dropdown panel ───────────────────────────────────────────────────
    const dropdown = document.createElement('div');
    dropdown.className = 'sf-dropdown';
    dropdown.id = `${id}-dropdown`;
    dropdown.setAttribute('role', 'listbox');
    dropdown.setAttribute('aria-multiselectable', mode === 'multi' ? 'true' : 'false');
    // Search bar
    let searchInput = null;
    if (hasSearch) {
        const searchRow = document.createElement('div');
        searchRow.className = 'sf-search-row';

        const searchIcon = document.createElement('span');
        searchIcon.className = 'sf-search-icon';
        searchIcon.setAttribute('aria-hidden', 'true');
        searchIcon.innerHTML = `<svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
          <circle cx="6" cy="6" r="4.5" stroke="currentColor" stroke-width="1.3"/>
          <path d="M9.5 9.5L12.5 12.5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
        </svg>`;

        searchInput = document.createElement('input');
        searchInput.type = 'search';
        searchInput.className = 'sf-search-input';
        searchInput.placeholder = 'Search';
        searchInput.setAttribute('aria-label', `Search ${label}`);
        searchInput.autocomplete = 'off';

        searchRow.appendChild(searchIcon);
        searchRow.appendChild(searchInput);
        dropdown.appendChild(searchRow);
    }

    // Options list
    const listEl = document.createElement('div');
    listEl.className = 'sf-list';
    dropdown.appendChild(listEl);

    // Scrollbar thumb indicator (Figma "dropdown/Variant3")
    const scrollTrack = document.createElement('div');
    scrollTrack.className = 'sf-scroll-track';
    const scrollThumb = document.createElement('div');
    scrollThumb.className = 'sf-scroll-thumb';
    scrollTrack.appendChild(scrollThumb);
    dropdown.appendChild(scrollTrack);

    root.appendChild(dropdown);

    // ── Render helpers ───────────────────────────────────────────────────
    function renderOptions(filter = '') {
        listEl.innerHTML = '';
        const query = filter.toLowerCase();
        const visible = _options.filter(
            (o) => !query || o.label.toLowerCase().includes(query),
        );

        if (!visible.length) {
            const empty = document.createElement('div');
            empty.className = 'sf-list-empty';
            empty.textContent = 'No options found';
            listEl.appendChild(empty);
            return;
        }

        visible.forEach((opt) => {
            const isChecked = _selected.includes(opt.value);

            const row = document.createElement('div');
            row.className = 'sf-option' + (isChecked ? ' sf-option--selected' : '');
            row.setAttribute('role', 'option');
            row.setAttribute('aria-selected', isChecked ? 'true' : 'false');
            row.dataset.value = opt.value;

            if (mode === 'multi') {
                // Square checkbox
                const box = document.createElement('span');
                box.className = 'sf-checkbox' + (isChecked ? ' sf-checkbox--checked' : '');
                box.setAttribute('aria-hidden', 'true');
                if (isChecked) {
                    box.innerHTML = `<svg width="10" height="8" viewBox="0 0 10 8" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M1 4L3.5 6.5L9 1.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                    </svg>`;
                }
                row.appendChild(box);
            } else {
                // Circle radio
                const radio = document.createElement('span');
                radio.className = 'sf-radio' + (isChecked ? ' sf-radio--checked' : '');
                radio.setAttribute('aria-hidden', 'true');
                if (isChecked) {
                    const dot = document.createElement('span');
                    dot.className = 'sf-radio-dot';
                    radio.appendChild(dot);
                }
                row.appendChild(radio);
            }

            const optLabel = document.createElement('span');
            optLabel.className = 'sf-option-label';
            optLabel.textContent = opt.label;
            row.appendChild(optLabel);

            row.addEventListener('click', () => toggleOption(opt.value));
            listEl.appendChild(row);
        });

        updateScrollThumb();
    }

    function updateTriggerText() {
        if (!_selected.length) {
            triggerText.textContent = placeholder;
            triggerText.classList.add('sf-placeholder');
        } else if (mode === 'single') {
            const opt = _options.find((o) => o.value === _selected[0]);
            triggerText.textContent = opt ? opt.label : _selected[0];
            triggerText.classList.remove('sf-placeholder');
        } else {
            const count = _selected.length;
            triggerText.textContent = count === 1
                ? (_options.find((o) => o.value === _selected[0])?.label ?? _selected[0])
                : `${count} selected`;
            triggerText.classList.remove('sf-placeholder');
        }
    }

    function updateScrollThumb() {
        const scrollRatio = listEl.scrollHeight > listEl.clientHeight
            ? listEl.clientHeight / listEl.scrollHeight
            : 1;
        scrollThumb.style.height = `${Math.max(scrollRatio * 100, 20)}%`;
        scrollThumb.style.top    = `${(listEl.scrollTop / Math.max(listEl.scrollHeight - listEl.clientHeight, 1)) * (100 - Math.max(scrollRatio * 100, 20))}%`;
        scrollTrack.style.opacity = scrollRatio < 1 ? '1' : '0';
    }

    listEl.addEventListener('scroll', updateScrollThumb);

    // ── Toggle option ────────────────────────────────────────────────────
    function toggleOption(value) {
        if (mode === 'single') {
            _selected = [value];
            closeDropdown();
        } else {
            const idx = _selected.indexOf(value);
            if (idx === -1) _selected.push(value);
            else _selected.splice(idx, 1);
            renderOptions(searchInput ? searchInput.value : '');
        }
        updateTriggerText();
        if (_onChange) _onChange([..._selected]);
    }

    // ── Open / close ─────────────────────────────────────────────────────
    function openDropdown() {
        if (_open) return;
        _open = true;
        dropdown.classList.add('sf-dropdown--open');
        trigger.setAttribute('aria-expanded', 'true');
        trigger.classList.add('sf-trigger--open');
        renderOptions(searchInput ? searchInput.value : '');
        if (searchInput) {
            searchInput.value = '';
            searchInput.focus();
        }
        // reposition if near bottom of viewport
        positionDropdown();
    }

    function closeDropdown() {
        if (!_open) return;
        _open = false;
        dropdown.classList.remove('sf-dropdown--open');
        trigger.setAttribute('aria-expanded', 'false');
        trigger.classList.remove('sf-trigger--open');
    }

    function positionDropdown() {
        const rect = trigger.getBoundingClientRect();
        const spaceBelow = window.innerHeight - rect.bottom;
        if (spaceBelow < 220 && rect.top > 220) {
            dropdown.classList.add('sf-dropdown--above');
        } else {
            dropdown.classList.remove('sf-dropdown--above');
        }
    }

    // ── Events ───────────────────────────────────────────────────────────
    trigger.addEventListener('click', (e) => {
        e.stopPropagation();
        _open ? closeDropdown() : openDropdown();
    });

    if (searchInput) {
        searchInput.addEventListener('input', () => {
            renderOptions(searchInput.value);
        });
        // Prevent dropdown close when clicking inside search
        searchInput.addEventListener('click', (e) => e.stopPropagation());
    }

    document.addEventListener('click', (e) => {
        if (!root.contains(e.target)) closeDropdown();
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && _open) closeDropdown();
    });

    // ── Initial render ────────────────────────────────────────────────────
    renderOptions();
    updateTriggerText();

    // ── Public API ────────────────────────────────────────────────────────
    return {
        el: root,

        /** Replace the option list */
        setOptions(newOptions = []) {
            _options  = [...newOptions];
            _selected = _selected.filter((v) => _options.some((o) => o.value === v));
            if (_open) renderOptions(searchInput ? searchInput.value : '');
            updateTriggerText();
        },

        /** Set selected values (array of value strings) */
        setValue(values = []) {
            _selected = [...values];
            if (_open) renderOptions(searchInput ? searchInput.value : '');
            updateTriggerText();
        },

        /** Get currently selected values */
        getValue() {
            return [..._selected];
        },

        /** Get the label text */
        getLabel() {
            return label;
        },

        /** Register / replace the onChange callback */
        setOnChange(fn) {
            _onChange = fn ?? null;
        },

        /** Remove global listeners and detach element */
        destroy() {
            document.removeEventListener('click', closeDropdown);
            root.remove();
        },
    };
}
