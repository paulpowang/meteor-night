import { defineConfig } from 'vite';

// 相對路徑 base，方便之後部署到任何靜態主機子路徑
export default defineConfig({
  base: './',
  // three.js 本身約 600 KB（gzip 150 KB），單一 chunk 可以接受
  build: { target: 'es2022', chunkSizeWarningLimit: 800 },
  server: { port: 5188, host: '127.0.0.1' },
});
