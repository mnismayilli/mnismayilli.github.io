# Mehman Ismayilli — personal website

A plain, static HTML website served directly from this repository via GitHub Pages.
**There is no build step** — edit an `.html` file, commit, and push. Live at **https://mnismayilli.github.io**.

Design notes, the sitemap and the audit results are in [docs/DESIGN.md](docs/DESIGN.md).

## Layout

```text
├── index.html                 # home: photo, bio, selected research, sections
├── research/
│   ├── index.html             # all papers, grouped by status, with a topic filter
│   ├── <slug>/index.html      # one page per paper (abstract, links, BibTeX, Scholar meta tags)
│   ├── <slug>.bib             # BibTeX file for each paper
│   └── strategic-delay-product-introductions/model/   # model walkthrough (maths pre-rendered with KaTeX)
├── teaching/index.html        # courses, office hours, materials, earlier teaching
├── cv/index.html              # curriculum vitae (printable)
├── contact/index.html
├── ma-watch/index.html        # M&A Watch shell; assets/ma-watch.js renders data/ma-watch-data.json
├── 404.html · sitemap.xml · robots.txt · favicon.svg
├── assets/
│   ├── site.css               # the whole design system (tokens at the top)
│   ├── fonts/                 # Fraunces, Source Serif 4 and Inter, self-hosted
│   ├── img/                   # photo (jpg + webp) and the Open Graph image
│   ├── katex/                 # KaTeX stylesheet and fonts for the model page
│   └── ma-watch.css · ma-watch.js
├── data/ma-watch-data.json    # refreshed weekly by scripts/sync-ma-cases.mjs (GitHub Action)
├── FE_1/  MAFE_EconA/        # rendered Quarto course books; sources in MAFE_EconA-src/ and outside the repo (see scripts/sync-fe1.sh)
├── teaching/ge-uncertainty-game/   # Island Markets classroom game
├── about/ supervision/ blog/ terms/ research/project-*/   # redirects from old URLs
└── scripts/  .github/workflows/
```

## Editing content

- **A new paper**: copy `research/strategic-delay-product-introductions/index.html` to `research/<slug>/index.html`, edit the
  title block (label, title, authors), the abstract and keywords, the facts box and links on the right, and the `citation_*`
  meta tags in `<head>`. Add a `research/<slug>.bib`, an `<li class="entry">` on `research/index.html` (set `data-topics` and
  `data-tint`), and a line on `cv/index.html`. Add the URL to `sitemap.xml`.
- **Topics**: the four filter topics on `research/index.html` are `io`, `env`, `exp`, `teach`; the tints are `blue`, `green`,
  `rose`, `amber` (plus `violet` and `teal`), defined at the top of `assets/site.css`.
- **Courses, CV, contact details**: edit the page directly.
- **Header and footer** are repeated in each page; search for `class="top"` and `class="foot"` to change a link everywhere.

## Local preview

```sh
npm run serve        # http://localhost:4400
```

## M&A Watch and the course books

Unchanged: see `scripts/sync-ma-cases.mjs` (weekly GitHub Action, commits `data/ma-watch-data.json`),
`npm run book:econa`, `npm run sync:fe1`.

The Economics Block A1 book (`MAFE_EconA-src/`) has interactive figures: `figures.js` draws each figure as an
SVG with sliders, step-by-step backward induction and editable payoffs, replacing the static image in the
`::: {.gametree data-fig="<id>"}` block (the image stays as the no-JavaScript and PDF fallback). `figures.css`
styles the panels and `interactive.html` loads the script; all three are wired up in `_quarto.yml`. Re-render
with `npm run book:econa` after editing them.

## Deployment

GitHub Pages, **Deploy from a branch** (`main`, root). Every push republishes the site.
