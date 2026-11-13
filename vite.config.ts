import { defineConfig } from 'vitest/config';
import { viteSingleFile } from 'vite-plugin-singlefile';
import pkg from './package.json' with { type: 'json' };

// `npm run build` → dist/index.html 1枚（JS・CSS・Worker・画像をすべてインライン化）
export default defineConfig({
  base: './',
  // 設定画面に出す版番号（package.json の version）
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  plugins: [viteSingleFile()],
  test: {
    include: ['src/**/*.test.ts'],
  },
});
