import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: [
      "packages/*/test/**/*.test.ts",
      "packages/qi-rewind/test/**/*.test.ts",
      "packages/qi-bash-bg/**/*.test.ts",
    ],
    exclude: ["**/node_modules/**"],
  },
});
