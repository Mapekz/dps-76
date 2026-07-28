import path from 'path';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig, configDefaults } from 'vitest/config';

// https://vite.dev/config/
export default defineConfig(({ command }) => ({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  base: command === 'build' ? '/dps-76/' : '/',
  test: {
    // Agent tooling (cursor-impl, etc.) checks out isolated git worktrees
    // under .claude/worktrees/ nested inside this repo — without this
    // exclude, vitest's default glob picks up their test files too and
    // double-counts (or fails on) unrelated in-progress work.
    exclude: [...configDefaults.exclude, '**/.claude/**'],
  },
}));
