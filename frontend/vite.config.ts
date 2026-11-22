import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwind from '@tailwindcss/vite'

const proxy = { '/api': process.env.FITOURIA_API_TARGET ?? 'http://127.0.0.1:8000' }

export default defineConfig({
  plugins: [react(), tailwind()],
  server: { proxy },
  preview: { proxy },
})
