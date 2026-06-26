import { defineConfig } from "vitest/config";

// Dedicated test config. We intentionally do NOT reuse vite.config.ts here: its
// Cloudflare + TanStack Start plugins assume a dev/SSR environment and break
// Vitest's runner ("depsOptimizer is required in dev mode"). Unit tests target
// pure modules (e.g. src/lib/**), so a plain node environment is all we need.
export default defineConfig({
	test: {
		environment: "node",
		include: ["src/**/*.test.ts"],
	},
});
