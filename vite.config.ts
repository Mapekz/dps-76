import path from 'path';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

// https://vite.dev/config/
export default defineConfig(({ command }) => ({
  // `compiler: true` (native React Compiler via oxc-transform-react) is
  // deliberately NOT enabled here — see dps-76#87. In dev, plugin-react's
  // Fast Refresh wrapping runs on every file it transforms regardless of
  // whether the compiler actually compiles it, and doesn't distinguish the
  // main window's client environment from a Worker's; suggestions.worker.ts
  // (see its doc-comment) shares most of its import graph with the main app
  // (src/state/build-reducer.ts, src/lib/engine/scenarios.ts, ...), so those
  // dual-consumed files get wrapped with `$RefreshReg$` calls that only
  // exist in the main window, throwing inside the Worker. `worker.plugins`
  // does not help — it only applies to the production Rolldown worker-bundle
  // pass, not the dev server's per-file transform pipeline.
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  base: command === 'build' ? '/dps-76/' : '/',
}));
