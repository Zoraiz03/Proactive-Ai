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
  const apiBaseUrl = process.env.DESKTOP_API_BASE_URL ??
    desktopEnvironment.DESKTOP_API_BASE_URL ??
    webEnvironment.NEXT_PUBLIC_APP_URL ??
    (mode === "development" ? "http://127.0.0.1:3000" : "");
  const chromeExtensionOrigin = process.env.DESKTOP_CHROME_EXTENSION_ORIGIN ??
    desktopEnvironment.DESKTOP_CHROME_EXTENSION_ORIGIN ?? "";

  return {
    main: {
      plugins: [externalizeDepsPlugin()],
      define: {
        __DESKTOP_SUPABASE_URL__: JSON.stringify(supabaseUrl),
        __DESKTOP_SUPABASE_PUBLISHABLE_KEY__: JSON.stringify(publishableKey),
        __DESKTOP_API_BASE_URL__: JSON.stringify(apiBaseUrl),
        __DESKTOP_CHROME_EXTENSION_ORIGIN__: JSON.stringify(chromeExtensionOrigin),
      },
    },
    preload: {
      plugins: [externalizeDepsPlugin()],
    },
    renderer: {
      root: resolve("src/renderer"),
      plugins: [react()],
      server: {
        fs: {
          allow: [resolve("../..")],
        },
      },
    },
  };
});
