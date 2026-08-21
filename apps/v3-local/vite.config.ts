import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: { host: "127.0.0.1", port: 5300 },
  preview: { host: "127.0.0.1", port: 5301 },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("/node_modules/recharts/") || id.includes("/node_modules/d3-") || id.includes("/node_modules/victory-vendor/")) return "charts";
          if (/\/node_modules\/(react|react-dom|scheduler)\//.test(id)) return "react-core";
          if (/\/node_modules\/(dexie|zustand|zod)\//.test(id)) return "local-data";
          return undefined;
        },
      },
    },
  },
});
