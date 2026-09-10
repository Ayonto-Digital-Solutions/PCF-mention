import { defineConfig } from "vitest/config";

export default defineConfig({
	esbuild: {
		jsx: "transform",
	},
	test: {
		environment: "jsdom",
		globals: false,
		setupFiles: ["tests/setup.ts"],
		include: ["tests/**/*.test.{ts,tsx}"],
	},
});
