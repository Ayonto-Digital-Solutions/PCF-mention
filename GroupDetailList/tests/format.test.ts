import { describe, expect, it } from "vitest";
import { interpolate } from "../GroupDetailListControl/utils/format";

describe("interpolate", () => {
	it("places the values the template asks for", () => {
		expect(interpolate("{0} of {1} records", "5", "120")).toBe("5 of 120 records");
	});

	it("lets the template decide the word order", () => {
		expect(interpolate("{1} Datensätze, davon {0} geladen", "5", "120")).toBe(
			"120 Datensätze, davon 5 geladen"
		);
	});

	it("leaves a placeholder alone when no value was passed for it", () => {
		expect(interpolate("{0} of {1}", "5")).toBe("5 of {1}");
	});

	it("returns a template without placeholders unchanged", () => {
		expect(interpolate("No records", "5")).toBe("No records");
	});
});
