# Mehman Ismayilli's personal website

## Publishing new teaching material

Course pages build themselves by scanning `public/lectures/`. To put a new lecture,
problem set, dataset, or script on the site:

1. Drop the file into `public/lectures/<course>/<week>/`. The week folder does not have
   to exist yet — create it and it becomes a new section.
2. Run `npm run publish`.

That is the whole workflow. The file appears on its course page with a title derived
from its filename, and GitHub Actions deploys the site about a minute later. **You never
edit code to add a file**, and a file in the folder can never be silently missing from
the site.

To give a file a proper title, a summary, or a place in the lecture tables, add an entry
for it in [`src/data/lectures.yml`](src/data/lectures.yml). That file is presentation
only — it cannot hide a file from the site. Until you add an entry, the file simply shows
up under "Additional materials".

To add a whole new course, create `public/lectures/<course>/` and add a course block to
`src/data/lectures.yml`. A page and a card on `/lectures` are generated for it.

## The course book

The Quarto book *Time Series Analysis in Financial Econometrics* lives in
[`book/`](book/) and is served at **/book/**, linked from the FI 362 course page.

After editing a chapter, run `npm run book` to re-render it, then `npm run publish`.
`npm run book` renders `book/` into `public/book/`, which is committed — so the deploy
does not need Quarto installed.

Do not put the book sources back inside `public/`: everything under `public/` is copied
to the live site verbatim, so the `.qmd` files and the render cache would be published too.

`npm run publish` builds first, so a broken site is caught locally instead of failing in
CI. It refuses to push if the build fails.

---

It is created Dante - Astro & Tailwind CSS Theme by justgoodui.com. 

Dante is a single-author blog and portfolio theme for Astro.js. Featuring a minimal, slick, responsive and content-focused design. For more Astro.js themes please check [justgoodui.com](https://justgoodui.com/).

![Dante Astro.js Theme](public/dante-preview.jpg)

[![Deploy to Netlify Button](https://www.netlify.com/img/deploy/button.svg)](https://app.netlify.com/start/deploy?repository=https://github.com/JustGoodUI/dante-astro-theme)

If you click this☝️ button, it will create a new repo for you that looks exactly like this one, and sets that repo up immediately for deployment on Netlify.

## Theme Features:

- ✅ Dark and light color mode
- ✅ Hero section with bio
- ✅ Portfolio collection
- ✅ Pagination support
- ✅ Post tags support
- ✅ Subscription form
- ✅ View transitions
- ✅ Tailwind CSS
- ✅ Mobile-first responsive layout
- ✅ SEO-friendly with canonical URLs and OpenGraph data
- ✅ Sitemap support
- ✅ RSS Feed support
- ✅ Markdown & MDX support

## Template Integrations

- @astrojs/tailwind - https://docs.astro.build/en/guides/integrations-guide/tailwind/
- @astrojs/sitemap - https://docs.astro.build/en/guides/integrations-guide/sitemap/
- @astrojs/mdx - https://docs.astro.build/en/guides/markdown-content/
- @astrojs/rss - https://docs.astro.build/en/guides/rss/

## Project Structure

Inside of Dante Astro theme, you'll see the following folders and files:

```text
├── public/
├── src/
│   ├── components/
│   ├── content/
│   ├── data/
│   ├── icons/
│   ├── layouts/
│   ├── pages/
│   ├── styles/
│   └── utils/
├── astro.config.mjs
├── package.json
├── README.md
└── tsconfig.json
```

Astro looks for `.astro` or `.md` files in the `src/pages/` directory. Each page is exposed as a route based on its file name.

There's nothing special about `src/components/`, but that's where we like to put any Astro (`.astro`) components.

The `src/content/` directory contains "collections" of related Markdown and MDX documents. Use `getCollection()` to retrieve posts from `src/content/blog/`, and type-check your frontmatter using an optional schema. See [Astro's Content Collections docs](https://docs.astro.build/en/guides/content-collections/) to learn more.

Any static assets, like images, can be placed in the `public/` directory.

## Astro.js Commands

All commands are run from the root of the project, from a terminal:

| Command                   | Action                                           |
| :------------------------ | :----------------------------------------------- |
| `npm install`             | Installs dependencies                            |
| `npm run dev`             | Starts local dev server at `localhost:4321`      |
| `npm run build`           | Build your production site to `./dist/`          |
| `npm run preview`         | Preview your build locally, before deploying     |
| `npm run astro ...`       | Run CLI commands like `astro add`, `astro check` |
| `npm run astro -- --help` | Get help using the Astro CLI                     |

## Want to learn more about Astro.js?

Check out [our documentation](https://docs.astro.build) or jump into our [Discord server](https://astro.build/chat).

## Credits

- Demo content generate with [Chat GPT](https://chat.openai.com/)
- Images for demo content from [Unsplash](https://unsplash.com/)

## Astro Themes by Just Good UI

- [Ovidius](https://github.com/JustGoodUI/ovidius-astro-theme) is a free single author blog theme.

## License

Licensed under the [GPL-3.0](https://github.com/JustGoodUI/dante-astro-theme/blob/main/LICENSE) license.
