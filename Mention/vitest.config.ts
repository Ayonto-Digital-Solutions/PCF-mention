import { defineConfig } from "vitest/config";

export default defineConfig({
	esbuild: {
		jsx: "transform",
	},
	test: {
		environment: "happy-dom",
		globals: false,
		include: ["tests/**/*.test.{ts,tsx}"],
	},
});
