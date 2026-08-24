import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  // Проектная страница GitHub Pages живёт в подпапке /hvostoed/, поэтому база не корневая.
  base: "/hvostoed/",
  plugins: [react()],
  server: {
    port: Number(process.env.PORT) || 5173,
    strictPort: Boolean(process.env.PORT),
  },
});
