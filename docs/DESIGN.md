# Design notes

## Audiences and the one-click rule

| Audience | What they want | Where it is |
| --- | --- | --- |
| Researchers and editors | papers, abstracts, PDFs, citations | three cards on the home page; `/research/` has every abstract (collapsible), PDF, DOI, BibTeX and a topic filter; each paper has its own page with Google Scholar tags |
| Students | courses, office hours, materials | `/teaching/`: map of teaching, course entries, booking button, lecture notes, classroom game |
| Policymakers, media, clients | one-line expertise, contact | contact column on the home page and `/contact/` |
| Hiring and grant committees | the CV | `/cv/`, printable |

Navigation: **Research · Teaching · CV · Contact**. Cut: blog, terms, click-to-reveal email, animations, Google Analytics,
Google Fonts, the Calendly embed (now a link), the hamburger menu.

## Visual system

Light theme only, on a warm paper background (`#fbf8f2`) rather than white. Three typefaces, all variable and self-hosted:
Fraunces for display type (name, page titles, section headings, the large year numerals), Source Serif 4 for text and
Inter for labels, chips and buttons. No hairline cards: content sits in rounded, tinted "sticker" panels or in open
ledger rows. The site accent is teal; each research area keeps its own pastel tint:

| Tint | Soft / wash | Ink | Used for |
| --- | --- | --- | --- |
| teal | `#d9efe9` / `#ecf6f3` | `#0f6b63` | site accent: monogram, active nav, buttons on hover, office-hours callout |
| blue | `#d6e5fb` / `#eef4fd` | `#1f4e95` | industrial organisation |
| green | `#d6eedc` / `#edf7f0` | `#1d6a40` | environmental economics, teaching |
| rose | `#fbdbe2` / `#fdeef1` | `#a2344f` | experimental economics |
| amber | `#fbe4b4` / `#fdf4e1` | `#825011` | teaching and pedagogy, postgraduate course |
| violet | `#e5dcf7` / `#f3eefb` | `#563a98` | data (M&A Watch), earlier teaching |

Text `#221f1b` on paper (15.6:1), secondary `#5d574e` (6.6:1). Body 17px, line-height 1.6, measure 42rem, 8px spacing scale.
Every token lives at the top of `assets/site.css`; `data-tint="blue|green|rose|amber|violet|teal"` on any element sets
`--t`, `--t-soft` and `--t-wash` for everything inside it.

Page patterns, each used once so the site has its own shape:

- **Home**: hero with the name in Fraunces, a one-sentence identity with links into the three papers, topic chips, contact
  chips and a rounded portrait with an offset amber block; an "About" split; three numbered, tinted research tiles; two panels
  for teaching and the rest of the site.
- **Research**: topic filter as a chip row under the title, then a ledger: year and status in the left column, title, authors,
  action buttons and an in-place abstract on the right. No figures on the list.
- **Paper**: title block, abstract with keyword tags, citation and BibTeX; a tinted facts box and the paper's line drawing on the right.
- **Teaching**: course cards with a tinted header strip, an office-hours callout, two material panels, and timelines.
- **CV**: a sticky section label on the left and a dotted timeline on the right; print button in the header.
- **Contact**: large email, office panel and profile chips on the left; two tinted panels (students, drafts) on the right.

## Engineering

Plain HTML, one stylesheet, no build. JavaScript only where it adds something: the topic filter (about 1 KB, inline),
copy-BibTeX, print, and the pre-existing M&A Watch renderer. The model walkthrough's maths is pre-rendered KaTeX HTML + MathML,
so it reads without JavaScript. SEO: canonical and Open Graph tags, `sitemap.xml`, `robots.txt`, Schema.org `Person` on the home
page and `ScholarlyArticle` on each paper page, `citation_*` tags for Google Scholar. Old URLs redirect.

## Audit (2026-11-24, Lighthouse 13, mobile, simulated slow 4G, local server)

| Page | Performance | Accessibility | Best practices | SEO | LCP | JS |
| --- | --- | --- | --- | --- | --- | --- |
| Home | 100 | 100 | 100 | 100 | 0.9 s | 0 KB |
| Research | 100 | 100 | 100 | 100 | 0.9 s | 0 KB |
| Paper page | 100 | 100 | 100 | 100 | 0.9 s | 0 KB |
| Teaching | 100 | 100 | 100 | 100 | 0.9 s | 0 KB |
| CV | 100 | 100 | 100 | 100 | 0.9 s | 0 KB |
| Contact | 100 | 100 | 100 | 100 | 0.9 s | 0 KB |

`html-validate` recommended preset: 0 problems on all twelve page templates. Checked at 360 px and 1280 px with no
horizontal overflow and no console errors.

## Facts still to confirm

ORCID and Google Scholar links (none found, none shown); the year and status of the two unposted drafts; the Warwick dates
(the old About page said 2021–2024, the old Teaching page 2023–2025: the CV keeps the former, the teaching page the latter);
coauthor links go to RePEc author pages because Leicester's site could not be checked automatically.
