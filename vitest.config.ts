import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Only run sources: dist/ holds stale compiled copies of the tests.
    include: ["src/**/*.test.ts"],
    // Database tests share one database and reset it, so files must not run
    // at the same time.
    fileParallelism: false,
  },
});
