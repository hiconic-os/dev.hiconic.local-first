import { defineConfig } from 'vitest/config';
import solid from 'vite-plugin-solid';

export default defineConfig({
  optimizeDeps: {
    exclude: ['@dev.hiconic/tf.js_tf-js', '@dev.hiconic/tf.js_tf-js-dev']  // Replace with the exact package name
  },
  test: {
    globals: true,
    environment: 'jsdom',
    reporters: [
      'default',
      ['junit', {
        outputFile: 'junit.xml', // Path for the JUnit XML report
      }],
    ],
    setupFiles: ['./test/test-setup.ts'], // Include the setup file
  },
  plugins: [
    solid({}),
    /* 
      The following post configuration plugin this is needed because solid() plugin is somehow duplicating entries in the configuration.
      It is a known problem which has alegedly been fixed with https://github.com/solidjs/vite-plugin-solid/pull/101.
      The problem seems to be peristent anyhow, requiring us to deduplicate the configuration again. FCK!!!
    */
    {
      name: "deduplicate-config",
      enforce: "post",
      config(config) {
        if (config.test) {
          // dedup reporters
          const reporters = config.test.reporters as any[];
          config.test.reporters = [...new Set(reporters)];

          // dedup setupFiles
          const setupFiles = config.test.setupFiles;
          config.test.setupFiles = [...new Set(setupFiles)];
        }
      },
    },
  ],
});