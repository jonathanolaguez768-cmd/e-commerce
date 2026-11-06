
// @ts-check

import netlify from '@astrojs/netlify';
import react from '@astrojs/react';
import { defineConfig } from 'astro/config';

export default defineConfig({
    output: 'server',
    adapter: netlify({
        devFeatures: {
            environmentVariables: true,
            images: true,
            edgeFunctions: false,
        },
    }),
    integrations: [react()],
});
