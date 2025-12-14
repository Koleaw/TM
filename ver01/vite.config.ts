import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

/**
 * GitHub Pages:
 * - в Actions обычно есть env GITHUB_REPOSITORY="owner/repo"
 * - чтобы роутинг и ассеты работали, base должен быть "/repo/"
 */
function computeBase(): string {
  const repo = process.env.GITHUB_REPOSITORY?.split("/")[1];
  const isGhPages = process.env.GITHUB_PAGES === "true";
  return isGhPages && repo ? `/${repo}/` : "/";
}

export default defineConfig({
  base: computeBase(),
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.svg", "icons/icon-192.png", "icons/icon-512.png"],
      manifest: {
        name: "TM Archangel PWA",
        short_name: "TM",
        description: "Offline-first планирование и хронометраж по Архангельскому",
        start_url: ".",
        scope: ".",
        display: "standalone",
        theme_color: "#0b0f19",
        background_color: "#0b0f19",
        icons: [
          {
            src: "icons/icon-192.png",
            sizes: "192x192",
            type: "image/png"
          },
          {
            src: "icons/icon-512.png",
            sizes: "512x512",
            type: "image/png"
          }
        ]
      }
    })
  ]
});
