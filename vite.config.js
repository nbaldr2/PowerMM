import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '/auth': { target: 'http://localhost:3001', changeOrigin: true },
      '/smtp': { target: 'http://localhost:3001', changeOrigin: true },
      '/campaigns': { target: 'http://localhost:3001', changeOrigin: true },
      '/lists': { target: 'http://localhost:3001', changeOrigin: true },
      '/track': { target: 'http://localhost:3001', changeOrigin: true },
      '/pmta': { target: 'http://localhost:3001', changeOrigin: true },
      '/analytics': { target: 'http://localhost:3001', changeOrigin: true },
      '/ipchecker': { target: 'http://localhost:3001', changeOrigin: true },
      '/spamcheck': { target: 'http://localhost:3001', changeOrigin: true },
      '/health': { target: 'http://localhost:3001', changeOrigin: true },
      '/uploads': { target: 'http://localhost:3001', changeOrigin: true },
      '/socket.io': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        ws: true,
      },
    },
  },
})
