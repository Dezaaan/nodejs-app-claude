import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Only run sources: dist/ holds stale compiled copies of the tests.
    include: ["src/**/*.test.ts"],
  },
});
