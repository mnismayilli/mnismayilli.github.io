/*
 * M&A Watch — client-side rendering for the plain-HTML site.
 *
 * Fetches the weekly-synced dataset from /data/ma-watch-data.json and renders
 * the stat strip, filters, case browser, overview, and sources panels entirely
 * in the browser.
 *
 * The dataset is refreshed by scripts/sync-ma-cases.mjs (kept for the weekly
 * GitHub Action) writing to /data/ma-watch-data.json.
 */
(() => {
  const root = document.querySelector('[data-ma-watch-root]');
  if (!root) return;

  const escapeHtml = (value) =>
    String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');

  const dateLabel = (value) => {
    if (!value) return 'n/a';
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return value;
    return parsed.toLocaleDateString('en-GB', { year: 'numeric', month: 'short', day: 'numeric' });
  };

  const summaryCopy = (c) =>
    c.description ||
    `${c.authority.name} currently lists this matter as ${String(c.sourceStatus || '').toLowerCase().trim()}.`;

  const fieldValue = (value) => {
    if (!value) return 'n/a';
    if (Array.isArray(value)) return value.join('; ');
    return value;
  };

  function renderCaseCard(c, active) {
    return `
      <button type="button" class="ma-case-card ${active ? 'is-active' : ''}" data-case-id="${escapeHtml(c.id)}">
        <div class="ma-case-card__top">
          <div class="ma-case-card__badges">
            <span class="ma-pill ma-pill--status">${escapeHtml(c.statusLabel)}</span>
            <span class="ma-pill ma-pill--source">${escapeHtml(c.country)}</span>
            <span class="ma-pill ma-pill--urgency">${escapeHtml(c.urgency)}</span>
          </div>
          <span class="ma-case-card__cta">Open →</span>
        </div>
        <h3>${escapeHtml(c.title)}</h3>
        <p>${escapeHtml(summaryCopy(c))}</p>
        <dl class="ma-case-card__facts">
          <div><dt>Authority</dt><dd>${escapeHtml(c.authority.name)}</dd></div>
          <div><dt>Filed</dt><dd>${escapeHtml(c.displayDates?.opened || dateLabel(c.openedAt))}</dd></div>
          <div><dt>Sector</dt><dd>${escapeHtml(c.sector || 'n/a')}</dd></div>
          <div><dt>Stage</dt><dd>${escapeHtml(c.stage || c.sourceStatus || 'n/a')}</dd></div>
        </dl>
      </button>`;
  }

  function renderHighlightList(c) {
    if (!c.highlights?.length) return '';
    return `<div class="ma-highlight-list">${c.highlights
      .map((h) => `<span class="ma-soft-pill">${escapeHtml(h)}</span>`)
      .join('')}</div>`;
  }

  function renderDetails(c) {
    if (!c) {
      return `
        <div class="ma-empty-state">
          <h3>No case selected</h3>
          <p>Pick a case from the list to inspect the details and jump straight to the official filing.</p>
        </div>`;
    }
    return `
      <div class="ma-detail-panel__header">
        <div><p class="ma-eyebrow">Selected case</p><h2>${escapeHtml(c.title)}</h2></div>
        <a class="ma-detail-link" href="${escapeHtml(c.link)}" target="_blank" rel="noreferrer">Open source</a>
      </div>
      <div class="ma-detail-badges">
        <span class="ma-pill ma-pill--status">${escapeHtml(c.statusLabel)}</span>
        <span class="ma-pill ma-pill--source">${escapeHtml(c.authority.name)}</span>
        ${c.stage ? `<span class="ma-pill ma-pill--urgency">${escapeHtml(c.stage)}</span>` : ''}
      </div>
      <p class="ma-detail-copy">${escapeHtml(summaryCopy(c))}</p>
      <div class="ma-detail-grid">
        <div class="ma-detail-stat"><span>Country</span><strong>${escapeHtml(c.country)}</strong></div>
        <div class="ma-detail-stat"><span>Filed</span><strong>${escapeHtml(c.displayDates?.opened || dateLabel(c.openedAt))}</strong></div>
        <div class="ma-detail-stat"><span>Updated</span><strong>${escapeHtml(c.displayDates?.updated || dateLabel(c.updatedAt))}</strong></div>
        <div class="ma-detail-stat"><span>Sector</span><strong>${escapeHtml(c.sector || 'n/a')}</strong></div>
        <div class="ma-detail-stat"><span>Case number</span><strong>${escapeHtml(c.caseNumber || 'n/a')}</strong></div>
        <div class="ma-detail-stat"><span>Source status</span><strong>${escapeHtml(c.sourceStatus || 'n/a')}</strong></div>
      </div>
      <div class="ma-detail-columns">
        <div class="ma-detail-box"><p class="ma-eyebrow">Acquirer</p><p>${escapeHtml(fieldValue(c.acquirers))}</p></div>
        <div class="ma-detail-box"><p class="ma-eyebrow">Target</p><p>${escapeHtml(fieldValue(c.targets))}</p></div>
      </div>
      ${renderHighlightList(c)}`;
  }

  function sortCases(cases, mode) {
    const copy = [...cases];
    if (mode === 'freshest')
      return copy.sort((a, b) => new Date(b.updatedAt || b.openedAt || 0) - new Date(a.updatedAt || a.openedAt || 0));
    if (mode === 'opened')
      return copy.sort((a, b) => new Date(b.openedAt || 0) - new Date(a.openedAt || 0));
    if (mode === 'authority')
      return copy.sort((a, b) => a.authority.name.localeCompare(b.authority.name) || a.title.localeCompare(b.title));
    return copy.sort(
      (a, b) =>
        (b.priorityScore || 0) - (a.priorityScore || 0) ||
        new Date(b.updatedAt || b.openedAt || 0) - new Date(a.updatedAt || a.openedAt || 0)
    );
  }

  function matchesSearch(c, query) {
    if (!query) return true;
    const haystack = [
      c.title, c.description, c.sector, c.country, c.authority.name, c.stage, c.caseNumber,
      ...(c.acquirers || []), ...(c.targets || []), ...(c.highlights || []),
    ].filter(Boolean).join(' ').toLowerCase();
    return haystack.includes(query);
  }

  // --- Panels that the server used to pre-render -----------------------------

  function renderStatStrip(payload) {
    const synced = payload.generatedAt
      ? new Date(payload.generatedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
      : 'n/a';
    return `
      <div><dt>Tracked</dt><dd>${payload.stats?.totalCases ?? 0}</dd></div>
      <div><dt>Ongoing</dt><dd>${payload.stats?.ongoingCases ?? 0}</dd></div>
      <div><dt>Newly visible</dt><dd>${payload.stats?.newCases ?? 0}</dd></div>
      <div><dt>Jurisdictions</dt><dd>${payload.coverage?.liveCountryCount ?? 0}</dd></div>
      <div class="ma-stat-synced"><dt>Synced</dt><dd>${escapeHtml(synced)}</dd></div>`;
  }

  function renderOverview(payload) {
    const s = payload.stats || {};
    const series = s.activityByMonth || [];
    const max = Math.max(...series.map((b) => b.count), 1);
    return `
      <div class="ma-summary-grid">
        <article class="ma-summary-card"><p class="ma-eyebrow">Total tracked</p><strong>${s.totalCases ?? 0}</strong><p>Official public cases inside the current “new and ongoing” window.</p></article>
        <article class="ma-summary-card"><p class="ma-eyebrow">Most active authority</p><strong>${escapeHtml(s.mostActiveAuthority?.label ?? 'n/a')}</strong><p>${s.mostActiveAuthority?.count ?? 0} visible cases in this sync.</p></article>
        <article class="ma-summary-card"><p class="ma-eyebrow">Busiest theme</p><strong>${escapeHtml(s.topSector?.label ?? 'n/a')}</strong><p>${s.topSector?.count ?? 0} cases in the strongest visible cluster.</p></article>
        <article class="ma-summary-card"><p class="ma-eyebrow">Deep reviews</p><strong>${s.deepReviewCount ?? 0}</strong><p>Cases showing phase 2, remedies, references, or similar signals.</p></article>
      </div>
      <div class="ma-spotlight-grid">
        <article class="ma-spotlight-card"><p class="ma-eyebrow">Freshest case</p><h3>${escapeHtml(s.freshestCase?.title ?? 'No cases synced yet')}</h3><p>${escapeHtml(s.freshestCase?.authority ?? 'Sync the live sources to populate this panel.')}</p></article>
        <article class="ma-spotlight-card"><p class="ma-eyebrow">Longest-running ongoing</p><h3>${escapeHtml(s.longestRunningCase?.title ?? 'No ongoing reviews yet')}</h3><p>${s.longestRunningCase?.ageDays ? `${s.longestRunningCase.ageDays} days open` : 'This fills once live ongoing cases are available.'}</p></article>
        <article class="ma-spotlight-card"><p class="ma-eyebrow">Recent activity</p>
          <div class="ma-activity-bars" aria-hidden="true">
            ${series.map((b) => `<div class="ma-activity-bar" title="${escapeHtml(b.label)}: ${b.count}"><span style="height:${Math.max(8, (b.count / max) * 100)}%"></span><small>${escapeHtml(b.label)}</small></div>`).join('')}
          </div>
        </article>
      </div>`;
  }

  function renderSources(payload) {
    const warnings = payload.warnings?.length
      ? `<div class="ma-warning-panel"><p class="ma-eyebrow">Coverage notes</p><ul>${payload.warnings.map((w) => `<li>${escapeHtml(w)}</li>`).join('')}</ul></div>`
      : '';
    const coveragePills = (payload.coverage?.liveCountries || []).map((c) => `<span class="ma-soft-pill">${escapeHtml(c)}</span>`).join('');
    const sourceCards = (payload.sources || [])
      .map(
        (src) => `
        <article class="ma-source-card">
          <p class="ma-eyebrow">${escapeHtml(src.country)}</p>
          <h3>${escapeHtml(src.name)}</h3>
          <p>${src.caseCount} visible cases in this sync.</p>
          <a href="${escapeHtml(src.collectionUrl)}" target="_blank" rel="noreferrer">Open official collection →</a>
        </article>`
      )
      .join('');
    const notes = payload.coverage?.notes?.length
      ? `<ul class="ma-note-list">${payload.coverage.notes.map((n) => `<li>${escapeHtml(n)}</li>`).join('')}</ul>`
      : '';
    return `
      ${warnings}
      <div class="ma-coverage">
        <div class="ma-coverage__copy">
          <p class="ma-eyebrow">Coverage model</p>
          <h2>Honest by design: live where the official public registers are dependable.</h2>
          <p>There is no single OECD-wide merger register, so this build focuses on official public case lists that can be synced cleanly and still link directly to the source case.</p>
          <div class="ma-highlight-list">${coveragePills}</div>
        </div>
        <div class="ma-coverage__meta">
          <div class="ma-detail-box"><p class="ma-eyebrow">OECD members</p><strong>${payload.coverage?.oecdMemberCount ?? 38}</strong></div>
          <div class="ma-detail-box"><p class="ma-eyebrow">Live jurisdictions</p><strong>${payload.coverage?.liveCountryCount ?? 0}</strong></div>
          <div class="ma-detail-box"><p class="ma-eyebrow">Official sources</p><strong>${payload.sources?.length ?? 0}</strong></div>
        </div>
      </div>
      <div class="ma-source-grid">${sourceCards}</div>
      ${notes}`;
  }

  // --- Wire-up ---------------------------------------------------------------

  function initTabs() {
    const tabs = root.querySelectorAll('[data-ma-tab]');
    const panels = root.querySelectorAll('[data-ma-panel]');
    tabs.forEach((tab) => {
      tab.addEventListener('click', () => {
        const name = tab.getAttribute('data-ma-tab');
        tabs.forEach((t) => {
          const active = t === tab;
          t.classList.toggle('is-active', active);
          t.setAttribute('aria-selected', String(active));
        });
        panels.forEach((p) => {
          p.hidden = p.getAttribute('data-ma-panel') !== name;
        });
      });
    });
  }

  function initBrowser(payload) {
    const state = {
      search: '', country: 'all', authority: 'all', status: 'all', sort: 'priority',
      biasOngoing: false, biasNew: false, activeCaseId: payload.cases?.[0]?.id || null,
    };
    const el = {
      search: root.querySelector('[data-filter-search]'),
      country: root.querySelector('[data-filter-country]'),
      authority: root.querySelector('[data-filter-authority]'),
      status: root.querySelector('[data-filter-status]'),
      sort: root.querySelector('[data-filter-sort]'),
      biasOngoing: root.querySelector('[data-toggle-ongoing]'),
      biasNew: root.querySelector('[data-toggle-new]'),
      resultsMeta: root.querySelector('[data-results-meta]'),
      caseList: root.querySelector('[data-case-list]'),
      caseDetail: root.querySelector('[data-case-detail]'),
    };

    // Populate country + authority dropdowns.
    const countries = [...new Set((payload.cases || []).map((c) => c.country))].sort();
    if (el.country)
      el.country.insertAdjacentHTML('beforeend', countries.map((c) => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join(''));
    if (el.authority)
      el.authority.insertAdjacentHTML('beforeend', (payload.sources || []).map((a) => `<option value="${escapeHtml(a.id)}">${escapeHtml(a.name)}</option>`).join(''));

    function getFiltered() {
      const query = state.search.trim().toLowerCase();
      let cases = (payload.cases || []).filter((c) => {
        if (state.country !== 'all' && c.country !== state.country) return false;
        if (state.authority !== 'all' && c.authority.id !== state.authority) return false;
        if (state.status === 'ongoing' && !c.isOngoing) return false;
        if (state.status === 'new' && !c.isNew) return false;
        if (state.status === 'completed' && c.isOngoing) return false;
        if (state.biasOngoing && !c.isOngoing) return false;
        if (state.biasNew && !c.isNew) return false;
        return matchesSearch(c, query);
      });
      return sortCases(cases, state.sort);
    }

    function syncToggles() {
      if (el.biasOngoing) {
        el.biasOngoing.setAttribute('aria-pressed', String(state.biasOngoing));
        el.biasOngoing.classList.toggle('is-active', state.biasOngoing);
      }
      if (el.biasNew) {
        el.biasNew.setAttribute('aria-pressed', String(state.biasNew));
        el.biasNew.classList.toggle('is-active', state.biasNew);
      }
    }

    function render() {
      const filtered = getFiltered();
      if (!filtered.some((c) => c.id === state.activeCaseId)) state.activeCaseId = filtered[0]?.id || null;
      const active = filtered.find((c) => c.id === state.activeCaseId) || null;
      if (el.resultsMeta) el.resultsMeta.textContent = `Showing ${filtered.length} of ${payload.cases.length} cases`;
      if (el.caseList)
        el.caseList.innerHTML = filtered.length
          ? filtered.map((c) => renderCaseCard(c, c.id === state.activeCaseId)).join('')
          : `<div class="ma-empty-state"><h3>No matches for this filter set</h3><p>Try widening the country, authority, or status filters.</p></div>`;
      if (el.caseDetail) el.caseDetail.innerHTML = renderDetails(active);
      syncToggles();
    }

    el.search?.addEventListener('input', (e) => { state.search = e.target.value || ''; render(); });
    el.country?.addEventListener('change', (e) => { state.country = e.target.value || 'all'; render(); });
    el.authority?.addEventListener('change', (e) => { state.authority = e.target.value || 'all'; render(); });
    el.status?.addEventListener('change', (e) => { state.status = e.target.value || 'all'; render(); });
    el.sort?.addEventListener('change', (e) => { state.sort = e.target.value || 'priority'; render(); });
    el.biasOngoing?.addEventListener('click', () => { state.biasOngoing = !state.biasOngoing; render(); });
    el.biasNew?.addEventListener('click', () => { state.biasNew = !state.biasNew; render(); });
    el.caseList?.addEventListener('click', (e) => {
      const trigger = e.target.closest('[data-case-id]');
      if (!trigger) return;
      state.activeCaseId = trigger.getAttribute('data-case-id');
      render();
    });

    render();
  }

  fetch('/data/ma-watch-data.json')
    .then((r) => r.json())
    .then((payload) => {
      const statStrip = root.querySelector('[data-stat-strip]');
      const overview = root.querySelector('[data-overview]');
      const sources = root.querySelector('[data-sources]');
      if (statStrip) statStrip.innerHTML = renderStatStrip(payload);
      if (overview) overview.innerHTML = renderOverview(payload);
      if (sources) sources.innerHTML = renderSources(payload);
      initTabs();
      initBrowser(payload);
    })
    .catch((err) => {
      console.error('ma-watch.js:', err);
      const list = root.querySelector('[data-case-list]');
      if (list) list.innerHTML = '<div class="ma-empty-state"><h3>Could not load data</h3><p>The M&amp;A dataset failed to load.</p></div>';
    });
})();
