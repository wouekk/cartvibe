import { defineConfig } from "vitest/config";

// Read through `runnerConfig` in angular.json. Coverage instrumentation and a cold start slow the first specs down.
export default defineConfig({
  test: {
    testTimeout: 15000,
    hookTimeout: 30000,
  },
});
