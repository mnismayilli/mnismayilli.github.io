function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function dateLabel(value) {
  if (!value) {
    return "n/a";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleDateString("en-GB", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function summaryCopy(caseItem) {
  return (
    caseItem.description ||
    `${caseItem.authority.name} currently lists this matter as ${String(caseItem.sourceStatus || "")
      .toLowerCase()
      .trim()}.`
  );
}

function fieldValue(value) {
  if (!value) {
    return "n/a";
  }

  if (Array.isArray(value)) {
    return value.join("; ");
  }

  return value;
}

function renderCaseCard(caseItem, active) {
  return `
    <button type="button" class="ma-case-card ${active ? "is-active" : ""}" data-case-id="${escapeHtml(caseItem.id)}">
      <div class="ma-case-card__top">
        <div class="ma-case-card__badges">
          <span class="ma-pill ma-pill--status">${escapeHtml(caseItem.statusLabel)}</span>
          <span class="ma-pill ma-pill--source">${escapeHtml(caseItem.country)}</span>
          <span class="ma-pill ma-pill--urgency">${escapeHtml(caseItem.urgency)}</span>
        </div>
        <span class="ma-case-card__cta">Open case</span>
      </div>
      <h3>${escapeHtml(caseItem.title)}</h3>
      <p>${escapeHtml(summaryCopy(caseItem))}</p>
      <dl class="ma-case-card__facts">
        <div>
          <dt>Authority</dt>
          <dd>${escapeHtml(caseItem.authority.name)}</dd>
        </div>
        <div>
          <dt>Filed</dt>
          <dd>${escapeHtml(caseItem.displayDates?.opened || dateLabel(caseItem.openedAt))}</dd>
        </div>
        <div>
          <dt>Sector</dt>
          <dd>${escapeHtml(caseItem.sector || "n/a")}</dd>
        </div>
        <div>
          <dt>Stage</dt>
          <dd>${escapeHtml(caseItem.stage || caseItem.sourceStatus || "n/a")}</dd>
        </div>
      </dl>
    </button>
  `;
}

function renderHighlightList(caseItem) {
  if (!caseItem.highlights?.length) {
    return "";
  }

  return `
    <div class="ma-highlight-list">
      ${caseItem.highlights
        .map((highlight) => `<span class="ma-soft-pill">${escapeHtml(highlight)}</span>`)
        .join("")}
    </div>
  `;
}

function renderDetails(caseItem) {
  if (!caseItem) {
    return `
      <div class="ma-empty-state">
        <h3>No case selected</h3>
        <p>Pick a case from the list to inspect the details and jump straight to the official filing.</p>
      </div>
    `;
  }

  return `
    <div class="ma-detail-panel__header">
      <div>
        <p class="ma-eyebrow">Selected case</p>
        <h2>${escapeHtml(caseItem.title)}</h2>
      </div>
      <a class="ma-detail-link" href="${escapeHtml(caseItem.link)}" target="_blank" rel="noreferrer">Open source case</a>
    </div>

    <div class="ma-detail-badges">
      <span class="ma-pill ma-pill--status">${escapeHtml(caseItem.statusLabel)}</span>
      <span class="ma-pill ma-pill--source">${escapeHtml(caseItem.authority.name)}</span>
      ${
        caseItem.stage
          ? `<span class="ma-pill ma-pill--urgency">${escapeHtml(caseItem.stage)}</span>`
          : ""
      }
    </div>

    <p class="ma-detail-copy">${escapeHtml(summaryCopy(caseItem))}</p>

    <div class="ma-detail-grid">
      <div class="ma-detail-stat">
        <span>Country</span>
        <strong>${escapeHtml(caseItem.country)}</strong>
      </div>
      <div class="ma-detail-stat">
        <span>Filed</span>
        <strong>${escapeHtml(caseItem.displayDates?.opened || dateLabel(caseItem.openedAt))}</strong>
      </div>
      <div class="ma-detail-stat">
        <span>Updated</span>
        <strong>${escapeHtml(caseItem.displayDates?.updated || dateLabel(caseItem.updatedAt))}</strong>
      </div>
      <div class="ma-detail-stat">
        <span>Sector</span>
        <strong>${escapeHtml(caseItem.sector || "n/a")}</strong>
      </div>
      <div class="ma-detail-stat">
        <span>Case number</span>
        <strong>${escapeHtml(caseItem.caseNumber || "n/a")}</strong>
      </div>
      <div class="ma-detail-stat">
        <span>Source status</span>
        <strong>${escapeHtml(caseItem.sourceStatus || "n/a")}</strong>
      </div>
    </div>

    <div class="ma-detail-columns">
      <div class="ma-detail-box">
        <p class="ma-eyebrow">Acquirer</p>
        <p>${escapeHtml(fieldValue(caseItem.acquirers))}</p>
      </div>
      <div class="ma-detail-box">
        <p class="ma-eyebrow">Target</p>
        <p>${escapeHtml(fieldValue(caseItem.targets))}</p>
      </div>
    </div>

    ${renderHighlightList(caseItem)}
  `;
}

function sortCases(cases, mode) {
  const copy = [...cases];

  if (mode === "freshest") {
    return copy.sort(
      (left, right) =>
        new Date(right.updatedAt || right.openedAt || 0).getTime() -
        new Date(left.updatedAt || left.openedAt || 0).getTime(),
    );
  }

  if (mode === "opened") {
    return copy.sort(
      (left, right) => new Date(right.openedAt || 0).getTime() - new Date(left.openedAt || 0).getTime(),
    );
  }

  if (mode === "authority") {
    return copy.sort(
      (left, right) =>
        left.authority.name.localeCompare(right.authority.name) || left.title.localeCompare(right.title),
    );
  }

  return copy.sort(
    (left, right) =>
      (right.priorityScore || 0) - (left.priorityScore || 0) ||
      new Date(right.updatedAt || right.openedAt || 0).getTime() -
        new Date(left.updatedAt || left.openedAt || 0).getTime(),
  );
}

function matchesSearch(caseItem, query) {
  if (!query) {
    return true;
  }

  const haystack = [
    caseItem.title,
    caseItem.description,
    caseItem.sector,
    caseItem.country,
    caseItem.authority.name,
    caseItem.stage,
    caseItem.caseNumber,
    ...(caseItem.acquirers || []),
    ...(caseItem.targets || []),
    ...(caseItem.highlights || []),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return haystack.includes(query);
}

export function initOecdMaWatch(rootId) {
  const root = document.getElementById(rootId);
  if (!root) {
    return;
  }

  const payloadNode = root.querySelector("[data-ma-watch-payload]");
  if (!payloadNode?.textContent) {
    return;
  }

  const payload = JSON.parse(payloadNode.textContent);
  const state = {
    search: "",
    country: "all",
    authority: "all",
    status: "all",
    sort: "priority",
    biasOngoing: false,
    biasNew: false,
    activeCaseId: payload.cases?.[0]?.id || null,
  };

  const elements = {
    search: root.querySelector("[data-filter-search]"),
    country: root.querySelector("[data-filter-country]"),
    authority: root.querySelector("[data-filter-authority]"),
    status: root.querySelector("[data-filter-status]"),
    sort: root.querySelector("[data-filter-sort]"),
    biasOngoing: root.querySelector("[data-toggle-ongoing]"),
    biasNew: root.querySelector("[data-toggle-new]"),
    resultsMeta: root.querySelector("[data-results-meta]"),
    caseList: root.querySelector("[data-case-list]"),
    caseDetail: root.querySelector("[data-case-detail]"),
  };

  function getFilteredCases() {
    const query = state.search.trim().toLowerCase();
    let cases = (payload.cases || []).filter((caseItem) => {
      if (state.country !== "all" && caseItem.country !== state.country) {
        return false;
      }

      if (state.authority !== "all" && caseItem.authority.id !== state.authority) {
        return false;
      }

      if (state.status === "ongoing" && !caseItem.isOngoing) {
        return false;
      }

      if (state.status === "new" && !caseItem.isNew) {
        return false;
      }

      if (state.status === "completed" && caseItem.isOngoing) {
        return false;
      }

      if (state.biasOngoing && !caseItem.isOngoing) {
        return false;
      }

      if (state.biasNew && !caseItem.isNew) {
        return false;
      }

      return matchesSearch(caseItem, query);
    });

    cases = sortCases(cases, state.sort);
    return cases;
  }

  function syncToggles() {
    if (elements.biasOngoing) {
      elements.biasOngoing.setAttribute("aria-pressed", String(state.biasOngoing));
      elements.biasOngoing.classList.toggle("is-active", state.biasOngoing);
    }

    if (elements.biasNew) {
      elements.biasNew.setAttribute("aria-pressed", String(state.biasNew));
      elements.biasNew.classList.toggle("is-active", state.biasNew);
    }
  }

  function render() {
    const filteredCases = getFilteredCases();

    if (!filteredCases.some((caseItem) => caseItem.id === state.activeCaseId)) {
      state.activeCaseId = filteredCases[0]?.id || null;
    }

    const activeCase = filteredCases.find((caseItem) => caseItem.id === state.activeCaseId) || null;

    if (elements.resultsMeta) {
      elements.resultsMeta.textContent = `Showing ${filteredCases.length} of ${payload.cases.length} cases`;
    }

    if (elements.caseList) {
      elements.caseList.innerHTML = filteredCases.length
        ? filteredCases.map((caseItem) => renderCaseCard(caseItem, caseItem.id === state.activeCaseId)).join("")
        : `
            <div class="ma-empty-state">
              <h3>No matches for this filter set</h3>
              <p>Try widening the country, authority, or status filters.</p>
            </div>
          `;
    }

    if (elements.caseDetail) {
      elements.caseDetail.innerHTML = renderDetails(activeCase);
    }

    syncToggles();
  }

  elements.search?.addEventListener("input", (event) => {
    state.search = event.target.value || "";
    render();
  });

  elements.country?.addEventListener("change", (event) => {
    state.country = event.target.value || "all";
    render();
  });

  elements.authority?.addEventListener("change", (event) => {
    state.authority = event.target.value || "all";
    render();
  });

  elements.status?.addEventListener("change", (event) => {
    state.status = event.target.value || "all";
    render();
  });

  elements.sort?.addEventListener("change", (event) => {
    state.sort = event.target.value || "priority";
    render();
  });

  elements.biasOngoing?.addEventListener("click", () => {
    state.biasOngoing = !state.biasOngoing;
    render();
  });

  elements.biasNew?.addEventListener("click", () => {
    state.biasNew = !state.biasNew;
    render();
  });

  elements.caseList?.addEventListener("click", (event) => {
    const trigger = event.target.closest("[data-case-id]");
    if (!trigger) {
      return;
    }

    state.activeCaseId = trigger.getAttribute("data-case-id");
    render();
  });

  syncToggles();
  render();
}
