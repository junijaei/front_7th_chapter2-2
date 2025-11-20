import { defineConfig } from "vite";

export default defineConfig(({ mode }) => ({
  base: mode === "production" ? "/front_7th_chapter2-1/" : "/",
}));
