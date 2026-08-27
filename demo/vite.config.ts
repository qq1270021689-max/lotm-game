import path from "path"
import { existsSync } from "node:fs"
import react from "@vitejs/plugin-react"
import { sites } from "@openai/sites-vite-plugin"
import { defineConfig } from "vite"

// https://vite.dev/config/
export default defineConfig({
  base: './',
  plugins: [react(), ...(existsSync(path.resolve(__dirname, ".openai/hosting.json")) ? [sites()] : [])],
  server: {
    port: 3000,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
