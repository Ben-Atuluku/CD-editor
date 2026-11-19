import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// `base: "./"` keeps the built app relocatable: it works from a folder, a
// static host, or the single-file offline build.
export default defineConfig({
  base: "./",
  plugins: [react()],
  server: {
    host: "0.0.0.0",
    port: 3000,
    strictPort: true,
  },
  preview: {
    host: "0.0.0.0",
    port: 3000,
    strictPort: true,
  },
});
