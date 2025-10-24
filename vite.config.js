import { defineConfig } from "vite";

export default defineConfig({
  server: {
    port: 5173,
    proxy: {
      "/api": { target: "http://agent:8000", changeOrigin: true }
    }
  },
  build: { outDir: "dist" }
});

