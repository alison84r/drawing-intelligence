import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const backendPort  = process.env.BACKEND_PORT   ?? '3001'
const extractorPort = process.env.EXTRACTOR_PORT ?? '8000'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: `http://localhost:${backendPort}`,
        changeOrigin: true,
      },
      '/extract': {
        target: `http://localhost:${extractorPort}`,
        changeOrigin: true,
      },
    },
  },
})
