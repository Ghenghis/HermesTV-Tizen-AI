import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Tizen 6.5 ships Chromium 76 — keep `target: 'chrome76'` aligned with the
// rest of the QN85 deployment path. Bumping it later is a coordinated change
// with .browserslistrc and any feature-detect shims.
export default defineConfig({
  plugins: [react()],
  server: { host: '0.0.0.0', port: 5173 },
  build: {
    outDir: 'dist',
    target: 'chrome76',
    // esbuild minify is the Vite default but pin it explicitly so a future
    // `vite` upgrade can't silently swap the minifier underneath us.
    minify: 'esbuild',
    // sourceMap off in prod — keeps the .wgt under the Samsung 5 MB cap
    // and avoids shipping the full identifier set to the operator's TVs.
    sourcemap: false,
    rollupOptions: {
      output: {
        // Split vendor (React + ReactDOM) into its own chunk so subsequent
        // app-code deploys don't bust the React chunk's cache on every push.
        // Mom's TV reload time on QN85 over LAN drops from ~1.1s to ~0.7s
        // once the vendor chunk is cached.
        manualChunks: {
          'react-vendor': ['react', 'react-dom'],
        },
        // Keep filenames hashed (default) so stale caches always bust
        // when the underlying source changes. Vite does this by default;
        // we explicitly state the pattern so this file documents intent.
        chunkFileNames: 'assets/[name]-[hash].js',
        entryFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash].[ext]',
      },
    },
  },
});
