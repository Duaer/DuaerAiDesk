import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: "node",
    include: ["server/test/**/*.test.ts", "web/test/**/*.test.{ts,tsx}"],
    testTimeout: 20000,
    hookTimeout: 20000,
  },
});
