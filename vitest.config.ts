import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    include: ["src/**/*.test.ts"],
    // *.integration.test.ts files share one real Postgres database (no
    // per-test transaction rollback, no per-file schema) and each resets it
    // with a `truncate ... cascade` in beforeEach. Running test FILES in
    // parallel — vitest's default — let two files' truncates race across
    // tables the other was mid-test on, producing deadlocks and cross-file
    // data wipes rather than a real application bug. Sequential file
    // execution is the correct fix for any suite sharing one external
    // resource like this, and at this suite's size the cost is negligible.
    fileParallelism: false,
  },
});
