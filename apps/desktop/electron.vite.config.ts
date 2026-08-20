import { resolve } from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig, externalizeDepsPlugin, loadEnv } from "electron-vite";

export default defineConfig(({ mode }) => {
  const desktopEnvironment = loadEnv(mode, process.cwd(), "");
  const webEnvironment = loadEnv(mode, resolve(process.cwd(), "../.."), "");
  const supabaseUrl = process.env.DESKTOP_SUPABASE_URL ??
    desktopEnvironment.DESKTOP_SUPABASE_URL ?? webEnvironment.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const publishableKey = process.env.DESKTOP_SUPABASE_PUBLISHABLE_KEY ??
    desktopEnvironment.DESKTOP_SUPABASE_PUBLISHABLE_KEY ??
    webEnvironment.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    webEnvironment.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

  return {
    main: {
      plugins: [externalizeDepsPlugin()],
      define: {
        __DESKTOP_SUPABASE_URL__: JSON.stringify(supabaseUrl),
        __DESKTOP_SUPABASE_PUBLISHABLE_KEY__: JSON.stringify(publishableKey),
      },
    },
    preload: {
      plugins: [externalizeDepsPlugin()],
    },
    renderer: {
      root: resolve("src/renderer"),
      plugins: [react()],
    },
  };
});
