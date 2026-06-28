import { writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { load } from "cheerio";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_PATH = path.resolve(__dirname, "../src/data/generated/ma-watch-data.json");

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const NOW = new Date();
const GENERATED_AT = NOW.toISOString();
const NEW_WINDOW_DAYS = Number(process.env.MA_NEW_WINDOW_DAYS ?? 90);
const RECENT_CUTOFF = new Date(NOW.getTime() - NEW_WINDOW_DAYS * MS_PER_DAY);

// A real browser User-Agent + full header set: several official registers
// (gov.uk, justice.gov, ec.europa.eu) block non-browser agents / bare requests
// from cloud IPs, which is what made the scheduled CI sync fail.
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

const DEFAULT_HEADERS = {
  "accept-language": "en-GB,en;q=0.9",
  "cache-control": "no-cache",
  pragma: "no-cache",
  "user-agent": USER_AGENT,
};

const FETCH_RETRIES = Number(process.env.MA_FETCH_RETRIES ?? 3);
const FETCH_RETRY_BASE_MS = 800;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const OECD_MEMBERS = [
  "Australia",
  "Austria",
  "Belgium",
  "Canada",
  "Chile",
  "Colombia",
  "Costa Rica",
  "Czech Republic",
  "Denmark",
  "Estonia",
  "Finland",
  "France",
  "Germany",
  "Greece",
  "Hungary",
  "Iceland",
  "Ireland",
  "Israel",
  "Italy",
  "Japan",
  "Korea",
  "Latvia",
  "Lithuania",
  "Luxembourg",
  "Mexico",
  "Netherlands",
  "New Zealand",
  "Norway",
  "Poland",
  "Portugal",
  "Slovak Republic",
  "Slovenia",
  "Spain",
  "Sweden",
  "Switzerland",
  "Turkiye",
  "United Kingdom",
  "United States",
];

const SOURCE_CONFIG = {
  cma: {
    id: "uk-cma",
    name: "Competition and Markets Authority",
    country: "United Kingdom",
    countryCode: "GB",
    officialUrl: "https://www.gov.uk/government/organisations/competition-and-markets-authority",
    collectionUrl: "https://www.gov.uk/cma-cases",
    listUrl: "https://www.gov.uk/cma-cases?case_type%5B%5D=mergers",
  },
  canada: {
    id: "ca-competition-bureau",
    name: "Competition Bureau Canada",
    country: "Canada",
    countryCode: "CA",
    officialUrl: "https://competition-bureau.canada.ca/en/mergers-and-acquisitions",
    collectionUrl:
      "https://competition-bureau.canada.ca/en/mergers-and-acquisitions/report-concluded-merger-reviews",
  },
  accc: {
    id: "au-accc",
    name: "Australian Competition and Consumer Commission",
    country: "Australia",
    countryCode: "AU",
    officialUrl: "https://www.accc.gov.au/mergers-and-acquisitions",
    collectionUrl:
      "https://www.accc.gov.au/public-registers/mergers-and-acquisitions-registers/acquisitions-register",
    query:
      "f%5B0%5D=acccgov_merger_matter_status%3Aassessment_completed&f%5B1%5D=acccgov_merger_matter_status%3Aunder_assessment&init=1",
  },
  doj: {
    id: "us-doj-atr",
    name: "U.S. Department of Justice Antitrust Division",
    country: "United States",
    countryCode: "US",
    officialUrl: "https://www.justice.gov/atr",
    collectionUrl:
      "https://www.justice.gov/atr/antitrust-case-filings?field_case_type_target_id%5B0%5D=28",
    listUrl:
      "https://www.justice.gov/atr/antitrust-case-filings?field_case_type_target_id%5B0%5D=28&f%5B0%5D=cases_index_list_case_type%3Acivil_merger",
  },
  ec: {
    id: "eu-commission",
    name: "European Commission",
    country: "European Union",
    countryCode: "EU",
    officialUrl: "https://competition-policy.ec.europa.eu/mergers_en",
    collectionUrl: "https://competition-cases.ec.europa.eu/search?caseInstrument=M",
    apiBaseUrl: "https://api.tech.ec.europa.eu/search-api/prod/rest",
    apiKey: "CS_PROD_ODSE_PROD",
  },
};

const CANADA_OUTCOME_LABELS = {
  ARC: "Advance ruling certificate",
  NAL: "No action letter",
  CA: "Consent agreement",
  JD: "Judicial decision",
  TA: "Transaction abandoned",
  Other: "Other published outcome",
  Ongoing: "Ongoing review",
};

const DOJ_CIVIL_MERGER_LABEL = "Civil Merger";
const EC_RESULT_PAGE_SIZE = 50;
const EC_RECENT_DECISION_FETCH_CAP = 8;

async function fetchWithRetry(url, init = {}) {
  let lastError;

  for (let attempt = 1; attempt <= FETCH_RETRIES; attempt += 1) {
    try {
      const response = await fetch(url, {
        ...init,
        headers: { ...DEFAULT_HEADERS, ...(init.headers ?? {}) },
        signal: AbortSignal.timeout(30000),
      });

      if (!response.ok) {
        // 429/5xx are usually transient or rate-limit related — retry those.
        if ((response.status === 429 || response.status >= 500) && attempt < FETCH_RETRIES) {
          await sleep(FETCH_RETRY_BASE_MS * attempt);
          continue;
        }
        throw new Error(`Request failed for ${url}: ${response.status} ${response.statusText}`);
      }

      return response;
    } catch (error) {
      lastError = error;
      if (attempt < FETCH_RETRIES) {
        await sleep(FETCH_RETRY_BASE_MS * attempt);
      }
    }
  }

  throw lastError ?? new Error(`Request failed for ${url}`);
}

async function fetchText(url) {
  const response = await fetchWithRetry(url);
  return response.text();
}

async function fetchJson(url, init = {}) {
  const response = await fetchWithRetry(url, init);
  return response.json();
}

function normalizeWhitespace(value) {
  return String(value ?? "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function titleCaseFromSlug(value) {
  return normalizeWhitespace(value)
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function slugify(value) {
  return normalizeWhitespace(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function parseDate(value) {
  const cleaned = normalizeWhitespace(value);
  if (!cleaned) {
    return null;
  }

  const parsed = new Date(cleaned);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed.toISOString();
}

function dateMs(value) {
  if (!value) {
    return 0;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return 0;
  }

  return parsed.getTime();
}

function daysSince(value) {
  if (!value) {
    return null;
  }

  return Math.max(0, Math.floor((NOW.getTime() - dateMs(value)) / MS_PER_DAY));
}

function isRecent(...values) {
  return values.some((value) => {
    if (!value) {
      return false;
    }
    return dateMs(value) >= RECENT_CUTOFF.getTime();
  });
}

function dedupeStrings(values) {
  return [...new Set(values.filter(Boolean).map((value) => normalizeWhitespace(value)))];
}

function firstValue(value) {
  if (Array.isArray(value)) {
    return value.find((entry) => entry !== null && entry !== undefined && entry !== "") ?? null;
  }

  return value ?? null;
}

function parseJsonObject(value) {
  const candidate = firstValue(value);
  if (!candidate) {
    return null;
  }

  try {
    return JSON.parse(candidate);
  } catch {
    return null;
  }
}

function parseJsonItems(value) {
  const values = Array.isArray(value) ? value : value ? [value] : [];
  const items = [];

  for (const entry of values) {
    if (!entry) {
      continue;
    }

    try {
      const parsed = JSON.parse(entry);
      if (Array.isArray(parsed?.items)) {
        items.push(...parsed.items.filter(Boolean));
      }
    } catch {
      continue;
    }
  }

  return items;
}

function splitParties(title) {
  const normalized = normalizeWhitespace(title);

  if (normalized.includes(" / ")) {
    const parts = normalized.split(" / ").map((part) => normalizeWhitespace(part));
    return {
      acquirers: parts[0] ? [parts[0]] : [],
      targets: parts.slice(1).filter(Boolean),
    };
  }

  if (normalized.includes(" - ")) {
    const parts = normalized.split(" - ").map((part) => normalizeWhitespace(part));
    return {
      acquirers: parts[0] ? [parts[0]] : [],
      targets: parts.slice(1).filter(Boolean),
    };
  }

  return {
    acquirers: [],
    targets: [],
  };
}

function summariseDescription(value) {
  return normalizeWhitespace(value).replace(/\s*read more$/i, "");
}

function formatDateLabel(value) {
  if (!value) {
    return null;
  }

  return new Date(value).toLocaleDateString("en-GB", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function findMostCommon(values) {
  const counts = new Map();
  for (const value of values.filter(Boolean)) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }

  const sorted = [...counts.entries()].sort((left, right) => {
    if (right[1] !== left[1]) {
      return right[1] - left[1];
    }
    return left[0].localeCompare(right[0]);
  });

  if (!sorted.length) {
    return null;
  }

  return {
    label: sorted[0][0],
    count: sorted[0][1],
  };
}

function urgencyForCase(caseItem) {
  const stage = `${caseItem.stage ?? ""} ${caseItem.description ?? ""}`.toLowerCase();

  if (caseItem.isOngoing && /phase 2|in-depth|remedies|reference/i.test(stage)) {
    return "Deep review";
  }

  if (caseItem.isOngoing && (caseItem.ageDays ?? 9999) <= 21) {
    return "Fresh filing";
  }

  if (caseItem.isOngoing && (caseItem.ageDays ?? 0) >= 180) {
    return "Long-running";
  }

  if (caseItem.isNew) {
    return "Newly visible";
  }

  return "Tracked";
}

function priorityForCase(caseItem) {
  let score = 0;

  if (caseItem.isOngoing) {
    score += 220;
  }
  if (caseItem.isNew) {
    score += 80;
  }
  if (/phase 2|in-depth|remedies|reference/i.test(`${caseItem.stage ?? ""} ${caseItem.description ?? ""}`)) {
    score += 40;
  }

  const freshnessDays = daysSince(caseItem.updatedAt ?? caseItem.openedAt ?? caseItem.closedAt);
  if (freshnessDays !== null) {
    score += Math.max(0, 30 - freshnessDays);
  }

  return score;
}

function finalizeCase(caseItem) {
  const openedAt = parseDate(caseItem.openedAt);
  const updatedAt = parseDate(caseItem.updatedAt);
  const closedAt = parseDate(caseItem.closedAt);

  const finalized = {
    ...caseItem,
    openedAt,
    updatedAt,
    closedAt,
  };

  finalized.isOngoing = finalized.normalizedStatus === "ongoing";
  finalized.isNew = isRecent(finalized.openedAt, finalized.closedAt);
  finalized.ageDays = daysSince(finalized.openedAt);
  finalized.highlights = dedupeStrings(finalized.highlights ?? []).slice(0, 4);
  finalized.urgency = urgencyForCase(finalized);
  finalized.priorityScore = priorityForCase(finalized);

  return finalized;
}

function buildMonthBuckets(cases, monthCount = 6) {
  const formatter = new Intl.DateTimeFormat("en-GB", {
    month: "short",
    year: "numeric",
  });
  const buckets = [];
  const cursor = new Date(Date.UTC(NOW.getUTCFullYear(), NOW.getUTCMonth(), 1));

  for (let index = monthCount - 1; index >= 0; index -= 1) {
    const start = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() - index, 1));
    const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1));
    buckets.push({
      key: start.toISOString().slice(0, 7),
      label: formatter.format(start),
      count: cases.filter((caseItem) => {
        const compare = dateMs(caseItem.openedAt ?? caseItem.updatedAt);
        return compare >= start.getTime() && compare < end.getTime();
      }).length,
    });
  }

  return buckets;
}

function pickCaseSummary(caseItem) {
  if (!caseItem) {
    return null;
  }

  return {
    id: caseItem.id,
    title: caseItem.title,
    link: caseItem.link,
    authority: caseItem.authority.name,
    country: caseItem.country,
    stage: caseItem.stage,
    sector: caseItem.sector,
    statusLabel: caseItem.statusLabel,
    urgency: caseItem.urgency,
    openedAt: caseItem.openedAt,
    updatedAt: caseItem.updatedAt,
    ageDays: caseItem.ageDays,
  };
}

function computeStats(cases) {
  const ongoingCases = cases.filter((caseItem) => caseItem.isOngoing);
  const newCases = cases.filter((caseItem) => caseItem.isNew);
  const deepReviews = cases.filter((caseItem) =>
    /phase 2|in-depth|remedies|reference/i.test(`${caseItem.stage ?? ""} ${caseItem.description ?? ""}`),
  );

  const longestRunningCase = [...ongoingCases].sort(
    (left, right) => (right.ageDays ?? -1) - (left.ageDays ?? -1),
  )[0];
  const freshestCase = [...cases].sort(
    (left, right) =>
      dateMs(right.updatedAt ?? right.openedAt ?? right.closedAt) -
      dateMs(left.updatedAt ?? left.openedAt ?? left.closedAt),
  )[0];

  return {
    totalCases: cases.length,
    ongoingCases: ongoingCases.length,
    newCases: newCases.length,
    deepReviewCount: deepReviews.length,
    topSector: findMostCommon(cases.map((caseItem) => caseItem.sector)),
    mostActiveAuthority: findMostCommon(cases.map((caseItem) => caseItem.authority.name)),
    longestRunningCase: pickCaseSummary(longestRunningCase),
    freshestCase: pickCaseSummary(freshestCase),
    activityByMonth: buildMonthBuckets(cases),
  };
}

function readJsonLd($) {
  const scripts = $('script[type="application/ld+json"]');

  for (const script of scripts.toArray()) {
    try {
      return JSON.parse($(script).text());
    } catch {
      continue;
    }
  }

  return null;
}

function parseCmaPhase($) {
  const heading = $("h2, h3")
    .toArray()
    .map((element) => normalizeWhitespace($(element).text()))
    .find((value) => /^phase\s+\d+/i.test(value));

  return heading ?? null;
}

function parseCmaDeadline($) {
  for (const row of $("table tr").toArray()) {
    const cells = $(row)
      .find("th, td")
      .toArray()
      .map((cell) => normalizeWhitespace($(cell).text()));

    if (cells.length >= 2 && /statutory deadline/i.test(cells[1])) {
      return parseDate(cells[0]);
    }
  }

  return null;
}

function humanizeEcStage(value) {
  const normalized = normalizeWhitespace(value);
  if (!normalized) {
    return null;
  }

  const known = {
    FormalInvestigationPhase1Merger: "Phase 1 review",
    FormalInvestigationPhase2Merger: "Phase 2 review",
    InDepthInvestigationPhase2Merger: "Phase 2 review",
    PreNotificationPhaseMerger: "Pre-notification",
  };

  if (known[normalized]) {
    return known[normalized];
  }

  return normalizeWhitespace(
    normalized
      .replace(/Merger$/i, "")
      .replace(/([a-z])([A-Z])/g, "$1 $2")
      .replace(/^Formal Investigation /i, "")
      .replace(/^In Depth /i, "In-depth "),
  );
}

function humanizeEcProcedure(value) {
  const normalized = normalizeWhitespace(value);
  const known = {
    MEnormal: "Normal procedure",
    MEsimplified: "Simplified procedure",
    MEsupersimplified: "Super-simplified procedure",
  };

  return known[normalized] ?? normalized ?? null;
}

function humanizeEcSector(value) {
  const normalized = normalizeWhitespace(value);
  const match = normalized.match(/^NaceV2Sector_([A-Z])(?:_(.+))?$/);

  if (!match) {
    return normalized || null;
  }

  const section = match[1];
  const code = match[2] ? match[2].replaceAll("_", ".") : null;
  return `NACE ${section}${code ? ` ${code}` : ""}`;
}

function buildEcCaseLink(source, caseNumber) {
  const url = new URL(source.collectionUrl);
  url.searchParams.set("caseInstrument", "M");
  url.searchParams.set("caseNumber", caseNumber);
  return url.href;
}

function buildEcOfficialJournalLink(publication) {
  if (!publication) {
    return null;
  }

  const series = publication.referenceSeries || (publication.reference?.split(":")?.[0] ?? "").trim();
  const year =
    publication.referenceYear ||
    (publication.publishedDate ? String(new Date(publication.publishedDate).getUTCFullYear()) : null);
  const number = publication.referenceNumber ? String(publication.referenceNumber).padStart(3, "0") : null;

  if (!series || !year || !number) {
    return null;
  }

  const eliSeries = series === "L" ? "dec" : series;
  if (year >= "2024") {
    return `https://eur-lex.europa.eu/eli/oj/${eliSeries}/${year}/${number}/oj`;
  }

  return `https://eur-lex.europa.eu/legal-content/EN/ALL/?uri=OJ:${series}:${year}:${number}:TOC`;
}

function ecPublicationLabel(publication) {
  if (!publication) {
    return null;
  }

  const series = publication.referenceSeries || (publication.reference?.split(":")?.[0] ?? "").trim();
  const year = publication.referenceYear;
  const number = publication.referenceNumber;

  if (series && year && number) {
    return `OJ ${series}/${year}/${number}`;
  }

  return normalizeWhitespace(publication.reference) || null;
}

function dojDocumentLinks(card, $, baseUrl) {
  return card
    .find(".node-documents a")
    .toArray()
    .map((node) => {
      const link = $(node);
      const href = link.attr("href");
      const label = normalizeWhitespace(link.text());

      if (!href || !label) {
        return null;
      }

      return {
        label,
        href: new URL(href, baseUrl).href,
      };
    })
    .filter(Boolean);
}

function cardFieldValue(card, $, selector) {
  return normalizeWhitespace(card.find(selector).first().text()) || null;
}

async function fetchCmaCases() {
  const source = SOURCE_CONFIG.cma;
  const listHtml = await fetchText(source.listUrl);
  const $ = load(listHtml);
  const listCases = [];

  $(".gem-c-document-list__item").each((_, element) => {
    const card = $(element);
    const anchor = card.find(".gem-c-document-list__item-title a").first();
    const title = normalizeWhitespace(anchor.text());
    const href = anchor.attr("href");
    const metadata = {};

    card.find(".gem-c-document-list__attribute").each((__, node) => {
      const label = normalizeWhitespace($(node).text()).split(":")[0]?.toLowerCase();
      const value = normalizeWhitespace($(node).text().split(":").slice(1).join(":"));
      const timeValue = $(node).find("time").attr("datetime");

      if (label) {
        metadata[label] = timeValue ?? value;
      }
    });

    if (!title || !href) {
      return;
    }

    listCases.push({
      title,
      link: new URL(href, source.collectionUrl).href,
      caseState: metadata["case state"] ?? null,
      marketSector: metadata["market sector"] ?? null,
      openedAt: metadata.opened ?? null,
      closedAt: metadata.closed ?? null,
    });
  });

  const candidates = listCases.filter(
    (caseItem) => caseItem.caseState === "Open" || isRecent(caseItem.openedAt, caseItem.closedAt),
  );
  const cases = [];

  for (const item of candidates) {
    const parties = splitParties(item.title);
    let description = null;
    let phase = null;
    let statutoryDeadline = null;
    let updatedAt = null;
    let publishedAt = null;

    try {
      const detailHtml = await fetchText(item.link);
      const detailPage = load(detailHtml);
      const ldJson = readJsonLd(detailPage);

      description =
        normalizeWhitespace(detailPage('meta[name="description"]').attr("content")) || null;
      phase = parseCmaPhase(detailPage);
      statutoryDeadline = parseCmaDeadline(detailPage);
      publishedAt = parseDate(ldJson?.datePublished);
      updatedAt = parseDate(
        ldJson?.dateModified ??
          detailPage('meta[property="article:modified_time"]').attr("content") ??
          detailPage('meta[name="govuk:updated-at"]').attr("content"),
      );
    } catch {
      description = null;
    }

    const isOngoing = item.caseState === "Open";
    const highlights = [
      item.marketSector,
      phase,
      statutoryDeadline ? `Statutory deadline ${formatDateLabel(statutoryDeadline)}` : null,
    ];

    cases.push(
      finalizeCase({
        id: `${source.id}:${slugify(new URL(item.link).pathname)}`,
        title: item.title,
        link: item.link,
        country: source.country,
        countryCode: source.countryCode,
        authority: {
          id: source.id,
          name: source.name,
          officialUrl: source.officialUrl,
          collectionUrl: source.collectionUrl,
        },
        sourceType: "official case page",
        sourceStatus: item.caseState ?? (isOngoing ? "Open" : "Closed"),
        statusLabel: isOngoing ? "Ongoing" : "Completed",
        normalizedStatus: isOngoing ? "ongoing" : "completed",
        stage: phase,
        sector: item.marketSector,
        openedAt: item.openedAt ?? publishedAt,
        updatedAt: updatedAt ?? item.openedAt ?? item.closedAt,
        closedAt: item.closedAt,
        caseNumber: null,
        codes: [],
        acquirers: parties.acquirers,
        targets: parties.targets,
        description,
        highlights,
      }),
    );
  }

  return {
    cases,
    sourceInfo: {
      id: source.id,
      name: source.name,
      country: source.country,
      countryCode: source.countryCode,
      officialUrl: source.officialUrl,
      collectionUrl: source.listUrl,
      caseCount: cases.length,
      lastSyncedAt: GENERATED_AT,
      status: "LIVE",
    },
  };
}

async function fetchCanadaCases() {
  const source = SOURCE_CONFIG.canada;
  const html = await fetchText(source.collectionUrl);
  const $ = load(html);
  const pageModified = parseDate($('meta[name="dcterms.modified"]').attr("content"));
  const cases = [];

  $("table tbody tr[id]").each((_, element) => {
    const row = $(element);
    const id = row.attr("id");
    const cells = row
      .find("td")
      .toArray()
      .map((cell) => normalizeWhitespace($(cell).text()));

    if (!id || cells.length < 5) {
      return;
    }

    const [title, openedRaw, concludedRaw, industryCode, outcomeRaw] = cells;
    const openedAt = parseDate(openedRaw);
    const closedAt = concludedRaw === "Ongoing" ? null : parseDate(concludedRaw);
    const isOngoing = concludedRaw === "Ongoing";

    if (!isOngoing && !isRecent(openedAt, closedAt)) {
      return;
    }

    const parties = splitParties(title);
    const outcomeLabel = CANADA_OUTCOME_LABELS[outcomeRaw] ?? outcomeRaw;

    cases.push(
      finalizeCase({
        id: `${source.id}:${id}`,
        title,
        link: `${source.collectionUrl}#${id}`,
        country: source.country,
        countryCode: source.countryCode,
        authority: {
          id: source.id,
          name: source.name,
          officialUrl: source.officialUrl,
          collectionUrl: source.collectionUrl,
        },
        sourceType: "official register row",
        sourceStatus: isOngoing ? "Ongoing" : outcomeLabel,
        statusLabel: isOngoing ? "Ongoing" : "Completed",
        normalizedStatus: isOngoing ? "ongoing" : "completed",
        stage: isOngoing ? "Weekly report review ongoing" : "Completed review",
        sector: industryCode ? `NAICS ${industryCode}` : null,
        openedAt,
        updatedAt: closedAt ?? pageModified ?? openedAt,
        closedAt,
        caseNumber: id,
        codes: industryCode
          ? [
              {
                scheme: "NAICS",
                value: industryCode,
              },
            ]
          : [],
        acquirers: parties.acquirers,
        targets: parties.targets,
        description: isOngoing
          ? "The Competition Bureau’s weekly merger report currently shows this review as ongoing."
          : `The Competition Bureau’s weekly merger report lists this review as concluded with ${outcomeLabel.toLowerCase()}.`,
        highlights: [
          isOngoing ? "Ongoing review" : outcomeLabel,
          industryCode ? `NAICS ${industryCode}` : null,
          closedAt ? `Concluded ${formatDateLabel(closedAt)}` : null,
        ],
      }),
    );
  });

  return {
    cases,
    sourceInfo: {
      id: source.id,
      name: source.name,
      country: source.country,
      countryCode: source.countryCode,
      officialUrl: source.officialUrl,
      collectionUrl: source.collectionUrl,
      caseCount: cases.length,
      lastSyncedAt: GENERATED_AT,
      status: "LIVE",
    },
  };
}

function readFieldValue($, scope, label) {
  const target = normalizeWhitespace(label);

  for (const field of scope.find(".field").toArray()) {
    const fieldNode = $(field);
    const fieldLabel = normalizeWhitespace(fieldNode.find(".field__label").first().text()).replace(
      /:$/,
      "",
    );

    if (fieldLabel !== target) {
      continue;
    }

    const items = fieldNode
      .find(".field__item")
      .toArray()
      .map((node) => normalizeWhitespace($(node).text()))
      .filter(Boolean);

    if (items.length) {
      return items.length === 1 ? items[0] : items;
    }

    const listItems = fieldNode
      .find("li")
      .toArray()
      .map((node) => normalizeWhitespace($(node).text()))
      .filter(Boolean);

    if (listItems.length) {
      return listItems;
    }

    return null;
  }

  return null;
}

async function fetchAcccCases() {
  const source = SOURCE_CONFIG.accc;
  const cases = [];
  let page = 0;
  let hasNext = true;

  while (hasNext && page < 10) {
    const url = `${source.collectionUrl}?${source.query}&page=${page}`;
    const html = await fetchText(url);
    const $ = load(html);

    $(".accc-collapsed-card").each((_, element) => {
      const card = $(element);
      const headerAnchor = card.find(".accc-collapsed-card__header > a").first();
      const href = headerAnchor.attr("href");
      const title = normalizeWhitespace(headerAnchor.find("h3").first().text());

      if (!href || !title) {
        return;
      }

      const detailLink = new URL(href, source.collectionUrl).href;
      const detailScope = card.find(".accc-collapsed-card__body").first();
      const acquisitionStatus = readFieldValue($, card, "Acquisition status");
      const type = readFieldValue($, card, "Type");
      const caseNumber = readFieldValue($, card, "Case number");
      const stage = readFieldValue($, card, "Stage");
      const notificationDateRaw = readFieldValue($, card, "Effective notification date");
      const notificationDate = parseDate(notificationDateRaw);
      const acquirers = readFieldValue($, detailScope, "Acquirer(s)");
      const targets = readFieldValue($, detailScope, "Target(s) or Vendor(s)");
      const anzsic = readFieldValue($, detailScope, "ANZSIC code(s)");
      const description =
        summariseDescription(
          normalizeWhitespace(detailScope.find(".field--name-field-accc-body .full-text").text()) ||
            normalizeWhitespace(detailScope.find(".field--name-field-accc-body .summary-text").text()),
        ) || null;
      const isOngoing = /under assessment/i.test(normalizeWhitespace(acquisitionStatus));

      if (!isOngoing && !isRecent(notificationDate)) {
        return;
      }

      cases.push(
        finalizeCase({
          id: `${source.id}:${slugify(detailLink)}`,
          title,
          link: detailLink,
          country: source.country,
          countryCode: source.countryCode,
          authority: {
            id: source.id,
            name: source.name,
            officialUrl: source.officialUrl,
            collectionUrl: source.collectionUrl,
          },
          sourceType: "official register case page",
          sourceStatus: normalizeWhitespace(acquisitionStatus) || (isOngoing ? "Under assessment" : "Completed"),
          statusLabel: isOngoing ? "Ongoing" : "Completed",
          normalizedStatus: isOngoing ? "ongoing" : "completed",
          stage: Array.isArray(stage) ? stage[0] : stage,
          sector: Array.isArray(anzsic) ? anzsic[0] : anzsic,
          openedAt: notificationDate,
          updatedAt: notificationDate,
          closedAt: null,
          caseNumber: Array.isArray(caseNumber) ? caseNumber[0] : caseNumber,
          codes: anzsic
            ? [
                {
                  scheme: "ANZSIC",
                  value: Array.isArray(anzsic) ? anzsic[0] : anzsic,
                },
              ]
            : [],
          acquirers: Array.isArray(acquirers) ? acquirers : acquirers ? [acquirers] : [],
          targets: Array.isArray(targets) ? targets : targets ? [targets] : [],
          description,
          highlights: [
            Array.isArray(stage) ? stage[0] : stage,
            Array.isArray(type) ? type[0] : type,
            Array.isArray(caseNumber) ? caseNumber[0] : caseNumber,
          ],
        }),
      );
    });

    hasNext = $('.page-item--next a[rel="next"]').length > 0;
    page += 1;
  }

  return {
    cases,
    sourceInfo: {
      id: source.id,
      name: source.name,
      country: source.country,
      countryCode: source.countryCode,
      officialUrl: source.officialUrl,
      collectionUrl: source.collectionUrl,
      caseCount: cases.length,
      lastSyncedAt: GENERATED_AT,
      status: "LIVE",
    },
  };
}

async function fetchDojListPage(source, page, useFilteredList = true) {
  const baseUrl = useFilteredList ? source.listUrl : source.collectionUrl;
  const separator = baseUrl.includes("?") ? "&" : "?";
  const url = `${baseUrl}${separator}page=${page}`;
  let html;

  try {
    html = await fetchText(url);
  } catch (error) {
    if (useFilteredList) {
      return fetchDojListPage(source, page, false);
    }

    throw error;
  }

  const $ = load(html);
  const cards = $(".views-row article.news-content-listing.node-case");

  if (useFilteredList && !cards.length) {
    return fetchDojListPage(source, page, false);
  }

  return { $, cards, useFilteredList };
}

async function fetchDojCases() {
  const source = SOURCE_CONFIG.doj;
  const cases = [];
  let page = 0;
  let stalePages = 0;
  let useFilteredList = true;

  while (page < 60) {
    let pagePayload;

    try {
      pagePayload = await fetchDojListPage(source, page, useFilteredList);
    } catch (error) {
      if (page > 0) {
        break;
      }

      throw error;
    }

    const { $, cards, useFilteredList: filtered } = pagePayload;
    useFilteredList = filtered;

    if (!cards.length) {
      break;
    }

    let pageHasRecentCase = false;

    for (const element of cards.toArray()) {
      const card = $(element);
      const anchor = card.find("h2.case-title a").first();
      const href = anchor.attr("href");
      const title = normalizeWhitespace(anchor.text());
      const caseType = cardFieldValue(card, $, ".field_case_type");

      if (!href || !title) {
        continue;
      }

      if (!useFilteredList && caseType && caseType !== DOJ_CIVIL_MERGER_LABEL) {
        continue;
      }

      const openedAt = parseDate(card.find(".field_date time").first().attr("datetime"));
      const closedAt = parseDate(card.find(".field_closed_date time").first().attr("datetime"));
      const isRecentCase = isRecent(openedAt, closedAt);

      if (isRecentCase) {
        pageHasRecentCase = true;
      }

      if (!isRecentCase) {
        continue;
      }

      const detailLink = new URL(href, source.officialUrl).href;
      const federalCourt = cardFieldValue(card, $, ".field_federal_court");
      const industry = cardFieldValue(card, $, ".node-industry .field__item");
      const documents = dojDocumentLinks(card, $, source.officialUrl);
      const parties = splitParties(title);
      const inferredOngoing = !closedAt;
      const primaryDocument = documents[0] ?? null;

      cases.push(
        finalizeCase({
          id: `${source.id}:${slugify(new URL(detailLink).pathname)}`,
          title,
          link: detailLink,
          country: source.country,
          countryCode: source.countryCode,
          authority: {
            id: source.id,
            name: source.name,
            officialUrl: source.officialUrl,
            collectionUrl: source.collectionUrl,
          },
          sourceType: "official case filing page",
          sourceStatus: DOJ_CIVIL_MERGER_LABEL,
          statusLabel: inferredOngoing ? "Public filing" : "Completed",
          normalizedStatus: inferredOngoing ? "ongoing" : "completed",
          stage: "Civil merger enforcement",
          sector: industry,
          openedAt,
          updatedAt: openedAt,
          closedAt,
          caseNumber: null,
          codes: [],
          acquirers: parties.acquirers,
          targets: parties.targets,
          description: primaryDocument
            ? `${source.name} currently lists this public civil merger matter with ${primaryDocument.label.toLowerCase()}.`
            : `${source.name} currently lists this matter as a public civil merger enforcement filing.`,
          highlights: [
            federalCourt,
            primaryDocument?.label,
            industry,
            closedAt ? `Incident date ${formatDateLabel(closedAt)}` : null,
          ],
          attachments: documents,
        }),
      );
    }

    stalePages = pageHasRecentCase ? 0 : stalePages + 1;
    if ((useFilteredList && !pageHasRecentCase) || (!useFilteredList && stalePages >= 5)) {
      break;
    }

    page += 1;
  }

  return {
    cases,
    sourceInfo: {
      id: source.id,
      name: source.name,
      country: source.country,
      countryCode: source.countryCode,
      officialUrl: source.officialUrl,
      collectionUrl: source.collectionUrl,
      caseCount: cases.length,
      lastSyncedAt: GENERATED_AT,
      status: "LIVE",
    },
  };
}

async function postEcSearch(source, { query, sort, pageNumber = 1, pageSize = EC_RESULT_PAGE_SIZE }) {
  const url = new URL(`${source.apiBaseUrl}/search`);
  url.searchParams.set("text", "");
  url.searchParams.set("pageNumber", String(pageNumber));
  url.searchParams.set("pageSize", String(pageSize));
  url.searchParams.set("apiKey", source.apiKey);

  const form = new FormData();
  form.append("query", new Blob([JSON.stringify(query)], { type: "application/json" }));

  if (sort?.length) {
    form.append("sort", new Blob([JSON.stringify(sort)], { type: "application/json" }));
  }

  return fetchJson(url.href, {
    method: "POST",
    body: form,
  });
}

function ecTopicFromResult(source, result) {
  const metadata = result?.metadata ?? {};
  const caseNumber = normalizeWhitespace(firstValue(metadata.caseNumber));
  const title = normalizeWhitespace(firstValue(metadata.caseTitle));

  if (!caseNumber || !title) {
    return null;
  }

  const openedAt = parseDate(firstValue(metadata.caseRenotificationDate) ?? firstValue(metadata.caseNotificationDate));
  const updatedAt = parseDate(
    firstValue(metadata.caseLastUpdateDate) ??
      firstValue(metadata.caseUpdateDate) ??
      firstValue(metadata.es_SortDate) ??
      firstValue(metadata.esDA_IngestDate),
  );
  const closedAt = parseDate(firstValue(metadata.caseLastDecisionDate));
  const parties = splitParties(title);
  const phase = humanizeEcStage(firstValue(metadata.caseInvestigationPhase));
  const procedure = humanizeEcProcedure(firstValue(metadata.caseSimplified));
  const sectors = dedupeStrings((metadata.caseSectors ?? []).map((sector) => humanizeEcSector(sector)));
  const publications = parseJsonItems(metadata.caseOfficialJournalPublications);
  const publication = publications[0] ?? null;
  const publicationLabel = ecPublicationLabel(publication);
  const publicationLink = buildEcOfficialJournalLink(publication);
  const isOngoing = !closedAt;

  return finalizeCase({
    id: `${source.id}:${caseNumber}`,
    title,
    link: buildEcCaseLink(source, caseNumber),
    country: source.country,
    countryCode: source.countryCode,
    authority: {
      id: source.id,
      name: source.name,
      officialUrl: source.officialUrl,
      collectionUrl: source.collectionUrl,
    },
    sourceType: "official competition case search record",
    sourceStatus: isOngoing ? "Under review" : "Decision adopted",
    statusLabel: isOngoing ? "Ongoing" : "Completed",
    normalizedStatus: isOngoing ? "ongoing" : "completed",
    stage: phase ?? (isOngoing ? "Under review" : "Decision adopted"),
    sector: sectors[0] ?? null,
    openedAt,
    updatedAt: closedAt ?? openedAt ?? updatedAt,
    closedAt,
    caseNumber,
    codes: sectors.map((sector) => ({
      scheme: "NACE",
      value: sector,
    })),
    acquirers: parties.acquirers,
    targets: parties.targets,
    description: isOngoing
      ? "The European Commission’s official merger case search currently lists this concentration as under review."
      : "The European Commission’s official merger case search currently lists this concentration as decided.",
    highlights: [
      phase,
      procedure,
      firstValue(metadata.caseDeadlineDate)
        ? `Deadline ${formatDateLabel(firstValue(metadata.caseDeadlineDate))}`
        : null,
      publicationLabel,
    ],
    officialPublicationLink: publicationLink,
  });
}

async function fetchEcOpenCases(source) {
  const query = {
    bool: {
      must: [
        { term: { caseInstrument: "M" } },
        { term: { metadataType: "METADATA_CASE" } },
      ],
      must_not: [{ exists: { field: "caseLastDecisionDate" } }],
    },
  };
  const sort = [{ field: "caseNotificationDate", order: "DESC" }];
  const cases = [];
  let page = 1;
  let totalResults = Infinity;

  while ((page - 1) * EC_RESULT_PAGE_SIZE < totalResults) {
    const payload = await postEcSearch(source, { query, sort, pageNumber: page });
    totalResults = Number(payload.totalResults ?? 0);

    for (const result of payload.results ?? []) {
      const caseItem = ecTopicFromResult(source, result);
      if (caseItem) {
        cases.push(caseItem);
      }
    }

    if (!(payload.results ?? []).length) {
      break;
    }

    page += 1;
  }

  return cases;
}

async function fetchEcRecentCompletedCases(source) {
  const query = {
    bool: {
      must: [
        { term: { caseInstrument: "M" } },
        { term: { metadataType: "METADATA_CASE" } },
        { exists: { field: "caseLastDecisionDate" } },
      ],
    },
  };
  const sort = [{ field: "caseLastDecisionDate", order: "DESC" }];
  const cases = [];
  let page = 1;

  while (page <= EC_RECENT_DECISION_FETCH_CAP) {
    const payload = await postEcSearch(source, { query, sort, pageNumber: page });
    const pageResults = payload.results ?? [];

    if (!pageResults.length) {
      break;
    }

    let pageHasRecentDecision = false;

    for (const result of pageResults) {
      const caseItem = ecTopicFromResult(source, result);
      if (!caseItem) {
        continue;
      }

      if (isRecent(caseItem.closedAt)) {
        pageHasRecentDecision = true;
        cases.push(caseItem);
      }
    }

    const oldestResult = pageResults.at(-1);
    const oldestDecision = parseDate(firstValue(oldestResult?.metadata?.caseLastDecisionDate));
    if (!pageHasRecentDecision || (oldestDecision && !isRecent(oldestDecision))) {
      break;
    }

    page += 1;
  }

  return cases;
}

async function fetchEcCases() {
  const source = SOURCE_CONFIG.ec;
  const [openCases, recentCompletedCases] = await Promise.all([
    fetchEcOpenCases(source),
    fetchEcRecentCompletedCases(source),
  ]);

  const cases = [...new Map([...openCases, ...recentCompletedCases].map((caseItem) => [caseItem.id, caseItem])).values()];

  return {
    cases,
    sourceInfo: {
      id: source.id,
      name: source.name,
      country: source.country,
      countryCode: source.countryCode,
      officialUrl: source.officialUrl,
      collectionUrl: source.collectionUrl,
      caseCount: cases.length,
      lastSyncedAt: GENERATED_AT,
      status: "LIVE",
    },
  };
}

async function main() {
  const results = await Promise.allSettled([
    fetchCmaCases(),
    fetchCanadaCases(),
    fetchAcccCases(),
    fetchDojCases(),
    fetchEcCases(),
  ]);
  const cases = [];
  const sources = [];
  const warnings = [];

  for (const result of results) {
    if (result.status === "fulfilled") {
      cases.push(...result.value.cases);
      sources.push(result.value.sourceInfo);
      continue;
    }

    warnings.push(normalizeWhitespace(result.reason?.message ?? "Unknown source sync failure."));
  }

  const uniqueCases = [...new Map(cases.map((caseItem) => [caseItem.id, caseItem])).values()].sort(
    (left, right) =>
      right.priorityScore - left.priorityScore ||
      dateMs(right.updatedAt ?? right.openedAt ?? right.closedAt) -
        dateMs(left.updatedAt ?? left.openedAt ?? left.closedAt) ||
      left.title.localeCompare(right.title),
  );

  const payload = {
    generatedAt: GENERATED_AT,
    newWindowDays: NEW_WINDOW_DAYS,
    coverage: {
      oecdMemberCount: OECD_MEMBERS.length,
      liveCountryCount: new Set(sources.map((source) => source.country)).size,
      liveCountries: [...new Set(sources.map((source) => source.country))],
      notes: [
        "No single OECD-wide public merger register exists, so this build focuses on official competition authorities with dependable public case registers.",
        "United States coverage reflects public DOJ civil merger enforcement filings, not confidential HSR notifications.",
        "European Commission coverage uses the Commission’s official merger case search and adds the EU’s supranational merger reviews alongside national OECD authority data.",
      ],
    },
    stats: computeStats(uniqueCases),
    sources,
    warnings,
    cases: uniqueCases.map((caseItem) => ({
      ...caseItem,
      displayDates: {
        opened: formatDateLabel(caseItem.openedAt),
        updated: formatDateLabel(caseItem.updatedAt),
        closed: formatDateLabel(caseItem.closedAt),
      },
    })),
  };

  if (!sources.length) {
    // Every official source failed (e.g. all blocked this run). Do NOT overwrite
    // the committed snapshot with an empty payload — keep the last good data.
    console.error(
      `No source synced successfully — keeping the previous snapshot. Warnings: ${warnings.join(" | ")}`,
    );
    process.exitCode = 1;
    return;
  }

  await writeFile(OUTPUT_PATH, `${JSON.stringify(payload, null, 2)}\n`, "utf8");

  console.log(
    `Synced ${payload.cases.length} public cases from ${sources.length} official source${
      sources.length === 1 ? "" : "s"
    }.`,
  );

  if (warnings.length) {
    console.warn(`Warnings: ${warnings.join(" | ")}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
