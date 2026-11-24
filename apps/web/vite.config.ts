/// <reference types="vitest" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

// @nivo/shared's root entry re-exports node:crypto helpers (server-only).
// In the browser we alias it to a shim that only re-exports isomorphic modules.
const sharedShim = fileURLToPath(new URL("./src/lib/shared.ts", import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: [{ find: /^@nivo\/shared$/, replacement: sharedShim }],
  },
  server: { port: 5173 },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
    css: false,
  },
});
