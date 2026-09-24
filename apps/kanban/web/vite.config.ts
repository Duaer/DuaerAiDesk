import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const rootDir = fileURLToPath(new URL(".", import.meta.url));
const outDir = fileURLToPath(new URL("../dist", import.meta.url));

export default defineConfig({
  root: rootDir,
  plugins: [react(), tailwindcss()],
  build: {
    outDir,
    emptyOutDir: true,
  },
  server: {
    host: "127.0.0.1",
    port: 5273,
    strictPort: true,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:8787",
        changeOrigin: false,
      },
    },
  },
});
