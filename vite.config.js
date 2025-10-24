import { defineConfig } from "vite";

const target = process.env.VITE_API_TARGET || "http://localhost:8000";

export default defineConfig({
  server: {
    port: 5173,
    proxy: {
      "/api": { target, changeOrigin: true }
    }
  },
  build: { outDir: "dist" }
});
