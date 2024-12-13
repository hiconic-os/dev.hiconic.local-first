import { defineConfig } from 'vitest/config';
import solid from 'vite-plugin-solid';

export default defineConfig({
  optimizeDeps: {
    exclude: ['@dev.hiconic/tf.js_tf-js', '@dev.hiconic/tf.js_tf-js-dev']  // Replace with the exact package name
  },
  plugins: [solid()],
  test: {
    globals: true,
    environment: 'jsdom',
    reporters: [
      'default',
      ['junit', {
        outputFile: 'junit.xml', // Path for the JUnit XML report
      }],
    ],
  },
});