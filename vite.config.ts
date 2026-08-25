import path from 'path';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

// https://vite.dev/config/
export default defineConfig(({ command }) => ({
  // `compiler: true` lazy-loads `oxc-transform-react` — the Rust port of React
  // Compiler, running on the Oxc AST, no Babel anywhere in the pipeline. Left at
  // the default `compilationMode` ('infer': compile every component/hook it can,
  // skip what it can't) rather than 'all', which would force plain functions
  // through the compiler too.
  //
  // This needs `src/workers/refresh-shim.ts` to be safe — in dev the plugin
  // Fast-Refresh-wraps every file it transforms without distinguishing the main
  // window from a Worker. See that file's doc-comment and dps-76#87.
  plugins: [react({ compiler: true }), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  base: command === 'build' ? '/dps-76/' : '/',
}));
