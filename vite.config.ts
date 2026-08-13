import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: true,
    port: 5173,
    // Der Tischwirt läuft separat auf :3001 — im Dev über denselben Origin
    // proxyen, damit der Client nirgends eine Adresse hartcodieren muss.
    proxy: { '/ws': { target: 'ws://localhost:3001', ws: true } },
  },
})
