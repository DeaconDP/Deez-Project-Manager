import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;

// Bind IPv4 loopback so Tauri's health check on http://127.0.0.1:5187 succeeds.
// `host: false` / localhost can listen on ::1 only (Windows), which Tauri never reaches.
const listenHost = host || "127.0.0.1";

// https://vite.dev/config/
export default defineConfig(async () => ({
  plugins: [react()],

  clearScreen: false,
  server: {
    port: 5187,
    strictPort: true,
    host: listenHost,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 5188,
        }
      : {
          protocol: "ws",
          host: "127.0.0.1",
          port: 5187,
        },
    watch: {
      // Polling helps Windows/agent edits reliably trigger HMR in the Tauri webview.
      usePolling: true,
      interval: 300,
      ignored: ["**/src-tauri/**"],
    },
  },
  preview: {
    port: 5187,
    strictPort: true,
    host: "127.0.0.1",
  },
}));
