# Mehman Ismayilli — personal website

A plain, static HTML website served directly from this repository via GitHub Pages.
**There is no build step for the site** — edit an `.html` file, commit, and push.

Live at **https://mnismayilli.github.io**.

## Layout

```text
├── index.html            # home
├── about/  contact/  teaching/  terms/
├── projects/             # research index + one folder per paper
├── blog/                 # blog index + posts
├── lectures/             # course index + course pages (+ the lecture files themselves)
├── ma-watch/             # M&A Watch page (shell; rendered by JS)
├── assets/               # styles.css, main.js, lectures.js, ma-watch.js, ma-watch.css, images
├── data/                 # lectures.json, ma-watch-data.json (data the JS renders)
├── book/                 # rendered Quarto book, served at /book/
├── book-src/             # Quarto book source (.qmd) — never served
├── scripts/              # sync-ma-cases.mjs (weekly M&A data sync)
└── favicon.svg
```

The shared header and footer live in one place — [`assets/main.js`](assets/main.js) —
and are injected into every page. To change a nav link or footer entry, edit the arrays
at the top of that file.

## Editing content

- **Ordinary pages** (home, about, teaching, …): edit the `.html` file directly.
- **A new research paper**: copy an existing `projects/<slug>/index.html`, edit it, and add
  a matching entry to the research lists in `index.html` and `projects/index.html`.

## Publishing lecture material

The Lecture Notes pages render from [`data/lectures.json`](data/lectures.json). To publish a file:

1. Drop the file into `lectures/<course>/<week>/` (create the week folder if needed).
2. Add an entry for it in `data/lectures.json`, under the right course and section.

Reload the page and it appears — no build. Each course page reads its section tables,
top links, and feature links from that JSON.

## M&A Watch

The page at `/ma-watch/` is a thin shell; [`assets/ma-watch.js`](assets/ma-watch.js) fetches
[`data/ma-watch-data.json`](data/ma-watch-data.json) and renders the stats, filters, case
browser, overview, and sources in the browser.

The dataset refreshes automatically: a GitHub Action
([`.github/workflows/sync-ma-data.yml`](.github/workflows/sync-ma-data.yml)) runs
`scripts/sync-ma-cases.mjs` every Monday, pulls the latest official competition-authority
cases, and commits the updated JSON — which triggers a redeploy.

To run the sync locally: `npm install` then `npm run sync:ma`.

## The course book

The Quarto book *Time Series Analysis in Financial Econometrics* has its source in
[`book-src/`](book-src/) and renders into [`book/`](book/), served at **/book/** and linked
from the FI 362 course page. After editing a chapter, run `npm run book` to re-render (needs
[Quarto](https://quarto.org) installed); the rendered `book/` is committed, so the deploy
does not need Quarto.

## Deployment

GitHub Pages is configured to **Deploy from a branch** (`main`, root). Every push to `main`
— including the weekly M&A data sync — republishes the site. There is no site build.
