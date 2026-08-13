import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: true,
    port: 5173,
    // Socket.io läuft separat auf :3001 — im Dev über denselben Origin proxyen,
    // damit der Client nirgends eine URL hartcodieren muss.
    proxy: { '/socket.io': { target: 'http://localhost:3001', ws: true } },
  },
})
