import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/@firebase/webchannel-wrapper')) {
            return 'firebase-webchannel'
          }

          if (
            id.includes('node_modules/@firebase/component') ||
            id.includes('node_modules/@firebase/logger') ||
            id.includes('node_modules/@firebase/util')
          ) {
            return 'firebase-shared'
          }

          if (id.includes('node_modules/@firebase/firestore') || id.includes('node_modules/firebase/firestore')) {
            return 'firebase-firestore'
          }

          if (id.includes('node_modules/@firebase/auth') || id.includes('node_modules/firebase/auth')) {
            return 'firebase-auth'
          }

          if (id.includes('node_modules/@firebase/app') || id.includes('node_modules/firebase/app')) {
            return 'firebase-app'
          }
        },
      },
    },
    // Otimizações para melhor performance
    minify: 'esbuild',
    cssCodeSplit: true,
  },
  esbuild: {
    drop: ['console'],
  },
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
        timeout: 120000,
        proxyTimeout: 120000,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
})
