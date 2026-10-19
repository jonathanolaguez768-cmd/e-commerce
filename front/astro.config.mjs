// @ts-check

import netlify from '@astrojs/netlify';
import react from '@astrojs/react';
import { defineConfig } from 'astro/config';


export default defineConfig({
    output: 'server',
    adapter: netlify(),
    integrations: [react()],
});
