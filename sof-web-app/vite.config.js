import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    tailwindcss(),
    react()
  ],
  // host:true -> bind 0.0.0.0 supaya dev server bisa diakses dari HP di WiFi yang sama.
  server: { host: true },
})
