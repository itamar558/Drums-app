import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.drumless.app",
  appName: "Drumless",
  webDir: "dist",
  android: {
    allowMixedContent: false,
  },
};

export default config;
