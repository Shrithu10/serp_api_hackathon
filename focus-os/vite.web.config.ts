// Browser-only preview of the UI using an in-memory mock API (no Electron needed). Useful for UI work and screenshots.
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { resolve } from 'node:path'

export default defineConfig({
  root: resolve(__dirname, 'src/renderer'),
  resolve: { alias: { '@shared': resolve(__dirname, 'src/shared') } },
  plugins: [react()],
  server: { port: 5199, host: '127.0.0.1' }
})
