import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // Live Jev eval stays out of unit tests (see eval/run-eval.ts).
    exclude: ["node_modules", "eval/**"],
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, ".") },
  },
});
