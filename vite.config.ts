import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const API_DEV_URL = process.env.CBES_API_DEV_URL ?? "http://localhost:8787";

// Local development: http://test.cbenvironments.com:5174 (the public site runs on :5173).
// In production this app shares cbenvironments.com with the public site, so its files live
// under /portal/ (see worker/index.ts for how /portal* and /admin* are served).
export default defineConfig(({ command }) => ({
  base: command === "build" ? "/portal/" : "/",
  plugins: [react(), tailwindcss()],
  build: { outDir: "dist/portal", emptyOutDir: true },
  server: {
    host: true,
    port: 5174,
    strictPort: true,
    allowedHosts: ["test.cbenvironments.com", "localhost"],
    proxy: { "/api": { target: API_DEV_URL } },
  },
  preview: {
    port: 4175,
    allowedHosts: ["test.cbenvironments.com", "localhost"],
  },
}));
