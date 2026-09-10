import { describe, expect, it } from "vitest";
import { interpolate } from "../MentionControl/utils/format";

describe("interpolate", () => {
	it("places the values the template asks for", () => {
		expect(interpolate("{0} characters left", "42")).toBe("42 characters left");
	});

	it("lets the template decide the word order", () => {
		expect(interpolate("noch {0} Zeichen", "42")).toBe("noch 42 Zeichen");
	});

	it("leaves a placeholder alone when no value was passed for it", () => {
		expect(interpolate("{0} of {1}", "5")).toBe("5 of {1}");
	});

	it("returns a template without placeholders unchanged", () => {
		expect(interpolate("No results", "5")).toBe("No results");
	});
});
