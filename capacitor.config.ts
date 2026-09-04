import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Thin native shell around the same Vite `dist/` the PWA uses.
 * Not a second product — phone UI stays the React app (browser runtime).
 */
const config: CapacitorConfig = {
  appId: "io.worldbuild.deez",
  appName: "Deez PM",
  webDir: "dist",
  server: {
    androidScheme: "https",
  },
  ios: {
    contentInset: "automatic",
    preferredContentMode: "mobile",
  },
  android: {
    allowMixedContent: true,
  },
};

export default config;
