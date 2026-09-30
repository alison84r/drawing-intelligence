import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'

const extractorPort = process.env.EXTRACTOR_PORT ?? '8022'
const frontendPort = parseInt(process.env.FRONTEND_PORT ?? '5173', 10)

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  server: {
    port: frontendPort,
    strictPort: true,
    proxy: {
      '/api': { target: `http://localhost:${extractorPort}`, changeOrigin: true },
      '/extract': { target: `http://localhost:${extractorPort}`, changeOrigin: true },
      '/export': { target: `http://localhost:${extractorPort}`, changeOrigin: true },
      '/health': { target: `http://localhost:${extractorPort}`, changeOrigin: true },
    },
  },
})
