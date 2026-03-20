import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          // ── Vendor chunks (loaded in parallel by browser) ──
          "vendor-react": [
            "react",
            "react-dom",
            "react-router-dom",
          ],
          "vendor-query": [
            "@tanstack/react-query",
          ],
          "vendor-supabase": [
            "@supabase/supabase-js",
          ],
          "vendor-charts": [
            "recharts",
          ],
          "vendor-map": [
            "leaflet",
            "react-leaflet",
          ],
          "vendor-icons": [
            "lucide-react",
          ],
        },
      },
    },
  },
});
