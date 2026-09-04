import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Relative base so a production build can be dropped on any static host / subpath.
export default defineConfig({
  base: './',
  plugins: [react()],
  // Off Vite's default 5173, which tends to be taken by another project.
  server: { port: 5174 },
})
