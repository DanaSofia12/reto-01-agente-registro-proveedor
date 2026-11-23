import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

export default defineConfig({
  root: "web",
  plugins: [react(), tailwindcss()],
  build: { outDir: "dist", emptyOutDir: true },
  server: {
    port: 5173,
    // El front nunca ve la clave: habla solo con el backend.
    proxy: { "/api": { target: "http://localhost:3000", changeOrigin: true } },
  },
})
