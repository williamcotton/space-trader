import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import electron from "vite-plugin-electron/simple";

export default defineConfig({
  plugins: [
    react(),
    electron({
      main: {
        entry: "electron/main.ts",
      },
      preload: {
        input: "electron/preload.ts",
      },
      renderer: {},
    }),
  ],
  test: {
    setupFiles: ["./src/test/setupContent.ts"],
  },
});
