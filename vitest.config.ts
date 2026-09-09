import { defineConfig } from "vitest/config";

// Kept separate from vite.config.ts so the build config stays untouched.
export default defineConfig({
  test: {
    environment: "node",
    // functions/src is included for claimsPolicy: the rule that a
    // client-writable mirror can never grant tenant access is worth
    // pinning, and that module imports nothing so it needs no emulator.
    include: [
      "src/**/*.test.ts",
      "src/**/*.test.tsx",
      "functions/src/**/*.test.ts",
    ],
  },
});
