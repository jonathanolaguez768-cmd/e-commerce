
// @ts-check

//import netlify from '@astrojs/netlify';
import react from '@astrojs/react';
import { defineConfig } from 'astro/config';
import node from '@astrojs/node';

export default defineConfig({
    output: 'server',
  //  adapter: netlify({
    //    devFeatures: {
      //      environmentVariables: true,
        //    images: true,
         //   edgeFunctions: false,
        //},
    //}),
     adapter: node({
    mode: 'standalone',
  }),
    integrations: [react()],
});