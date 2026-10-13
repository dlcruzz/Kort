import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: { port: 5173, open: true },
  build: {
    rollupOptions: {
      output: {
        // bibliotecas em arquivos separados: mudam pouco e ficam no cache do navegador
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          supabase: ['@supabase/supabase-js'],
          icones: ['lucide-react'],
        },
      },
    },
  },
})
