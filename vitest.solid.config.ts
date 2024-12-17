import { defineConfig, mergeConfig } from 'vite';
import { commonConfig } from './vitest.common.config';
import solid from 'vite-plugin-solid';

export default mergeConfig(commonConfig, defineConfig({
  plugins: [solid()],
}));