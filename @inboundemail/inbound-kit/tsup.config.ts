import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts', 'src/cli.ts'],
  format: ['cjs', 'esm'],
  dts: true,
  splitting: false,
  sourcemap: true,
  clean: true,
  minify: false, // Keep readable for CLI debugging
  target: 'es2020',
  outDir: 'dist',
  shims: true, // Add shims for __dirname, __filename
  banner: {
    js: '#!/usr/bin/env node', // Add shebang for CLI
  },
})
