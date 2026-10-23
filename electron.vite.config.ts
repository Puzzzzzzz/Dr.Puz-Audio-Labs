import { resolve } from 'node:path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  main: { plugins: [externalizeDepsPlugin()], build: { lib: { entry: 'electron/main/index.ts' } } },
  preload: { plugins: [externalizeDepsPlugin()], build: { lib: { entry: 'electron/preload/index.ts' } } },
  renderer: {
    root: resolve('src'),
    resolve: { alias: { '@': resolve('src') } },
    plugins: [react()],
    build: { rollupOptions: { input: resolve('src/index.html') } }
  }
})
