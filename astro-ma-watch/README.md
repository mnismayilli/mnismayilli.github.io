# OECD M&A Watch

Astro mini-app that pulls official public merger and acquisition case data from competition authorities with public case registers, normalizes the data, and renders an interactive explorer that is easy to embed into an existing Astro site.

## Current live official coverage

- Australia: ACCC acquisitions register
- Canada: Competition Bureau weekly merger review report
- European Commission: official merger case search
- United Kingdom: CMA merger case finder
- United States: DOJ Antitrust Division civil merger case filings

The app is OECD-oriented, but it also includes the European Commission’s supranational merger reviews and DOJ public civil merger enforcement filings where the official source is dependable and linkable.

## Local setup

```bash
cd "/Users/econ0757/Documents/New project/astro-ma-watch"
npm install
npm run dev
```

## Sync official data

```bash
cd "/Users/econ0757/Documents/New project/astro-ma-watch"
npm run sync
```

By default the sync keeps:

- all ongoing/publicly open reviews
- recently opened or recently concluded cases inside a 90 day window

You can change that window:

```bash
MA_NEW_WINDOW_DAYS=120 npm run sync
```

## Build for GitHub Pages or another static host

```bash
cd "/Users/econ0757/Documents/New project/astro-ma-watch"
npm run build
```

That runs the live sync first, then produces a static Astro build in `dist/`.

If you want to build without hitting the live sources, use:

```bash
npm run build:offline
```

## Integrating into an existing Astro site

1. Copy `src/components/OecdMaWatch.astro`
2. Copy `src/scripts/oecd-ma-watch.js`
3. Copy `src/styles/global.css` or merge the relevant classes into your own stylesheet
4. Copy the generated JSON at `src/data/generated/ma-watch-data.json`, or copy the sync script and run it in your site instead
5. Render the component from any Astro page and pass the JSON payload as the `data` prop

Example:

```astro
---
import OecdMaWatch from "../components/OecdMaWatch.astro";
import maWatchData from "../data/generated/ma-watch-data.json";
---

<OecdMaWatch data={maWatchData} />
```
