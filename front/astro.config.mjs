import react from '@astrojs/react';
import sitemap from '@astrojs/sitemap';
import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'http://localhost:4321/',
  output: 'static',
  integrations: [
    react(),
    sitemap({
      filter: (page) =>
        !page.includes('/admin') &&
        !page.includes('/register') &&
        !page.includes('/login') &&
        !page.includes('/cart') &&
        !page.includes('/orders-history'),
    }),
  ],
});
