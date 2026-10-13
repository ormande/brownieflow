import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "prompt",
      includeAssets: ["icon.svg", "icon-192.png", "icon-512.png"],
      manifest: {
        name: "BrownieFlow — Gestão de brownies",
        short_name: "BrownieFlow",
        description: "Vendas, produção e finanças em um só lugar.",
        lang: "pt-BR",
        start_url: "/",
        display: "standalone",
        background_color: "#f6f8fa",
        theme_color: "#087f5b",
        icons: [
          { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
          {
            src: "/icon-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any maskable",
          },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png,woff2}"],
        navigateFallbackDenylist: [/^\/auth\//],
        runtimeCaching: [],
        maximumFileSizeToCacheInBytes: 3000000,
      },
    }),
  ],
  build: {
    rollupOptions: {
      output: {
        manualChunks: (id: string) => {
          if (id.includes("/recharts/") || id.includes("/d3-")) return "charts";
          if (id.includes("/@supabase/")) return "supabase";
        },
      },
    },
  },
});
