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
├── ma-watch/             # M&A Watch page (shell; rendered by JS)
├── assets/               # styles.css, main.js, ma-watch.js, ma-watch.css, images
├── data/                 # ma-watch-data.json (data the JS renders)
├── book/                 # rendered Quarto book, served at /book/
├── book-src/             # Quarto book source (.qmd) — never served
├── FE_1/                 # rendered "Financial Econometrics I" book (source lives outside this repo)
├── scripts/              # sync-ma-cases.mjs (weekly M&A data sync), sync-fe1.sh
└── favicon.svg
```

The shared header and footer live in one place — [`assets/main.js`](assets/main.js) —
and are injected into every page. To change a nav link or footer entry, edit the arrays
at the top of that file.

## Editing content

- **Ordinary pages** (home, about, teaching, …): edit the `.html` file directly.
- **A new research paper**: copy an existing `projects/<slug>/index.html`, edit it, and add
  a matching entry to the research lists in `index.html` and `projects/index.html`.

## M&A Watch

The page at `/ma-watch/` is a thin shell; [`assets/ma-watch.js`](assets/ma-watch.js) fetches
[`data/ma-watch-data.json`](data/ma-watch-data.json) and renders the stats, filters, case
browser, overview, and sources in the browser.

The dataset refreshes automatically: a GitHub Action
([`.github/workflows/sync-ma-data.yml`](.github/workflows/sync-ma-data.yml)) runs
`scripts/sync-ma-cases.mjs` every Monday, pulls the latest official competition-authority
cases, and commits the updated JSON — which triggers a redeploy.

To run the sync locally: `npm install` then `npm run sync:ma`.

## The course books

Both are Quarto books whose **rendered HTML is committed** — the deploy runs no build, so
GitHub Pages never needs Quarto.

**Time Series Analysis in Financial Econometrics** — served at **/book/**. Source is in
[`book-src/`](book-src/) inside this repo; after editing a chapter run `npm run book`.

**Financial Econometrics I** — served at **/FE_1/**. Its source lives *outside* this repo
(`Oxford/FE_1`, which carries a large offline data cache and a Python environment), so only
the rendered output is copied in. To republish after editing a chapter:

```sh
npm run sync:fe1                 # renders the book, then mirrors _book/ into FE_1/
npm run sync:fe1 -- --no-render  # just copy an already-rendered _book/
FE1_SRC=/new/path npm run sync:fe1   # if the source directory moves
```

The copy is an exact mirror (`rsync --delete`), so chapters deleted from the source stop
being served. Both books are linked from the home page and the teaching page.

## Deployment

GitHub Pages is configured to **Deploy from a branch** (`main`, root). Every push to `main`
— including the weekly M&A data sync — republishes the site. There is no site build.
