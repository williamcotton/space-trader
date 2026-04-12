import type { UserConfig } from "vite";
import react from "@vitejs/plugin-react";
import electron from "vite-plugin-electron/simple";

type VitestConfig = {
  test: {
    setupFiles: string[];
  };
};

const config = {
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
} satisfies UserConfig & VitestConfig;

export default config;
