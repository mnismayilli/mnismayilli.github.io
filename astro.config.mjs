import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';
import { defineConfig } from 'astro/config';
import siteConfig from './src/data/site-config';

// https://astro.build/config
export default defineConfig({
    site: siteConfig.website,
    integrations: [mdx(), sitemap()]
});
