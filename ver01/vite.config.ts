import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

/**
 * GitHub Pages base:
 * - на Actions почти всегда нужно "/repo/"
 * - локально "/"
 */
function computeBase(): string {
  const repo = process.env.GITHUB_REPOSITORY?.split("/")[1];
  const isGh = process.env.GITHUB_PAGES === "true" || process.env.GITHUB_ACTIONS === "true";
  return isGh && repo ? `/${repo}/` : "/";
}

export default defineConfig({
  base: computeBase(),
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      manifest: {
        name: "TM Archangel",
        short_name: "TM",
        description: "Планирование и хронометраж (Архангельский)",
        start_url: ".",
        scope: ".",
        display: "standalone",
        theme_color: "#0b0f19",
        background_color: "#0b0f19"
      }
    })
  ]
});
