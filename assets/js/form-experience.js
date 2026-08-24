(() => {
  'use strict';

  const localeMap = {
    it: 'it-IT',
    pl: 'pl-PL',
    en: 'en-GB',
    de: 'de-DE',
    es: 'es-ES',
    fr: 'fr-FR'
  };

  const pad = (value) => String(value).padStart(2, '0');
  const toISO = ({ year, month, day }) => `${String(year).padStart(4, '0')}-${pad(month)}-${pad(day)}`;
  const toDate = ({ year, month, day }) => new Date(Date.UTC(year, month - 1, day));
  const fromDate = (date) => ({
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate()
  });

  function parseISO(value) {
    const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return null;
    const parts = { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
    const date = toDate(parts);
    return toISO(fromDate(date)) === toISO(parts) ? parts : null;
  }

  function addDays(parts, amount) {
    const date = toDate(parts);
    date.setUTCDate(date.getUTCDate() + amount);
    return fromDate(date);
  }

  function addMonths(parts, amount) {
    const anchor = new Date(Date.UTC(parts.year, parts.month - 1 + amount, 1));
    const year = anchor.getUTCFullYear();
    const month = anchor.getUTCMonth() + 1;
    const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
    return { year, month, day: Math.min(parts.day, lastDay) };
  }

  function setupBirthDatePicker() {
    const field = document.querySelector('[data-date-picker]');
    const input = field?.querySelector('[data-date-input]');
    const trigger = field?.querySelector('[data-date-trigger]');
    const valueLabel = field?.querySelector('[data-date-value]');
    const error = field?.querySelector('[data-date-error]');
    const dialog = document.querySelector('[data-date-dialog]');
    const surface = dialog?.querySelector('[data-date-surface]');
    const grid = dialog?.querySelector('[data-date-grid]');
    const weekdays = dialog?.querySelector('[data-date-weekdays]');
    const monthTitle = dialog?.querySelector('[data-date-month-title]');
    const yearSelect = dialog?.querySelector('[data-date-year]');
    const form = field?.closest('form');
    if (!field || !input || !trigger || !dialog || !surface || !grid || !weekdays || !monthTitle || !yearSelect) return;

    const localToday = new Date();
    const todayParts = {
      year: localToday.getFullYear(),
      month: localToday.getMonth() + 1,
      day: localToday.getDate()
    };
    const activeConfig = window.CARRULEDDHI_ACTIVE_CONFIG || window.CARRULEDDHI_CONFIG;
    const eventParts = parseISO(String(activeConfig?.eventDate || '').slice(0, 10));
    const minParts = parseISO(input.min) || { year: 1900, month: 1, day: 1 };
    const maxParts = eventParts && toISO(eventParts) < toISO(todayParts) ? eventParts : todayParts;
    const minISO = toISO(minParts);
    const maxISO = toISO(maxParts);
    input.min = minISO;
    input.max = maxISO;

    let viewYear = maxParts.year;
    let viewMonth = maxParts.month;
    let activeISO = maxISO;
    let restoreFocus = true;

    const currentLanguage = () => document.documentElement.lang || 'it';
    const locale = () => localeMap[currentLanguage()] || localeMap.it;
    const dictionary = () => window.CARRULEDDHI_I18N?.[currentLanguage()]
      || window.CARRULEDDHI_I18N?.it
      || {};
    const copy = (key) => dictionary()[key] || window.CARRULEDDHI_I18N?.it?.[key] || key;
    const message = (key, values = {}) => Object.entries(values).reduce(
      (result, [name, value]) => result.replaceAll(`{${name}}`, String(value)),
      copy(key)
    );
    const format = (parts, options) => new Intl.DateTimeFormat(locale(), {
      ...options,
      timeZone: 'UTC'
    }).format(toDate(parts));
    const clampParts = (parts) => {
      const iso = toISO(parts);
      if (iso < minISO) return minParts;
      if (iso > maxISO) return maxParts;
      return parts;
    };

    function syncError() {
      if (!error) return;
      if (!input.value) {
        error.textContent = copy('validation.required');
      } else if (!parseISO(input.value) || input.validity.badInput || input.validity.typeMismatch) {
        error.textContent = copy('validation.date');
      } else if (input.validity.rangeUnderflow || input.validity.rangeOverflow) {
        error.textContent = message('validation.dateRange', {
          min: format(minParts, { day: '2-digit', month: 'short', year: 'numeric' }),
          max: format(maxParts, { day: '2-digit', month: 'short', year: 'numeric' })
        });
      } else {
        error.textContent = copy('validation.required');
      }
    }

    function syncValue() {
      const selected = parseISO(input.value);
      const display = selected
        ? format(selected, { day: '2-digit', month: 'long', year: 'numeric' })
        : copy('date.placeholder');
      if (valueLabel) valueLabel.textContent = display;
      trigger.setAttribute('aria-label', `${copy('date.open')}: ${display}`);
      trigger.setAttribute('aria-invalid', String(field.classList.contains('is-invalid')));
      syncError();
    }

    function monthHasAllowedDate(year, month) {
      const first = `${String(year).padStart(4, '0')}-${pad(month)}-01`;
      const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
      const last = `${String(year).padStart(4, '0')}-${pad(month)}-${pad(lastDay)}`;
      return last >= minISO && first <= maxISO;
    }

    function renderWeekdays() {
      weekdays.replaceChildren();
      const monday = { year: 2024, month: 1, day: 1 };
      for (let index = 0; index < 7; index += 1) {
        const day = addDays(monday, index);
        const label = document.createElement('span');
        label.setAttribute('role', 'columnheader');
        label.setAttribute('aria-label', format(day, { weekday: 'long' }));
        label.textContent = format(day, { weekday: 'short' }).replace('.', '');
        weekdays.appendChild(label);
      }
    }

    function renderYears() {
      const selectedYear = viewYear;
      yearSelect.replaceChildren();
      for (let year = maxParts.year; year >= minParts.year; year -= 1) {
        const option = document.createElement('option');
        option.value = String(year);
        option.textContent = String(year);
        yearSelect.appendChild(option);
      }
      yearSelect.value = String(selectedYear);
    }

    /**
     * Year picker: a 12-cell grid paged by decade replaces a 126-option dropdown.
     * It writes into the existing select and fires `change`, so the calendar logic
     * below stays untouched and the native control remains the a11y source.
     */
    function setupYearPanel() {
      const toggle = dialog.querySelector('[data-date-year-toggle]');
      const panel = dialog.querySelector('[data-date-year-panel]');
      const gridEl = dialog.querySelector('[data-date-year-grid]');
      const label = dialog.querySelector('[data-date-year-label]');
      const decadeLabel = dialog.querySelector('[data-date-decade-label]');
      if (!toggle || !panel || !gridEl || !label) return;

      const PAGE = 12;
      let pageStart = 0;

      const pageFor = (year) => {
        const offset = maxParts.year - year;
        return maxParts.year - Math.floor(offset / PAGE) * PAGE;
      };

      function renderPage() {
        const top = Math.min(maxParts.year, pageStart);
        const bottom = Math.max(minParts.year, top - PAGE + 1);
        if (decadeLabel) decadeLabel.textContent = `${bottom}–${top}`;
        gridEl.replaceChildren();
        for (let year = top; year >= bottom; year -= 1) {
          const cell = document.createElement('button');
          cell.type = 'button';
          cell.className = 'date-years__cell';
          cell.dataset.year = String(year);
          cell.textContent = String(year);
          cell.classList.toggle('is-selected', year === viewYear);
          if (year === viewYear) cell.setAttribute('aria-current', 'true');
          gridEl.appendChild(cell);
        }
        dialog.querySelectorAll('[data-date-decade]').forEach((button) => {
          const step = Number(button.dataset.dateDecade);
          const nextTop = top + step * PAGE;
          button.disabled = step < 0
            ? bottom <= minParts.year
            : nextTop > maxParts.year;
        });
      }

      function setOpen(open) {
        panel.hidden = !open;
        toggle.setAttribute('aria-expanded', String(open));
        if (!open) return;
        pageStart = pageFor(viewYear);
        renderPage();
        gridEl.querySelector('.is-selected')?.scrollIntoView({ block: 'nearest' });
      }

      toggle.addEventListener('click', () => setOpen(panel.hidden));
      dialog.querySelectorAll('[data-date-decade]').forEach((button) => {
        button.addEventListener('click', () => {
          pageStart += Number(button.dataset.dateDecade) * PAGE;
          pageStart = Math.min(maxParts.year, Math.max(minParts.year + PAGE - 1, pageStart));
          renderPage();
        });
      });
      gridEl.addEventListener('click', (event) => {
        const cell = event.target.closest('[data-year]');
        if (!cell) return;
        yearSelect.value = cell.dataset.year;
        yearSelect.dispatchEvent(new Event('change', { bubbles: true }));
        setOpen(false);
        toggle.focus({ preventScroll: true });
      });
      dialog.addEventListener('close', () => setOpen(false));

      // Keep the toggle label in sync with whatever moves the calendar.
      const sync = () => {
        label.textContent = String(viewYear);
        if (!panel.hidden) renderPage();
      };
      new MutationObserver(sync).observe(monthTitle, { childList: true, characterData: true, subtree: true });
      sync();
    }

    function focusActiveDay() {
      window.setTimeout(() => {
        grid.querySelector(`[data-date-day="${activeISO}"]`)?.focus({ preventScroll: true });
      }, 0);
    }

    function renderGrid() {
      const active = clampParts(parseISO(activeISO) || maxParts);
      activeISO = toISO(active);
      monthTitle.textContent = format({ year: viewYear, month: viewMonth, day: 1 }, { month: 'long' });
      yearSelect.value = String(viewYear);
      renderWeekdays();
      grid.replaceChildren();

      const firstOfMonth = { year: viewYear, month: viewMonth, day: 1 };
      const mondayOffset = (toDate(firstOfMonth).getUTCDay() + 6) % 7;
      const gridStart = addDays(firstOfMonth, -mondayOffset);
      for (let rowIndex = 0; rowIndex < 6; rowIndex += 1) {
        const row = document.createElement('div');
        row.className = 'date-calendar__row';
        row.setAttribute('role', 'row');
        for (let column = 0; column < 7; column += 1) {
          const parts = addDays(gridStart, rowIndex * 7 + column);
          const iso = toISO(parts);
          const disabled = iso < minISO || iso > maxISO;
          const button = document.createElement('button');
          button.type = 'button';
          button.className = 'date-calendar__day';
          button.dataset.dateDay = iso;
          button.setAttribute('role', 'gridcell');
          button.setAttribute('aria-label', format(parts, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }));
          button.setAttribute('aria-selected', String(input.value === iso));
          button.setAttribute('aria-disabled', String(disabled));
          button.tabIndex = iso === activeISO ? 0 : -1;
          button.disabled = disabled;
          button.textContent = String(parts.day);
          button.classList.toggle('is-outside', parts.month !== viewMonth);
          button.classList.toggle('is-selected', input.value === iso);
          button.classList.toggle('is-today', iso === toISO(todayParts));
          if (iso === toISO(todayParts)) button.setAttribute('aria-current', 'date');
          row.appendChild(button);
        }
        grid.appendChild(row);
      }

      const previousMonth = addMonths({ year: viewYear, month: viewMonth, day: 1 }, -1);
      const nextMonth = addMonths({ year: viewYear, month: viewMonth, day: 1 }, 1);
      const previous = dialog.querySelector('[data-date-prev]');
      const next = dialog.querySelector('[data-date-next]');
      if (previous) previous.disabled = !monthHasAllowedDate(previousMonth.year, previousMonth.month);
      if (next) next.disabled = !monthHasAllowedDate(nextMonth.year, nextMonth.month);
    }

    function setActive(parts, focus = true) {
      const next = clampParts(parts);
      activeISO = toISO(next);
      viewYear = next.year;
      viewMonth = next.month;
      renderGrid();
      if (focus) focusActiveDay();
    }

    function closeCalendar(shouldRestoreFocus = true) {
      restoreFocus = shouldRestoreFocus;
      if (dialog.open) dialog.close();
    }

    function openCalendar() {
      const selected = parseISO(input.value);
      const initial = selected || maxParts;
      activeISO = toISO(initial);
      viewYear = initial.year;
      viewMonth = initial.month;
      renderGrid();
      trigger.setAttribute('aria-expanded', 'true');
      dialog.showModal();
      document.body.classList.add('is-date-open', 'is-locked');
      focusActiveDay();
    }

    function commitDate(parts) {
      input.value = toISO(parts);
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
      syncValue();
      closeCalendar(true);
    }

    trigger.addEventListener('click', openCalendar);
    dialog.querySelectorAll('[data-date-close], [data-date-done]').forEach((button) => {
      button.addEventListener('click', () => closeCalendar(true));
    });
    dialog.querySelector('[data-date-prev]')?.addEventListener('click', () => {
      setActive(addMonths(parseISO(activeISO) || { year: viewYear, month: viewMonth, day: 1 }, -1));
    });
    dialog.querySelector('[data-date-next]')?.addEventListener('click', () => {
      setActive(addMonths(parseISO(activeISO) || { year: viewYear, month: viewMonth, day: 1 }, 1));
    });
    dialog.querySelector('[data-date-today]')?.addEventListener('click', () => commitDate(maxParts));
    dialog.querySelector('[data-date-clear]')?.addEventListener('click', () => {
      input.value = '';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
      syncValue();
      renderGrid();
      focusActiveDay();
    });
    yearSelect.addEventListener('change', () => {
      const active = parseISO(activeISO) || maxParts;
      const next = clampParts({
        year: Number(yearSelect.value),
        month: viewMonth,
        day: active.day
      });
      setActive(next);
    });
    grid.addEventListener('click', (event) => {
      const day = event.target.closest('[data-date-day]');
      if (!day || day.disabled) return;
      const parts = parseISO(day.dataset.dateDay);
      if (parts) commitDate(parts);
    });
    grid.addEventListener('keydown', (event) => {
      const day = event.target.closest('[data-date-day]');
      const current = parseISO(day?.dataset.dateDay);
      if (!current) return;
      let next = null;
      if (event.key === 'ArrowLeft') next = addDays(current, -1);
      if (event.key === 'ArrowRight') next = addDays(current, 1);
      if (event.key === 'ArrowUp') next = addDays(current, -7);
      if (event.key === 'ArrowDown') next = addDays(current, 7);
      if (event.key === 'Home') next = addDays(current, -((toDate(current).getUTCDay() + 6) % 7));
      if (event.key === 'End') next = addDays(current, 6 - ((toDate(current).getUTCDay() + 6) % 7));
      if (event.key === 'PageUp') next = addMonths(current, event.shiftKey ? -12 : -1);
      if (event.key === 'PageDown') next = addMonths(current, event.shiftKey ? 12 : 1);
      if (!next) return;
      event.preventDefault();
      setActive(next);
    });
    dialog.addEventListener('cancel', (event) => {
      event.preventDefault();
      closeCalendar(true);
    });
    dialog.addEventListener('pointerdown', (event) => {
      if (event.target === dialog) closeCalendar(true);
    });
    dialog.addEventListener('close', () => {
      trigger.setAttribute('aria-expanded', 'false');
      document.body.classList.remove('is-date-open');
      const keepLocked = Boolean(document.querySelector('[data-mobile-menu].is-open, .modal.is-open'));
      document.body.classList.toggle('is-locked', keepLocked);
      if (restoreFocus) trigger.focus({ preventScroll: true });
      restoreFocus = true;
    });
    input.addEventListener('input', syncValue);
    input.addEventListener('change', syncValue);
    input.addEventListener('focus', () => {
      if (field.classList.contains('is-date-enhanced')) trigger.focus({ preventScroll: true });
    });
    form?.addEventListener('reset', () => window.setTimeout(() => {
      activeISO = maxISO;
      viewYear = maxParts.year;
      viewMonth = maxParts.month;
      field.classList.remove('is-invalid');
      trigger.removeAttribute('aria-invalid');
      syncValue();
      if (dialog.open) renderGrid();
    }, 0));
    window.addEventListener('carruleddhi:language', () => {
      syncValue();
      if (dialog.open) renderGrid();
    });
    new MutationObserver(() => {
      trigger.setAttribute('aria-invalid', String(field.classList.contains('is-invalid')));
      syncError();
    }).observe(field, { attributes: true, attributeFilter: ['class'] });

    setupYearPanel();
    renderYears();
    syncValue();
    input.tabIndex = -1;
    trigger.hidden = false;
    field.classList.add('is-date-enhanced');
  }

  const initialize = () => {
    if (typeof HTMLDialogElement === 'undefined' || typeof HTMLDialogElement.prototype.showModal !== 'function') return;
    setupBirthDatePicker();
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialize, { once: true });
  else initialize();
})();
