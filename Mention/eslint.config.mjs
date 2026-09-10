import eslintjs from "@eslint/js";
import microsoftPowerApps from "@microsoft/eslint-plugin-power-apps";
import pluginPromise from "eslint-plugin-promise";
import reactPlugin from "eslint-plugin-react";
import reactHooksPlugin from "eslint-plugin-react-hooks";
import globals from "globals";
import typescriptEslint from "typescript-eslint";

/** @type {import('eslint').Linter.Config[]} */
export default [
	{
		// The flat config itself is not part of the TypeScript project the type-aware rules need.
		ignores: ["**/generated", "out/**", "node_modules/**", "eslint.config.mjs"],
	},
	eslintjs.configs.recommended,
	...typescriptEslint.configs.recommendedTypeChecked,
	...typescriptEslint.configs.stylisticTypeChecked,
	pluginPromise.configs["flat/recommended"],
	microsoftPowerApps.configs.paCheckerHosted,
	reactPlugin.configs.flat.recommended,
	{
		plugins: {
			"@microsoft/power-apps": microsoftPowerApps,
			"react-hooks": reactHooksPlugin,
		},

		languageOptions: {
			globals: {
				...globals.browser,
				ComponentFramework: true,
			},
			parserOptions: {
				ecmaVersion: 2020,
				sourceType: "module",
				projectService: true,
				tsconfigRootDir: import.meta.dirname,
			},
		},

		settings: {
			react: {
				version: "16.14",
			},
		},

		rules: {
			...reactHooksPlugin.configs.recommended.rules,
		},
	},
];
