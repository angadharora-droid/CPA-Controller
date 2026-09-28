import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

/* Every production build gets its own id. The page sends it with each API call, and the server — which
   reads the same id from dist/version.json — refuses calls from any other build. A page left open from
   before a deploy therefore blanks itself and asks for a refresh instead of saving its old copy. */
const BUILD_ID = new Date().toISOString();

export default defineConfig(({ command }) => ({
  plugins: [
    react(),
    {
      name: "build-id",
      apply: "build",
      generateBundle() {
        this.emitFile({ type: "asset", fileName: "version.json", source: JSON.stringify({ version: BUILD_ID }) });
      },
    },
  ],
  define: { __APP_VERSION__: JSON.stringify(command === "build" ? BUILD_ID : "dev") },
  base: "./",
  server: {
    proxy: {
      "/api": "http://localhost:5000",
    },
  },
}));
